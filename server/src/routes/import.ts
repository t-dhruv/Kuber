/**
 * import.ts
 * Smart bank statement import — CSV and PDF.
 * Routes:
 *   POST /api/v1/import/parse      — upload file, detect bank, parse, dedup-flag
 *   POST /api/v1/import/confirm    — bulk-create accepted rows
 *   GET  /api/v1/import/history    — paginated import log
 *   POST /api/v1/import/webhook    — n8n/automation webhook (same contract as parse+confirm)
 */

import { Router } from 'express';
import multer from 'multer';
import { createCheckpoint } from '../lib/checkpoint.js';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { AuthRequest } from '../middleware/auth.js';
import { detectBankFormat, mapRowToTransaction } from '../lib/bankFormats.js';
import { computeDedupHash, markDuplicates } from '../lib/importDedup.js';
import { parsePdfStatement } from '../lib/pdfParser.js';
import { parseDate } from '../lib/dateUtils.js';
import { detectColumnMapping } from '../lib/csvColumnDetector.js';
import { detectLocaleFormat, parseAmount, mergeDebitCredit } from '../lib/amountParser.js';
import { transactionsImportedTotal } from '../lib/metrics.js';
import { createJournalFromLegacyTransaction, getVirtualAccountsByType } from '../lib/legacyToJournalMigration.js';

const router = Router();

// Multer: accept CSV and PDF, 20 MB limit
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    // Check by extension only — browsers/OS send inconsistent MIME types for CSV
    // (e.g. application/vnd.ms-excel, application/csv, text/plain are all valid CSV)
    const ext = file.originalname.split('.').pop()?.toLowerCase();
    const validExt = ext === 'csv' || ext === 'pdf';
    if (validExt) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV and PDF files are accepted'));
    }
  },
});

// ---------------------------------------------------------------------------
// CSV parser (mirrors transactions.ts — handles quoted fields)
// ---------------------------------------------------------------------------
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') { field += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { field += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ',') { row.push(field); field = ''; }
      else if (ch === '\n' || (ch === '\r' && next === '\n')) {
        if (ch === '\r') i++;
        row.push(field); field = '';
        if (row.some((c) => c.trim())) rows.push(row);
        row = [];
      } else if (ch === '\r') {
        row.push(field); field = '';
        if (row.some((c) => c.trim())) rows.push(row);
        row = [];
      } else { field += ch; }
    }
  }
  if (field || row.length > 0) { row.push(field); if (row.some((c) => c.trim())) rows.push(row); }
  return rows;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

interface ParsedRow {
  date: string;
  description: string;
  amount: number;
  reference?: string;
  hash: string;
  isDuplicate: boolean;
  status: 'new' | 'duplicate' | 'invalid';
  error?: string;
  investmentType?: InvestmentRowType;
  ticker?: string | null;
}

async function parseUploadedFile(
  buffer: Buffer,
  filename: string,
  accountId: string,
  householdId: string,
  accountType?: string
): Promise<{ rows: ParsedRow[]; bankSource: string; confidence: number; totalRows: number }> {
  const isPdf = filename.toLowerCase().endsWith('.pdf');

  let rawRows: Array<{ date: string; description: string; amount: number; reference?: string }> = [];
  let bankSource = 'generic';
  let confidence = 0;

  if (isPdf) {
    const result = await parsePdfStatement(buffer);
    if (result.method === 'failed') {
      throw new Error(result.error ?? 'PDF parsing failed');
    }
    rawRows = result.rows;
    bankSource = 'pdf-extracted';
    confidence = rawRows.length > 0 ? 0.7 : 0;
  } else {
    // CSV parsing using minimal built-in parser
    const text = buffer.toString('utf-8').replace(/^\uFEFF/, ''); // strip BOM
    const allRows = parseCSV(text);
    if (allRows.length < 2) return { rows: [], bankSource: 'generic', confidence: 0, totalRows: 0 };

    const headers = allRows[0].map((h) => h.trim());
    const dataRows = allRows.slice(1).filter((r) => r.some((c) => c.trim()));

    const detected = detectBankFormat(headers);
    bankSource = detected.format.id;
    confidence = detected.confidence;

    for (const row of dataRows) {
      const record: Record<string, string> = {};
      headers.forEach((h, i) => { record[h] = row[i] ?? ''; });
      const mapped = mapRowToTransaction(record, detected.format);
      if (mapped) rawRows.push(mapped);
    }
  }

  const totalRows = rawRows.length;

  // Build hashes
  const withHashes = rawRows.map((row) => ({
    ...row,
    hash: computeDedupHash(row.date, row.description, row.amount),
  }));

  // Fetch existing hashes for this account and compute dedup set
  const existingTxns = await prisma.transaction.findMany({
    where: { accountId, householdId, isHidden: false },
    select: { date: true, description: true, amount: true },
  });

  const existingHashes = new Set(
    existingTxns.map((t) =>
      computeDedupHash(t.date.toISOString().slice(0, 10), t.description, t.amount)
    )
  );

  type RawWithHash = { date: string; description: string; amount: number; reference?: string; hash: string };
  const dedupedRows = markDuplicates(withHashes, existingHashes) as Array<RawWithHash & { isDuplicate: boolean }>;

  // Parse dates and mark invalid rows
  const finalRows: ParsedRow[] = dedupedRows.map((row) => {
    const parsedDate = parseDate(row.date);
    if (!parsedDate) {
      return {
        date: row.date,
        description: row.description,
        amount: row.amount,
        reference: row.reference,
        hash: row.hash,
        isDuplicate: false,
        status: 'invalid' as const,
        error: `Cannot parse date: ${row.date}`,
      };
    }
    const base: ParsedRow = {
      date: parsedDate,
      description: row.description,
      amount: row.amount,
      reference: row.reference,
      hash: row.hash,
      isDuplicate: row.isDuplicate,
      status: row.isDuplicate ? ('duplicate' as const) : ('new' as const),
    };
    if (accountType === 'investment') {
      base.investmentType = detectInvestmentType(row.description, row.amount);
      base.ticker = extractTicker(row.description);
    }
    return base;
  });

  return { rows: finalRows, bankSource, confidence, totalRows };
}

// ---------------------------------------------------------------------------
// Investment row type detection
// ---------------------------------------------------------------------------
type InvestmentRowType = 'buy' | 'sell' | 'dividend' | 'transfer' | 'fee' | 'other';

function detectInvestmentType(description: string, amount: number): InvestmentRowType {
  const d = description.toLowerCase();
  if (/\bbuy\b|purchase|bought/.test(d) || (amount < 0 && /shares?|units?/.test(d))) return 'buy';
  if (/\bsell\b|sold|proceeds/.test(d) || (amount > 0 && /shares?|units?/.test(d))) return 'sell';
  if (/dividend|dist(ribution)?|reinvest/.test(d)) return 'dividend';
  if (/transfer|deposit|withdrawal/.test(d)) return 'transfer';
  if (/fee|commission|expense|mgmt/.test(d)) return 'fee';
  return 'other';
}

// Simple ticker extraction from description (e.g. "BUY 10 VFV.TO @ $120.00" → "VFV.TO")
function extractTicker(description: string): string | null {
  const match = description.match(/\b([A-Z]{1,5}(?:\.[A-Z]{1,2})?)\b/);
  return match?.[1] ?? null;
}

// ---------------------------------------------------------------------------
// Category suggestion via rules
// ---------------------------------------------------------------------------

type RuleCondition = { field: 'merchantName' | 'description' | 'amount'; operator: 'contains' | 'equals' | 'startsWith' | 'endsWith' | 'gt' | 'lt' | 'gte' | 'lte'; value: string | number };
type RuleAction    = { type: 'setCategory' | 'addTag' | 'hide' | 'markReviewed'; value?: string };

function evalRuleCond(cond: RuleCondition, tx: { description: string; amount: number }): boolean {
  if (cond.field === 'amount') {
    const n = tx.amount;
    const v = typeof cond.value === 'number' ? cond.value : parseFloat(cond.value as string);
    switch (cond.operator) {
      case 'equals': return n === v;
      case 'gt': return n > v;
      case 'lt': return n < v;
      case 'gte': return n >= v;
      case 'lte': return n <= v;
      default: return false;
    }
  } else {
    const s = tx.description.toLowerCase();
    const v = String(cond.value).toLowerCase();
    switch (cond.operator) {
      case 'contains': return s.includes(v);
      case 'equals': return s === v;
      case 'startsWith': return s.startsWith(v);
      case 'endsWith': return s.endsWith(v);
      default: return false;
    }
  }
}

async function suggestCategoriesForRows(
  rows: ParsedRow[],
  householdId: string
): Promise<Map<string, { categoryId: string; categoryName: string } | null>> {
  const [rules, categories] = await Promise.all([
    prisma.rule.findMany({ where: { householdId, isActive: true }, orderBy: { sortOrder: 'asc' } }),
    prisma.category.findMany({ where: { householdId }, select: { id: true, name: true } }),
  ]);

  const catMap = new Map(categories.map((c) => [c.id, c.name]));

  const activeRules = rules
    .map((r) => ({ conditions: r.conditions as RuleCondition[], actions: r.actions as RuleAction[] }))
    .filter((r) => r.actions.some((a) => a.type === 'setCategory' && a.value));

  const result = new Map<string, { categoryId: string; categoryName: string } | null>();

  for (const row of rows) {
    if (row.status !== 'new') { result.set(row.hash, null); continue; }
    let matched: { categoryId: string; categoryName: string } | null = null;
    for (const rule of activeRules) {
      const tx = { description: row.description, amount: row.amount };
      if (rule.conditions.every((c) => evalRuleCond(c, tx))) {
        const action = rule.actions.find((a) => a.type === 'setCategory' && a.value);
        if (action?.value) {
          matched = { categoryId: action.value, categoryName: catMap.get(action.value) ?? 'Unknown' };
          break;
        }
      }
    }
    result.set(row.hash, matched);
  }

  return result;
}

// ---------------------------------------------------------------------------
// POST /api/v1/import/detect-mapping
// Upload CSV → fuzzy-detect column mapping → return mapping + sample rows
// No DB writes. Used by the UI mapping confirmation step.
// ---------------------------------------------------------------------------
router.post('/detect-mapping', upload.single('file'), async (req: AuthRequest, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const ext = req.file.originalname.split('.').pop()?.toLowerCase();
  if (ext !== 'csv') return res.status(400).json({ error: 'Only CSV files are supported for mapping detection' });

  try {
    const text = req.file.buffer.toString('utf-8');
    const rows = parseCSV(text);
    if (rows.length < 2) return res.status(400).json({ error: 'CSV must have at least a header row and one data row' });

    const headers = rows[0];
    const sampleRows = rows.slice(1, 6); // up to 5 data rows for preview

    // Fuzzy column detection
    const detection = detectColumnMapping(headers);

    // Detect amount locale from amount/debit/credit column samples
    const amountField = detection.mappings.find((m) => m.field === 'amount' || m.field === 'debit' || m.field === 'credit');
    const amountSamples = amountField
      ? sampleRows.map((r) => r[headers.indexOf(amountField.csvHeader)] ?? '').filter(Boolean)
      : [];
    const localeFormat = detectLocaleFormat(amountSamples);

    // Parse sample rows using detected mapping
    const dateField = detection.mappings.find((m) => m.field === 'date');
    const descField = detection.mappings.find((m) => m.field === 'description');
    const debitField = detection.mappings.find((m) => m.field === 'debit');
    const creditField = detection.mappings.find((m) => m.field === 'credit');
    const singleAmtField = detection.mappings.find((m) => m.field === 'amount');

    const preview = sampleRows.map((row) => {
      const get = (header: string) => row[headers.indexOf(header)] ?? '';

      const rawDate = dateField ? get(dateField.csvHeader) : '';
      const description = descField ? get(descField.csvHeader) : '';

      let amount: number | null = null;
      if (detection.amountStrategy === 'debit-credit' && (debitField || creditField)) {
        amount = mergeDebitCredit(
          debitField ? get(debitField.csvHeader) : '',
          creditField ? get(creditField.csvHeader) : '',
          localeFormat,
        );
      } else if (singleAmtField) {
        amount = parseAmount(get(singleAmtField.csvHeader), localeFormat);
      }

      return {
        rawDate,
        parsedDate: rawDate ? parseDate(rawDate) : null,
        description,
        amount,
      };
    });

    return res.json({
      headers,
      mappings: detection.mappings,
      unmapped: detection.unmapped,
      amountStrategy: detection.amountStrategy,
      localeFormat,
      preview,
    });
  } catch (err) {
    req.log.error({ err }, 'import/detect-mapping');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/v1/import/parse-with-mapping
// Upload CSV + confirmed column mapping → parse all rows → dedup flag → preview
// Used after the user has confirmed/adjusted the mapping from /detect-mapping.
// ---------------------------------------------------------------------------
const ParseWithMappingSchema = z.object({
  accountId: z.string(),
  dateColumn: z.string(),
  descriptionColumn: z.string(),
  descriptionColumn2: z.string().optional(),
  descriptionSeparator: z.string().max(20).optional(),
  amountStrategy: z.enum(['single', 'debit-credit']),
  amountColumn: z.string().optional(),
  debitColumn: z.string().optional(),
  creditColumn: z.string().optional(),
  localeFormat: z.enum(['us', 'eu']).default('us'),
});

router.post('/parse-with-mapping', upload.single('file'), async (req: AuthRequest, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const parsed = ParseWithMappingSchema.safeParse(
    typeof req.body === 'string' ? JSON.parse(req.body) : req.body,
  );
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });

  const { accountId, dateColumn, descriptionColumn, descriptionColumn2, descriptionSeparator, amountStrategy, amountColumn, debitColumn, creditColumn, localeFormat } = parsed.data;

  try {
    const account = await prisma.account.findFirst({
      where: { id: accountId, householdId: req.householdId! },
    });
    if (!account) return res.status(404).json({ error: 'Account not found' });

    const text = req.file.buffer.toString('utf-8');
    const rows = parseCSV(text);
    if (rows.length < 2) return res.status(400).json({ error: 'CSV must have at least one data row' });

    const headers = rows[0];
    const dataRows = rows.slice(1);

    // Fetch existing transactions for dedup (recompute hash from date+desc+amount)
    const existingTxns = await prisma.transaction.findMany({
      where: { accountId, householdId: req.householdId!, isHidden: false },
      select: { date: true, description: true, amount: true },
    });
    const hashSet = new Set(
      existingTxns.map((t) =>
        computeDedupHash(t.date.toISOString().slice(0, 10), t.description, t.amount)
      )
    );

    const get = (row: string[], colName: string) => row[headers.indexOf(colName)] ?? '';

    const parsedRows = dataRows.map((row) => {
      const rawDate = get(row, dateColumn);
      const part1 = get(row, descriptionColumn).trim();
      const part2 = descriptionColumn2 ? get(row, descriptionColumn2).trim() : '';
      const separator = descriptionSeparator ?? ' – ';
      const description = part2 ? `${part1}${separator}${part2}` : part1;
      const parsedDate = rawDate ? parseDate(rawDate) : null;

      let amount: number | null = null;
      if (amountStrategy === 'debit-credit') {
        amount = mergeDebitCredit(
          debitColumn ? get(row, debitColumn) : '',
          creditColumn ? get(row, creditColumn) : '',
          localeFormat,
        );
      } else if (amountColumn) {
        amount = parseAmount(get(row, amountColumn), localeFormat);
      }

      if (!parsedDate || !description || amount === null || isNaN(amount)) {
        return { status: 'invalid' as const, rawDate, description, amount: amount ?? 0, hash: '', date: rawDate };
      }

      const hash = computeDedupHash(parsedDate, description, amount);
      const status = hashSet.has(hash) ? 'duplicate' as const : 'new' as const;

      return { status, date: parsedDate, description, amount, hash };
    });

    const newCount = parsedRows.filter((r) => r.status === 'new').length;
    const dupCount = parsedRows.filter((r) => r.status === 'duplicate').length;
    const invalidCount = parsedRows.filter((r) => r.status === 'invalid').length;

    const capped = parsedRows.slice(0, 200) as ParsedRow[];
    const suggestions = await suggestCategoriesForRows(capped, req.householdId!);
    const rowsWithSuggestions = capped.map((r) => {
      const s = suggestions.get(r.hash);
      return s ? { ...r, suggestedCategoryId: s.categoryId, suggestedCategoryName: s.categoryName } : r;
    });

    return res.json({
      bankSource: 'custom-mapping',
      confidence: 100,
      totalRows: dataRows.length,
      newCount,
      dupCount,
      invalidCount,
      rows: rowsWithSuggestions,
    });
  } catch (err) {
    req.log.error({ err }, 'import/parse-with-mapping');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/v1/import/parse
// Upload file → detect format → parse → dedup flag → return preview
// ---------------------------------------------------------------------------
router.post('/parse', upload.single('file'), async (req: AuthRequest, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const accountId = req.body.accountId as string;
    if (!accountId) return res.status(400).json({ error: 'accountId is required' });

    // Verify account belongs to household
    const account = await prisma.account.findFirst({
      where: { id: accountId, householdId: req.householdId! },
    });
    if (!account) return res.status(404).json({ error: 'Account not found' });

    const { rows, bankSource, confidence, totalRows } = await parseUploadedFile(
      req.file.buffer,
      req.file.originalname,
      accountId,
      req.householdId!,
      account.type
    );

    const newCount = rows.filter((r) => r.status === 'new').length;
    const dupCount = rows.filter((r) => r.status === 'duplicate').length;
    const invalidCount = rows.filter((r) => r.status === 'invalid').length;

    const capped = rows.slice(0, 200);
    const suggestions = await suggestCategoriesForRows(capped, req.householdId!);
    const rowsWithSuggestions = capped.map((r) => {
      const s = suggestions.get(r.hash);
      return s ? { ...r, suggestedCategoryId: s.categoryId, suggestedCategoryName: s.categoryName } : r;
    });

    return res.json({
      bankSource,
      confidence: Math.round(confidence * 100),
      totalRows,
      newCount,
      dupCount,
      invalidCount,
      rows: rowsWithSuggestions,
    });
  } catch (err) {
    req.log.error({ err }, 'Import parse error');
    const msg = err instanceof Error ? err.message : 'Parse failed';
    // Pass through user-facing messages; suppress internal details like file paths or stack traces
    const safeMsg = /^(PDF|Only|Cannot parse|Failed to|No rows|Unsupported)/i.test(msg)
      ? msg
      : 'Failed to parse file. Check the format and try again.';
    return res.status(422).json({ error: safeMsg });
  }
});

// ---------------------------------------------------------------------------
// POST /api/v1/import/confirm
// Accept selected rows and bulk-create transactions
// ---------------------------------------------------------------------------
const ConfirmRowSchema = z.object({
  date: z.string(),
  description: z.string(),
  amount: z.number(),
  hash: z.string(),
  categoryId: z.string().optional(),
  notes: z.string().optional(),
  investmentType: z.enum(['buy', 'sell', 'dividend', 'transfer', 'fee', 'other']).optional(),
  ticker: z.string().nullable().optional(),
  shares: z.number().optional(),
  pricePerShare: z.number().optional(),
});

const ConfirmSchema = z.object({
  accountId: z.string(),
  rows: z.array(ConfirmRowSchema).max(5000, 'Cannot import more than 5000 rows at once'),
  filename: z.string().max(255).optional(),
  bankSource: z.string().max(50).optional(),
  batchId: z.string().max(64).optional(),
});

router.post('/confirm', async (req: AuthRequest, res) => {
  try {
    const body = ConfirmSchema.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: body.error.flatten() });

    const { accountId, rows, filename, bankSource, batchId } = body.data;

    const account = await prisma.account.findFirst({
      where: { id: accountId, householdId: req.householdId! },
    });
    if (!account) return res.status(404).json({ error: 'Account not found' });

    // Pre-load categories for matching
    const categories = await prisma.category.findMany({
      where: { householdId: req.householdId! },
      select: { id: true, name: true },
    });
    const categoryMap = new Map(categories.map((c) => [c.name.toLowerCase(), c.id]));

    // Pre-load existing merchants to avoid N+1 inside transaction
    const existingMerchants = await prisma.merchant.findMany({
      where: { householdId: req.householdId! },
      select: { id: true, name: true },
    });
    const merchantCache = new Map(existingMerchants.map((m) => [m.name.toLowerCase(), m.id]));

    let imported = 0;
    let skipped = 0;
    let importedAmountSum = 0;
    const errors: Array<{ index: number; error: string }> = [];

    const isInvestmentAccount = account.type === 'investment';

    await prisma.$transaction(async (tx) => {
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        try {
          // Anchor to noon UTC to avoid timezone off-by-one-day issues
          const rawDate = /^\d{4}-\d{2}-\d{2}$/.test(row.date)
            ? row.date + 'T12:00:00.000Z'
            : row.date;
          const txDate = new Date(rawDate);
          if (isNaN(txDate.getTime())) {
            errors.push({ index: i, error: `Invalid date: ${row.date}` });
            skipped++;
            continue;
          }

          if (isInvestmentAccount && (row.investmentType === 'buy' || row.investmentType === 'sell')) {
            // ── Investment buy/sell: upsert holding + create lot ──────────────
            const ticker = row.ticker ?? extractTicker(row.description) ?? 'UNKNOWN';
            const isBuy = row.investmentType === 'buy';
            const shareDelta = row.shares ?? 1; // fallback: 1 share if not specified
            const price = row.pricePerShare ?? Math.abs(row.amount) / shareDelta;

            let holding = await tx.investmentHolding.findFirst({
              where: { accountId, symbol: ticker },
            });

            if (!holding) {
              holding = await tx.investmentHolding.create({
                data: {
                  accountId,
                  symbol: ticker,
                  name: ticker,
                  shares: 0,
                  costBasis: 0,
                  currentPrice: price,
                },
              });
            }

            const newShares = isBuy ? holding.shares + shareDelta : holding.shares - shareDelta;
            const newCostBasis = isBuy
              ? holding.costBasis + shareDelta * price
              : holding.costBasis - (holding.shares > 0 ? (shareDelta / holding.shares) * holding.costBasis : 0);

            await tx.investmentHolding.update({
              where: { id: holding.id },
              data: {
                shares: Math.max(0, newShares),
                costBasis: Math.max(0, newCostBasis),
                currentPrice: price,
              },
            });

            await tx.holdingLot.create({
              data: {
                holdingId: holding.id,
                date: txDate,
                shares: isBuy ? shareDelta : -shareDelta,
                pricePerShare: price,
                note: [row.description, batchId ? `[batch:${batchId}]` : null].filter(Boolean).join(' '),
                status: 'confirmed',
              },
            });
          }

          // Always create a transaction record (for cash flow tracking regardless of type)
          // Resolve category
          let resolvedCategoryId = row.categoryId ?? null;
          if (!resolvedCategoryId) {
            const descLower = row.description.toLowerCase();
            for (const [name, id] of categoryMap) {
              if (descLower.includes(name)) {
                resolvedCategoryId = id;
                break;
              }
            }
          }

          // Resolve merchant from pre-loaded cache — create only if genuinely new
          const merchantName = row.description.split(/[#\d]/)[0].trim();
          const merchantKey = merchantName.toLowerCase();
          let merchantId: string | null = merchantCache.get(merchantKey) ?? null;
          if (!merchantId && merchantName.length > 2) {
            const created = await tx.merchant.create({
              data: { householdId: req.householdId!, name: merchantName, displayName: merchantName },
            });
            merchantId = created.id;
            merchantCache.set(merchantKey, merchantId);
          }

          const batchNote = batchId ? `[batch:${batchId}]` : null;
          const notes = [row.notes, batchNote].filter(Boolean).join(' ') || null;

          // Get virtual accounts for journal creation (cache after first lookup)
          const virtualAccounts = await getVirtualAccountsByType(req.householdId!);
          if (!virtualAccounts.expenseAccountId || !virtualAccounts.revenueAccountId) {
            throw new Error('Missing virtual accounts for import');
          }

          // Create journal instead of legacy transaction
          const meta: Record<string, string> = {};
          if (merchantId) meta.legacyMerchantId = merchantId;
          if (bankSource) meta.bankSource = bankSource;
          if (batchId) meta.batchId = batchId;

          await createJournalFromLegacyTransaction(
            tx,
            {
              householdId: req.householdId!,
              accountId,
              date: txDate,
              description: row.description,
              amount: row.amount,
              categoryId: resolvedCategoryId ?? undefined,
              notes: notes ?? undefined,
            },
            row.amount < 0 ? (virtualAccounts.expenseAccountId ?? '') : undefined,
            row.amount > 0 ? (virtualAccounts.revenueAccountId ?? '') : undefined,
          );

          importedAmountSum += row.amount;
          imported++;
        } catch (err) {
          errors.push({ index: i, error: err instanceof Error ? err.message : 'Unknown error' });
          skipped++;
        }
      }
    });

    // Update account running balance with sum of imported transaction amounts
    if (imported > 0) {
      await prisma.account.update({
        where: { id: accountId },
        data: { balance: { increment: importedAmountSum } },
      });
    }

    // Create rollback checkpoint
    if (imported > 0) {
      // We need the IDs of newly created transactions — re-query by hash match or by createdAt
      // Simplest: query transactions created in the last few seconds for this account
      const recentIds = await prisma.transaction.findMany({
        where: { accountId, householdId: req.householdId!, createdAt: { gte: new Date(Date.now() - 10_000) } },
        select: { id: true },
      });
      await createCheckpoint(
        prisma,
        req.householdId!,
        'bulk-import',
        `Imported ${imported} rows from ${filename ?? 'unknown'}`,
        recentIds.map((t) => t.id)
      );
    }

    // Record import history
    await prisma.importHistory.create({
      data: {
        householdId: req.householdId!,
        filename: filename ?? 'unknown',
        bankSource: bankSource ?? 'generic',
        rowsTotal: rows.length,
        rowsImported: imported,
        rowsDuplicate: 0,
        rowsSkipped: skipped,
        status: errors.length > 0 ? 'partial' : 'completed',
      },
    });

    if (imported > 0) {
      transactionsImportedTotal.inc({ household_id: req.householdId!, source: bankSource ?? 'generic' });
    }

    return res.json({ imported, skipped, errors });
  } catch (err) {
    req.log.error({ err }, 'Import confirm error');
    return res.status(500).json({ error: 'Import failed' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/v1/import/history
// ---------------------------------------------------------------------------
router.get('/history', async (req: AuthRequest, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      prisma.importHistory.findMany({
        where: { householdId: req.householdId! },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.importHistory.count({ where: { householdId: req.householdId! } }),
    ]);

    return res.json({ items, total, page, limit });
  } catch (err) {
    req.log.error({ err }, 'Import history error');
    return res.status(500).json({ error: 'Failed to fetch import history' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/v1/import/webhook
// n8n / automation webhook — accepts pre-parsed JSON payload
// ---------------------------------------------------------------------------
const WebhookRowSchema = z.object({
  date: z.string(),
  description: z.string(),
  amount: z.number(),
  reference: z.string().optional(),
});

const WebhookSchema = z.object({
  accountId: z.string(),
  source: z.string().max(50).optional(),
  transactions: z.array(WebhookRowSchema).max(5000, 'Cannot import more than 5000 rows at once'),
});

router.post('/webhook', async (req: AuthRequest, res) => {
  try {
    const body = WebhookSchema.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: body.error.flatten() });

    const { accountId, source, transactions } = body.data;

    const account = await prisma.account.findFirst({
      where: { id: accountId, householdId: req.householdId! },
    });
    if (!account) return res.status(404).json({ error: 'Account not found' });

    // Dedup check
    const existingTxns = await prisma.transaction.findMany({
      where: { accountId, householdId: req.householdId!, isHidden: false },
      select: { date: true, description: true, amount: true },
    });
    const existingHashes = new Set(
      existingTxns.map((t) =>
        computeDedupHash(t.date.toISOString().slice(0, 10), t.description, t.amount)
      )
    );

    // Filter out duplicates and invalid dates up-front
    const toCreate: Array<{
      householdId: string; accountId: string; date: Date;
      description: string; originalDescription: string; amount: number; needsReview: boolean;
    }> = [];
    let skipped = 0;

    for (const txn of transactions) {
      const hash = computeDedupHash(txn.date, txn.description, txn.amount);
      if (existingHashes.has(hash)) { skipped++; continue; }
      const txDate = new Date(txn.date);
      if (isNaN(txDate.getTime())) { skipped++; continue; }
      existingHashes.add(hash); // prevent within-batch duplicates
      toCreate.push({
        householdId: req.householdId!,
        accountId,
        date: txDate,
        description: txn.description,
        originalDescription: txn.description,
        amount: txn.amount,
        needsReview: true,
      });
    }

    // Bulk insert via journals
    let imported = 0;
    if (toCreate.length > 0) {
      const virtualAccounts = await getVirtualAccountsByType(req.householdId!);
      if (!virtualAccounts.expenseAccountId || !virtualAccounts.revenueAccountId) {
        throw new Error('Missing virtual accounts for webhook import');
      }

      await prisma.$transaction(async (tx) => {
        for (const row of toCreate) {
          try {
            await createJournalFromLegacyTransaction(
              tx,
              {
                householdId: row.householdId,
                accountId: row.accountId,
                date: row.date,
                description: row.description,
                amount: row.amount,
              },
              row.amount < 0 ? (virtualAccounts.expenseAccountId ?? '') : undefined,
              row.amount > 0 ? (virtualAccounts.revenueAccountId ?? '') : undefined,
            );
            imported++;
          } catch (err) {
            // Skip individual errors in bulk import
            console.error('Webhook import error:', err);
          }
        }
      });
    }

    await prisma.importHistory.create({
      data: {
        householdId: req.householdId!,
        filename: `webhook:${source ?? 'unknown'}`,
        bankSource: source ?? 'webhook',
        rowsTotal: transactions.length,
        rowsImported: imported,
        rowsDuplicate: skipped,
        rowsSkipped: 0,
        status: 'completed',
      },
    });

    return res.json({ imported, skipped });
  } catch (err) {
    req.log.error({ err }, 'Import webhook error');
    return res.status(500).json({ error: 'Webhook import failed' });
  }
});

export default router;
