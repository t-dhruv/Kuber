import { Router, Response } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { prisma } from '../lib/prisma';
import { NOT_DELETED } from '../lib/softDeleteWhere';
import { logAudit } from '../lib/audit';
import { applyActiveRulesToJournal } from '../lib/ruleEngine';
import { buildRuleMatchInputFromJournal } from '../lib/transactionJournalService';
import { createJournalFromLegacyTransaction, getVirtualAccountsByType } from '../lib/legacyToJournalMigration';
import { AuthRequest } from '../middleware/auth';
import { toCSV, setCsvHeaders } from '../lib/csvExport';
import {
  listTransactions,
  getTransaction,
  createTransaction,
  updateTransaction,
  deleteTransaction,
  deleteTransactionsBefore,
  bulkUpdateTransactions,
  addTag,
  removeTag,
  confirmTransaction,
  reviewTransaction,
  createTransfer,
  convertToTransfer,
  getJournalGroups,
  getJournalGroup,
  getTransactionsForExport,
} from '../services/transactionService';

// multer: memory storage, CSV only, 10 MB limit
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'));
    }
  },
});

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/v1/transactions
// ---------------------------------------------------------------------------
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 25));
    const cursorParam = req.query.cursor as string | undefined;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);

    const ListQuerySchema = z.object({
      accountId:   z.string().optional(),
      categoryId:  z.union([z.string(), z.array(z.string())]).optional(),
      uncategorized: z.enum(['true', 'false']).optional(),
      startDate:   z.string().optional(),
      endDate:     z.string().optional(),
      from:        z.string().optional(),
      to:          z.string().optional(),
      minAmount:   z.string().optional(),
      maxAmount:   z.string().optional(),
      search:      z.string().optional(),
      isRecurring: z.string().optional(),
      needsReview: z.string().optional(),
      sort:        z.enum(['date', 'amount']).optional(),
      order:       z.enum(['asc', 'desc']).optional(),
      tagIds:      z.string().optional(),
      type:        z.enum(['income', 'expense']).optional(),
      pending:     z.enum(['true', 'false']).optional(),
      limit:       z.string().optional(),
      cursor:      z.string().optional(),
      page:        z.string().optional(),
      hidden:      z.string().optional(),
      recurring:   z.string().optional(),
    });

    const parsed = ListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0]?.message ?? 'Invalid query params' });
    }

    const { limit: _l, page: _p, ...rest } = parsed.data;
    const result = await listTransactions({
      householdId,
      limit,
      page,
      cursorParam,
      ...rest,
    });
    return res.json(result);
  } catch (err: any) {
    if (err?.message === 'Invalid cursor') return res.status(400).json({ error: 'Invalid cursor' });
    req.log.error({ err }, 'transactions/list');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/v1/transactions/export/csv
// ---------------------------------------------------------------------------
router.get('/export/csv', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const { startDate, endDate, accountId } = req.query as Record<string, string | undefined>;

    const rows = await getTransactionsForExport({
      householdId,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      accountId,
    });

    const columns = [
      { key: 'date',        header: 'Date' },
      { key: 'description', header: 'Description' },
      { key: 'amount',      header: 'Amount' },
      { key: 'type',        header: 'Type' },
      { key: 'category',    header: 'Category' },
      { key: 'account',     header: 'Account' },
      { key: 'notes',       header: 'Notes' },
    ];

    const filename = `transactions-${new Date().toISOString().slice(0, 10)}.csv`;
    setCsvHeaders(res, filename);
    return res.send(toCSV(rows, columns));
  } catch (err) {
    req.log.error({ err }, 'transactions/export/csv');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/v1/transactions/before?date=YYYY-MM-DD
// Must be registered before /:id to avoid param collision.
// ---------------------------------------------------------------------------
router.delete('/before', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const DeleteBeforeSchema = z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
    });
    const parsed = DeleteBeforeSchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0]?.message ?? 'Invalid date' });
    }
    const cutoff = new Date(parsed.data.date);
    if (isNaN(cutoff.getTime())) {
      return res.status(400).json({ error: 'date is not a valid date' });
    }

    const result = await deleteTransactionsBefore(householdId, req.userId!, cutoff);
    return res.json(result);
  } catch (err) {
    req.log.error({ err }, 'transactions/before DELETE');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// CSV Import helpers
// ---------------------------------------------------------------------------

/**
 * Minimal CSV parser — handles quoted fields with embedded commas/newlines.
 * Returns an array of row-arrays (strings).
 */
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(field.trim());
        field = '';
      } else if (ch === '\n' || (ch === '\r' && next === '\n')) {
        if (ch === '\r') i++;
        row.push(field.trim());
        if (row.some(c => c !== '')) rows.push(row);
        row = [];
        field = '';
      } else if (ch === '\r') {
        row.push(field.trim());
        if (row.some(c => c !== '')) rows.push(row);
        row = [];
        field = '';
      } else {
        field += ch;
      }
    }
  }
  // last field/row
  if (field !== '' || row.length > 0) {
    row.push(field.trim());
    if (row.some(c => c !== '')) rows.push(row);
  }

  return rows;
}

/** Parse amount: handles negatives, parentheses like (123.45), $, commas. */
function parseAmount(raw: string): number {
  let s = raw.trim().replace(/[$,\s]/g, '');
  const negative = s.startsWith('(') && s.endsWith(')');
  s = s.replace(/[()]/g, '');
  const val = parseFloat(s);
  if (isNaN(val)) return NaN;
  return negative ? -val : val;
}

/** Parse date from a value string given a format token. Returns Date | null. */
function parseDate(raw: string, format: string): Date | null {
  const s = raw.trim();
  let year: number, month: number, day: number;

  if (format === 'YYYY-MM-DD') {
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    [year, month, day] = [+m[1], +m[2], +m[3]];
  } else if (format === 'MM/DD/YYYY') {
    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) return null;
    [month, day, year] = [+m[1], +m[2], +m[3]];
  } else if (format === 'DD/MM/YYYY') {
    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) return null;
    [day, month, year] = [+m[1], +m[2], +m[3]];
  } else if (format === 'MM-DD-YYYY') {
    const m = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
    if (!m) return null;
    [month, day, year] = [+m[1], +m[2], +m[3]];
  } else {
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }

  const d = new Date(year!, month! - 1, day!);
  if (isNaN(d.getTime()) || d.getFullYear() !== year! || d.getMonth() !== month! - 1 || d.getDate() !== day!) {
    return null;
  }
  return d;
}

interface CsvMapping {
  date: string;
  description: string;
  descriptionColumn2?: string;
  descriptionSeparator?: string;
  amount: string;
  category?: string;
  notes?: string;
}

interface ParsedRow {
  date: Date;
  description: string;
  amount: number;
  category?: string;
  notes?: string;
}

interface RowError {
  row: number;
  message: string;
}

function parseImportRows(
  rows: string[][],
  headers: string[],
  mapping: CsvMapping,
  dateFormat: string,
  limit?: number,
): { parsed: ParsedRow[]; errors: RowError[] } {
  const idx = (col: string) => headers.indexOf(col);
  const dateIdx = idx(mapping.date);
  const descIdx = idx(mapping.description);
  const amtIdx = idx(mapping.amount);
  const catIdx = mapping.category ? idx(mapping.category) : -1;
  const notesIdx = mapping.notes ? idx(mapping.notes) : -1;

  const parsed: ParsedRow[] = [];
  const errors: RowError[] = [];

  const dataRows = limit !== undefined ? rows.slice(0, limit) : rows;

  for (let i = 0; i < dataRows.length; i++) {
    const rowNum = i + 2; // 1-indexed, +1 for header
    const row = dataRows[i];

    if (dateIdx === -1) { errors.push({ row: rowNum, message: 'date column not found' }); continue; }
    if (descIdx === -1) { errors.push({ row: rowNum, message: 'description column not found' }); continue; }
    if (amtIdx === -1) { errors.push({ row: rowNum, message: 'amount column not found' }); continue; }

    const rawDate = row[dateIdx] ?? '';
    const descIdx2 = mapping.descriptionColumn2 ? idx(mapping.descriptionColumn2) : -1;
    const rawDesc1 = row[descIdx] ?? '';
    const rawDesc2 = descIdx2 !== -1 ? (row[descIdx2] ?? '') : '';
    const separator = mapping.descriptionSeparator ?? ' – ';
    const rawDesc = rawDesc2 ? `${rawDesc1}${separator}${rawDesc2}` : rawDesc1;
    const rawAmt = row[amtIdx] ?? '';

    const date = parseDate(rawDate, dateFormat);
    if (!date) {
      errors.push({ row: rowNum, message: `Cannot parse date "${rawDate}" with format ${dateFormat}` });
      continue;
    }

    const amount = parseAmount(rawAmt);
    if (isNaN(amount)) {
      errors.push({ row: rowNum, message: `Cannot parse amount "${rawAmt}"` });
      continue;
    }

    if (amount === 0) continue; // skip zero amounts silently

    const description = rawDesc || 'Unknown';
    const category = catIdx !== -1 ? (row[catIdx] ?? '').trim() || undefined : undefined;
    const notes = notesIdx !== -1 ? (row[notesIdx] ?? '').trim() || undefined : undefined;

    parsed.push({ date, description, amount, category, notes });
  }

  return { parsed, errors };
}

const ImportBodySchema = z.object({
  accountId: z.string().min(1),
  dateFormat: z.enum(['YYYY-MM-DD', 'MM/DD/YYYY', 'DD/MM/YYYY', 'MM-DD-YYYY']).default('YYYY-MM-DD'),
  mapping: z.string().min(1), // JSON string
  invertAmounts: z.enum(['true', 'false']).optional(), // FormData sends strings
});

// ---------------------------------------------------------------------------
// POST /api/v1/transactions/import/preview
// ---------------------------------------------------------------------------
router.post('/import/preview', upload.single('file'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'CSV file is required' });

    const bodyParsed = ImportBodySchema.safeParse(req.body);
    if (!bodyParsed.success) {
      return res.status(400).json({ error: bodyParsed.error.errors[0]?.message ?? 'Invalid request' });
    }
    const { accountId, dateFormat, mapping: mappingStr, invertAmounts: invertAmountsStr } = bodyParsed.data;
    const invertAmounts = invertAmountsStr === 'true';

    let mapping: CsvMapping;
    try {
      mapping = JSON.parse(mappingStr);
    } catch {
      return res.status(400).json({ error: 'mapping must be valid JSON' });
    }
    if (!mapping.date || !mapping.description || !mapping.amount) {
      return res.status(400).json({ error: 'mapping must include date, description, and amount fields' });
    }

    const householdId = req.householdId!;
    const account = await prisma.account.findFirst({ where: { id: accountId, householdId, ...NOT_DELETED } });
    if (!account) return res.status(404).json({ error: 'Account not found' });

    const text = req.file.buffer.toString('utf-8').replace(/^\uFEFF/, ''); // strip BOM
    const allRows = parseCSV(text);
    if (allRows.length < 2) return res.status(400).json({ error: 'CSV has no data rows' });

    const headers = allRows[0].map(h => h.trim());
    const dataRows = allRows.slice(1);

    const { parsed, errors } = parseImportRows(dataRows, headers, mapping, dateFormat, 5);
    if (invertAmounts) parsed.forEach(p => { p.amount = -p.amount; });

    return res.json({
      headers,
      preview: parsed.map(p => ({
        date: p.date.toISOString().slice(0, 10),
        description: p.description,
        amount: p.amount,
        category: p.category ?? null,
        notes: p.notes ?? null,
      })),
      errors,
      totalDataRows: dataRows.length,
    });
  } catch (err) {
    req.log.error({ err }, 'transactions/import/preview');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/v1/transactions/import
// ---------------------------------------------------------------------------
router.post('/import', upload.single('file'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'CSV file is required' });

    const bodyParsed = ImportBodySchema.safeParse(req.body);
    if (!bodyParsed.success) {
      return res.status(400).json({ error: bodyParsed.error.errors[0]?.message ?? 'Invalid request' });
    }
    const { accountId, dateFormat, mapping: mappingStr, invertAmounts: invertAmountsStr } = bodyParsed.data;
    const invertAmounts = invertAmountsStr === 'true';

    let mapping: CsvMapping;
    try {
      mapping = JSON.parse(mappingStr);
    } catch {
      return res.status(400).json({ error: 'mapping must be valid JSON' });
    }
    if (!mapping.date || !mapping.description || !mapping.amount) {
      return res.status(400).json({ error: 'mapping must include date, description, and amount fields' });
    }

    const householdId = req.householdId!;
    const account = await prisma.account.findFirst({ where: { id: accountId, householdId, ...NOT_DELETED } });
    if (!account) return res.status(404).json({ error: 'Account not found' });

    const text = req.file.buffer.toString('utf-8').replace(/^\uFEFF/, '');
    const allRows = parseCSV(text);
    if (allRows.length < 2) return res.status(400).json({ error: 'CSV has no data rows' });

    const headers = allRows[0].map(h => h.trim());
    const dataRows = allRows.slice(1);

    const { parsed, errors } = parseImportRows(dataRows, headers, mapping, dateFormat);
    if (invertAmounts) parsed.forEach(p => { p.amount = -p.amount; });

    // If >10% of rows have errors, reject everything
    const totalAttempted = dataRows.length;
    if (totalAttempted > 0 && errors.length / totalAttempted > 0.1) {
      return res.status(422).json({
        error: `Too many parse errors (${errors.length}/${totalAttempted}). Import cancelled.`,
        errors,
        imported: 0,
        skipped: totalAttempted - parsed.length,
      });
    }

    // Pre-load all categories for this household (for case-insensitive matching)
    const categories = await prisma.category.findMany({
      where: { householdId },
      select: { id: true, name: true },
    });
    const categoryMap = new Map(categories.map(c => [c.name.toLowerCase(), c.id]));

    // Merchant cache to avoid redundant DB calls within this import
    const merchantCache = new Map<string, string>(); // name -> id

    // Reuse existing virtual accounts when present; journal creation will create missing ones.
    const virtualAccounts = await getVirtualAccountsByType(householdId);

    // Run all inserts in a transaction (including balance update for atomicity)
    const created = await prisma.$transaction(async (tx) => {
      const results: string[] = [];
      let totalAmount = 0;

      for (const row of parsed) {
        // Resolve or create merchant
        const merchantKey = row.description.toLowerCase();
        let merchantId: string | null = null;

        if (merchantCache.has(merchantKey)) {
          merchantId = merchantCache.get(merchantKey)!;
        } else {
          let merchant = await tx.merchant.findFirst({
            where: { householdId, name: { equals: row.description, mode: 'insensitive' } },
            select: { id: true },
          });
          if (!merchant) {
            merchant = await tx.merchant.create({
              data: { householdId, name: row.description, displayName: row.description },
              select: { id: true },
            });
          }
          merchantId = merchant.id;
          merchantCache.set(merchantKey, merchantId);
        }

        // Resolve category
        const categoryId = row.category
          ? (categoryMap.get(row.category.toLowerCase()) ?? null)
          : null;

        // Create journal directly (no legacy transaction)
        const journal = await createJournalFromLegacyTransaction(
          tx,
          {
            householdId,
            accountId,
            date: row.date,
            description: row.description,
            amount: row.amount,
            categoryId: categoryId ?? undefined,
            notes: row.notes ?? null,
            merchantId,
          },
          row.amount < 0 ? (virtualAccounts.expenseAccountId ?? undefined) : undefined,
          row.amount > 0 ? (virtualAccounts.revenueAccountId ?? undefined) : undefined,
        );
        results.push(journal.journalId);
        totalAmount += row.amount;
      }

      // Update account running balance by the net sum of all imported transactions
      if (results.length > 0) {
        await tx.account.update({
          where: { id: accountId },
          data: { balance: { increment: totalAmount } },
        });
      }

      return results;
    });

    const createdJournals = created.length > 0
      ? await prisma.transactionJournal.findMany({
          where: { id: { in: created }, householdId, isDeleted: false },
          include: {
            entries: true,
            tags: { include: { tag: true } },
            meta: true,
            category: true,
          },
        })
      : [];

    for (const journal of createdJournals) {
      await applyActiveRulesToJournal(prisma, {
        journalId: journal.id,
        householdId,
        matchInput: buildRuleMatchInputFromJournal(journal),
      });
    }

    const skipped = totalAttempted - parsed.length;

    logAudit({
      householdId,
      userId: req.userId!,
      action: 'CREATE',
      entity: 'TRANSACTION',
      entityId: 'csv-import',
      after: { imported: created.length, accountId },
    });

    return res.json({
      imported: created.length,
      skipped,
      errors,
    });
  } catch (err) {
    req.log.error({ err }, 'transactions/import');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/v1/transactions/journal-groups
// ---------------------------------------------------------------------------
router.get('/journal-groups', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 25));
    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;

    const result = await getJournalGroups(householdId, limit, cursor);
    return res.json(result);
  } catch (err) {
    req.log.error({ err }, 'transactions/journal-groups');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/v1/transactions/journal-groups/:id
// ---------------------------------------------------------------------------
router.get('/journal-groups/:id', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const { id } = req.params;

    const group = await getJournalGroup(householdId, id);
    if (!group) {
      return res.status(404).json({ error: 'Transaction journal group not found' });
    }

    return res.json(group);
  } catch (err) {
    req.log.error({ err }, 'transactions/journal-group/get');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/v1/transactions/:id
// ---------------------------------------------------------------------------
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const householdId = req.householdId!;

    const tx = await getTransaction(id, householdId);
    if (!tx) return res.status(404).json({ error: 'Transaction not found' });

    return res.json(tx);
  } catch (err) {
    req.log.error({ err }, 'transactions/get');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/v1/transactions
// ---------------------------------------------------------------------------
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;

    const CreateTxSchema = z.object({
      date:           z.string().min(1, 'date is required'),
      description:    z.string().min(1, 'description is required'),
      amount:         z.number().refine(n => n !== 0, 'amount must be non-zero'),
      accountId:      z.string().min(1, 'accountId is required'),
      categoryId:     z.string().optional().nullable(),
      notes:          z.string().optional().nullable(),
      tagIds:         z.array(z.string()).optional(),
      isRecurring:    z.boolean().optional(),
      isRefund:       z.boolean().optional(),
      currencyCode:   z.string().length(3).toUpperCase().default('CAD'),
      originalAmount: z.number().optional().nullable(),
      fxRate:         z.number().positive().optional().nullable(),
    });

    const bodyParsed = CreateTxSchema.safeParse(req.body);
    if (!bodyParsed.success) {
      return res.status(400).json({ error: bodyParsed.error.errors[0]?.message ?? 'Invalid input' });
    }

    const result = await createTransaction({
      householdId,
      userId: req.userId!,
      date: bodyParsed.data.date,
      description: bodyParsed.data.description,
      amount: bodyParsed.data.amount,
      accountId: bodyParsed.data.accountId,
      categoryId: bodyParsed.data.categoryId || null,
      notes: bodyParsed.data.notes ?? null,
      tagIds: bodyParsed.data.tagIds,
      isRecurring: bodyParsed.data.isRecurring,
      isRefund: bodyParsed.data.isRefund,
      currencyCode: bodyParsed.data.currencyCode,
      originalAmount: bodyParsed.data.originalAmount,
      fxRate: bodyParsed.data.fxRate,
    });

    return res.status(201).json(result);
  } catch (err: any) {
    req.log.error({ err }, 'transactions/create');
    if (err.message === 'Account not found' || err.message === 'Category not found' || err.message === 'One or more tagIds are invalid') {
      return res.status(404).json({ error: err.message });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// PUT /api/v1/transactions/:id/confirm
// Must be registered before /:id to avoid param collision.
// ---------------------------------------------------------------------------
router.put('/:id/confirm', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const householdId = req.householdId!;

    const result = await confirmTransaction(id, householdId, req.userId!);
    return res.json(result);
  } catch (err: any) {
    req.log.error({ err }, 'transactions/confirm');
    if (err.message === 'Transaction not found') {
      return res.status(404).json({ error: err.message });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// PUT /api/v1/transactions/:id
// ---------------------------------------------------------------------------
router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const householdId = req.householdId!;

    const UpdateTxSchema = z.object({
      date:            z.string().optional(),
      description:     z.string().optional(),
      merchantName:    z.string().optional(),
      categoryId:      z.string().nullable().optional(),
      notes:           z.string().nullable().optional(),
      isRecurring:     z.boolean().optional(),
      needsReview:     z.boolean().optional(),
      isHidden:        z.boolean().optional(),
      currencyCode:    z.string().length(3).optional(),
      isPending:       z.boolean().optional(),
    });

    const parsed = UpdateTxSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0]?.message ?? 'Invalid fields' });
    }

    const result = await updateTransaction({
      householdId,
      userId: req.userId!,
      id,
      ...parsed.data,
    });

    return res.json(result);
  } catch (err: any) {
    req.log.error({ err }, 'transactions/update');
    if (err.message === 'Transaction not found' || err.message === 'Category not found') {
      return res.status(404).json({ error: err.message });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/v1/transactions/:id
// ---------------------------------------------------------------------------
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const householdId = req.householdId!;

    const result = await deleteTransaction(id, householdId, req.userId!);
    return res.json(result);
  } catch (err: any) {
    req.log.error({ err }, 'transactions/delete');
    if (err.message === 'Transaction not found') {
      return res.status(404).json({ error: err.message });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/v1/transactions/:id/tags
// ---------------------------------------------------------------------------
router.post('/:id/tags', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const householdId = req.householdId!;
    const { tagIds } = req.body;

    const result = await addTag(id, tagIds, householdId);
    return res.json(result);
  } catch (err: any) {
    req.log.error({ err }, 'transactions/addTags');
    if (err.message === 'tagIds must be a non-empty array' || err.message === 'One or more tagIds are invalid') {
      return res.status(400).json({ error: err.message });
    }
    if (err.message === 'Transaction not found') {
      return res.status(404).json({ error: err.message });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/v1/transactions/:id/tags/:tagId
// ---------------------------------------------------------------------------
router.delete('/:id/tags/:tagId', async (req: AuthRequest, res: Response) => {
  try {
    const { id, tagId } = req.params;
    const householdId = req.householdId!;

    const result = await removeTag(id, tagId, householdId);
    return res.json(result);
  } catch (err: any) {
    req.log.error({ err }, 'transactions/removeTag');
    if (err.message === 'Transaction not found' || err.message === 'Tag not found on transaction') {
      return res.status(404).json({ error: err.message });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/v1/transactions/:id/review
// ---------------------------------------------------------------------------
router.post('/:id/review', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const householdId = req.householdId!;
    const { reviewed } = req.body;

    if (typeof reviewed !== 'boolean') {
      return res.status(400).json({ error: 'reviewed must be a boolean' });
    }

    const result = await reviewTransaction(id, householdId, reviewed);
    return res.json(result);
  } catch (err: any) {
    req.log.error({ err }, 'transactions/review');
    if (err.message === 'Transaction not found') {
      return res.status(404).json({ error: err.message });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/v1/transactions/bulk
// ---------------------------------------------------------------------------
router.post('/bulk', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const { action, ids, categoryId } = req.body;

    if (!action || typeof action !== 'string') {
      return res.status(400).json({ error: 'action is required' });
    }
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids must be a non-empty array' });
    }
    if (ids.length > 100) {
      return res.status(400).json({ error: 'Maximum 100 transactions per bulk request' });
    }

    const result = await bulkUpdateTransactions({ householdId, userId: req.userId!, action, ids, categoryId });
    return res.json(result);
  } catch (err: any) {
    req.log.error({ err }, 'transactions/bulk');
    if (err.message === 'One or more transactions not found' || err.message === 'Category not found' || err.message.startsWith('Unknown action')) {
      return res.status(404).json({ error: err.message });
    }
    if (err.message === 'categoryId is required for recategorize action') {
      return res.status(400).json({ error: err.message });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/v1/transactions/:id/convert-transfer
// ---------------------------------------------------------------------------
router.post('/:id/convert-transfer', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const householdId = req.householdId!;

    const ConvertTransferSchema = z.object({
      fromAccountId: z.string().min(1),
      toAccountId:   z.string().min(1),
      amount:        z.number().positive().optional(),
      date:          z.string().min(1).optional(),
      notes:         z.string().optional().nullable(),
    });

    const parsed = ConvertTransferSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0]?.message ?? 'Invalid input' });
    }

    const result = await convertToTransfer({
      householdId,
      userId: req.userId!,
      id,
      ...parsed.data,
    });

    return res.status(200).json(result);
  } catch (err: any) {
    req.log.error({ err }, 'transactions/convert-transfer');
    if (err.message === 'Transaction not found' || err.message === 'One or both accounts not found') {
      return res.status(404).json({ error: err.message });
    }
    if (err.message === 'Transaction is already a transfer' || err.message === 'Source and destination accounts must differ') {
      return res.status(400).json({ error: err.message });
    }
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/v1/transactions/transfer
// ---------------------------------------------------------------------------
router.post('/transfer', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;

    const TransferSchema = z.object({
      fromAccountId: z.string().min(1),
      toAccountId:   z.string().min(1),
      amount:        z.number().positive(),
      date:          z.string().min(1),
      notes:         z.string().optional(),
    });

    const parsed = TransferSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0]?.message ?? 'Invalid input' });
    }

    const result = await createTransfer({
      householdId,
      userId: req.userId!,
      ...parsed.data,
    });

    return res.status(201).json(result);
  } catch (err: any) {
    req.log.error({ err }, 'transactions/transfer');
    if (err.message === 'Source and destination accounts must differ' || err.message === 'One or both accounts not found') {
      return res.status(400).json({ error: err.message });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
