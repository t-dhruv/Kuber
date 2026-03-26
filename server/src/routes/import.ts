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
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok =
      file.mimetype === 'text/csv' ||
      file.mimetype === 'application/pdf' ||
      file.originalname.endsWith('.csv') ||
      file.originalname.endsWith('.pdf');
    ok ? cb(null, true) : cb(new Error('Only CSV and PDF files are accepted'));
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
}

async function parseUploadedFile(
  buffer: Buffer,
  filename: string,
  accountId: string,
  householdId: string
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
    return {
      date: parsedDate,
      description: row.description,
      amount: row.amount,
      reference: row.reference,
      hash: row.hash,
      isDuplicate: row.isDuplicate,
      status: row.isDuplicate ? ('duplicate' as const) : ('new' as const),
    };
  });

  return { rows: finalRows, bankSource, confidence, totalRows };
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
      req.householdId!
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
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Parse failed' });
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
});

const ConfirmSchema = z.object({
  accountId: z.string(),
  rows: z.array(ConfirmRowSchema),
  filename: z.string().optional(),
  bankSource: z.string().optional(),
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

    // Pre-load categories for case-insensitive matching
    const categories = await prisma.category.findMany({
      where: { householdId: req.householdId! },
      select: { id: true, name: true },
    });
    const categoryMap = new Map(categories.map((c) => [c.name.toLowerCase(), c.id]));

    let imported = 0;
    let skipped = 0;
    const errors: Array<{ index: number; error: string }> = [];

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

          // Resolve category
          let resolvedCategoryId = row.categoryId ?? null;
          if (!resolvedCategoryId) {
            // Try to match by description keyword in category names
            const descLower = row.description.toLowerCase();
            for (const [name, id] of categoryMap) {
              if (descLower.includes(name) || name.includes(descLower.split(' ')[0])) {
                resolvedCategoryId = id;
                break;
              }
            }
          }

          // Find or create merchant
          const merchantName = row.description.split(/[#\d]/)[0].trim();
          let merchant = await tx.merchant.findFirst({
            where: { householdId: req.householdId!, name: { equals: merchantName, mode: 'insensitive' } },
          });
          if (!merchant && merchantName.length > 1) {
            merchant = await tx.merchant.create({
              data: { householdId: req.householdId!, name: merchantName, displayName: merchantName },
            });
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
              merchantId: merchant?.id ?? null,
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
  source: z.string().optional(),
  transactions: z.array(WebhookRowSchema),
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

    let imported = 0;
    let skipped = 0;

    for (const txn of transactions) {
      const hash = computeDedupHash(txn.date, txn.description, txn.amount);
      if (existingHashes.has(hash)) { skipped++; continue; }

      const txDate = new Date(txn.date);
      if (isNaN(txDate.getTime())) { skipped++; continue; }

      await prisma.transaction.create({
        data: {
          householdId: req.householdId!,
          accountId,
          date: txDate,
          description: txn.description,
          originalDescription: txn.description,
          amount: txn.amount,
          needsReview: true,
        },
      });
      existingHashes.add(hash);
      imported++;
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
    console.error('Import webhook error:', err);
    return res.status(500).json({ error: 'Webhook import failed' });
  }
});

export default router;
