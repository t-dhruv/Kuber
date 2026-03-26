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
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { AuthRequest } from '../middleware/auth.js';
import { detectBankFormat, mapRowToTransaction } from '../lib/bankFormats.js';
import { computeDedupHash, markDuplicates } from '../lib/importDedup.js';
import { parsePdfStatement } from '../lib/pdfParser.js';
import { parseDate } from '../lib/dateUtils.js';

const router = Router();

// Multer: accept CSV and PDF, 20 MB limit
const ALLOWED_MIMES = new Set(['text/csv', 'application/pdf', 'text/plain', 'application/octet-stream']);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    // Check extension strictly (last segment only, lowercase)
    const ext = file.originalname.split('.').pop()?.toLowerCase();
    const validExt = ext === 'csv' || ext === 'pdf';
    // Allow common MIME types (browsers vary on CSV MIME)
    const validMime = ALLOWED_MIMES.has(file.mimetype);
    if (validExt && validMime) {
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

    return res.json({
      bankSource,
      confidence: Math.round(confidence * 100),
      totalRows,
      newCount,
      dupCount,
      invalidCount,
      rows: rows.slice(0, 200), // cap preview at 200 rows
    });
  } catch (err) {
    console.error('Import parse error:', err);
    const msg = err instanceof Error ? err.message : 'Parse failed';
    // Don't leak internal file paths or stack traces
    const safeMsg = msg.startsWith('PDF') || msg.startsWith('Only') ? msg : 'Failed to parse file';
    return res.status(500).json({ error: safeMsg });
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
});

router.post('/confirm', async (req: AuthRequest, res) => {
  try {
    const body = ConfirmSchema.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: body.error.flatten() });

    const { accountId, rows, filename, bankSource } = body.data;

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
    const errors: Array<{ index: number; error: string }> = [];

    const isInvestmentAccount = account.type === 'investment';

    await prisma.$transaction(async (tx) => {
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        try {
          const txDate = new Date(row.date);
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
                note: row.description,
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

          await tx.transaction.create({
            data: {
              householdId: req.householdId!,
              accountId,
              date: txDate,
              description: row.description,
              originalDescription: row.description,
              amount: row.amount,
              categoryId: resolvedCategoryId,
              merchantId,
              notes: row.notes ?? null,
              needsReview: !resolvedCategoryId,
            },
          });
          imported++;
        } catch (err) {
          errors.push({ index: i, error: err instanceof Error ? err.message : 'Unknown error' });
          skipped++;
        }
      }
    });

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

    return res.json({ imported, skipped, errors });
  } catch (err) {
    console.error('Import confirm error:', err);
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
    console.error('Import history error:', err);
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

    // Bulk insert — single DB roundtrip
    if (toCreate.length > 0) {
      await prisma.transaction.createMany({ data: toCreate });
    }
    const imported = toCreate.length;

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
    console.error('Import webhook error:', err);
    return res.status(500).json({ error: 'Webhook import failed' });
  }
});

export default router;
