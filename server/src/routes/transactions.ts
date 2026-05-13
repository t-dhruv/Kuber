import { Router, Response } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { logAudit } from '../lib/audit';
import { fireWebhooks } from '../lib/webhookFire';
import { NOT_DELETED } from '../lib/softDeleteWhere';
import { toCSV, setCsvHeaders } from '../lib/csvExport';
import { applyActiveRulesToJournal, applyActiveRulesToTransaction } from '../lib/ruleEngine';
import { getTransactionSplitDetails } from '../lib/transactionSplits';
import { matchBillsForTransaction } from '../lib/billMatcher';
import { buildSearchWhere } from '../lib/searchParser';
import {
  buildJournalInputFromLegacyTransaction,
  buildRuleMatchInputFromJournal,
  createTransactionJournal,
  createTransactionJournalInTransaction,
  deleteLegacyTransactionJournal,
  formatJournalAsTransaction,
  getTransactionJournalGroup,
  listTransactionJournalGroups,
  queryJournalsWithRelations,
  syncLegacyTransactionJournal,
} from '../lib/transactionJournalService';
import { planTransferConversion } from '../lib/transferConversion';
import { createJournalFromLegacyTransaction, getVirtualAccountsByType } from '../lib/legacyToJournalMigration';

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
// Helpers
// ---------------------------------------------------------------------------

const TX_INCLUDE = {
  category: { select: { id: true, name: true, icon: true } },
  merchant: { select: { name: true, displayName: true } },
  account: { select: { id: true, name: true } },
  splits: {
    include: { category: { select: { id: true, name: true, icon: true } } },
    orderBy: { createdAt: 'asc' as const },
  },
  tags: { include: { tag: { select: { id: true, name: true, color: true } } } },
  refundedTransaction: {
    select: { id: true, description: true, amount: true, date: true, currencyCode: true },
  },
  refunds: {
    select: { id: true, description: true, amount: true, date: true },
  },
} as const;

function formatMerchantName(
  merchant: { name: string; displayName: string } | null,
  description: string
): string {
  if (!merchant) return description;
  return merchant.displayName || merchant.name || description;
}

function formatTx(t: any) {
  return {
    id: t.id,
    date: t.date.toISOString(),
    merchantName: formatMerchantName(t.merchant, t.description),
    originalDescription: t.originalDescription,
    amount: t.amountDecimal ? Number(t.amountDecimal) : t.amount,
    currencyCode: t.currencyCode ?? 'CAD',
    originalAmount: t.originalAmount !== null && t.originalAmount !== undefined ? Number(t.originalAmount) : null,
    fxRate: t.fxRate !== null && t.fxRate !== undefined ? Number(t.fxRate) : null,
    categoryId: t.categoryId ?? null,
    categoryName: t.category?.name ?? null,
    categoryIcon: t.category?.icon ?? null,
    categoryColor: null,
    accountId: t.accountId,
    accountName: t.account.name,
    isRecurring: t.isRecurring,
    needsReview: t.needsReview,
    isHidden: t.isHidden,
    isPending: t.isPending,
    isSplit: t.isSplit,
    splitDetails: getTransactionSplitDetails(t),
    isTransfer: t.isTransfer ?? false,
    transferId: t.transferId ?? null,
    isRefund: t.isRefund ?? false,
    refundedTransactionId: t.refundedTransactionId ?? null,
    refundedTransaction: t.refundedTransaction
      ? {
          id: t.refundedTransaction.id,
          description: t.refundedTransaction.description,
          amount: t.refundedTransaction.amount,
          date: t.refundedTransaction.date.toISOString(),
          currencyCode: t.refundedTransaction.currencyCode ?? 'CAD',
        }
      : null,
    refunds: (t.refunds ?? []).map((r: any) => ({
      id: r.id,
      description: r.description,
      amount: r.amount,
      date: r.date.toISOString(),
    })),
    splits: (t.splits ?? []).map((s: any) => ({
      id:            s.id,
      amountDecimal: Number(s.amountDecimal),
      categoryId:    s.categoryId ?? null,
      categoryName:  s.category?.name ?? null,
      categoryIcon: s.category?.icon ?? null,
      notes:         s.notes ?? null,
    })),
    notes: t.notes ?? null,
    tags: (t.tags ?? []).map((tt: any) => ({
      id: tt.tag.id,
      name: tt.tag.name,
      color: tt.tag.color,
    })),
  };
}

// ---------------------------------------------------------------------------
// GET /api/v1/transactions
// ---------------------------------------------------------------------------
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;

    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 25));

    // Cursor param: base64-encoded JSON { date: ISO, id: string }
    const cursorParam = req.query.cursor as string | undefined;
    // Offset fallback for page-based UI
    const page = Math.max(1, parseInt(req.query.page as string) || 1);

    // Filters
    const ListQuerySchema = z.object({
      accountId:   z.string().optional(),
      categoryId:  z.string().optional(),
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

    const {
      accountId,
      categoryId,
      startDate,
      endDate,
      from,
      to,
      minAmount,
      maxAmount,
      search,
      isRecurring,
      needsReview,
      sort = 'date',
      order = 'desc',
      tagIds,
      type,
      pending,
    } = parsed.data;

    // Build where clause
    const where: any = { householdId, ...NOT_DELETED };

    if (accountId) where.accountId = accountId;
    if (categoryId) where.categoryId = categoryId;

    // Date filters: from/to take precedence, fall back to legacy startDate/endDate
    const dateFrom = from ?? startDate;
    const dateTo = to ?? endDate;
    if (dateFrom || dateTo) {
      where.date = {};
      if (dateFrom) where.date.gte = new Date(dateFrom);
      if (dateTo) where.date.lte = new Date(dateTo);
    }

    if (minAmount !== undefined || maxAmount !== undefined) {
      where.amount = {};
      if (minAmount !== undefined) where.amount.gte = parseFloat(minAmount);
      if (maxAmount !== undefined) where.amount.lte = parseFloat(maxAmount);
    }

    // Type filter (income / expense)
    if (type === 'income') {
      where.amount = { ...(where.amount ?? {}), gt: 0 };
    } else if (type === 'expense') {
      where.amount = { ...(where.amount ?? {}), lt: 0 };
    }

    // Pending filter
    if (pending !== undefined) {
      where.isPending = pending === 'true';
    }

    if (search) {
      const parsed = buildSearchWhere(search);
      if (parsed.AND && (parsed.AND as unknown[]).length > 0) {
        Object.assign(where, parsed);
      } else {
        where.OR = [
          { description: { contains: search, mode: 'insensitive' } },
          { originalDescription: { contains: search, mode: 'insensitive' } },
          {
            merchant: {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { displayName: { contains: search, mode: 'insensitive' } },
              ],
            },
          },
        ];
      }
    }

    if (isRecurring !== undefined) where.isRecurring = isRecurring === 'true';
    if (needsReview !== undefined) where.needsReview = needsReview === 'true';

    if (tagIds) {
      const ids = tagIds.split(',').map(s => s.trim()).filter(Boolean);
      if (ids.length > 0) where.tags = { some: { tagId: { in: ids } } };
    }

    const sortField = sort === 'amount' ? 'amount' : 'date';
    const sortOrder = order === 'asc' ? 'asc' : 'desc';
    // Always add id as tiebreaker for stable cursor pagination
    const orderBy: any = [{ [sortField]: sortOrder }, { id: 'desc' }];

    // ── Cursor-based path (journal) ────────────────────────────────────────────
    if (cursorParam) {
      let cursor: { date: string; id: string };
      try {
        cursor = JSON.parse(Buffer.from(cursorParam, 'base64url').toString('utf8'));
      } catch {
        return res.status(400).json({ error: 'Invalid cursor' });
      }

      const cursorDate = new Date(cursor.date);
      const journalWhere: any = { ...where, isDeleted: false };

      if (sortOrder === 'desc') {
        journalWhere.OR = [
          { date: { lt: cursorDate } },
          { date: cursorDate, id: { lt: cursor.id } },
        ];
      } else {
        journalWhere.OR = [
          { date: { gt: cursorDate } },
          { date: cursorDate, id: { gt: cursor.id } },
        ];
      }

      const rows = await queryJournalsWithRelations({
        ...where,
        limit: limit + 1,
        orderBy: sort === 'amount' ? 'amount' : 'date',
        orderDirection: order === 'asc' ? 'asc' : 'desc',
      });

      const hasMore = rows.length > limit;
      const page_rows = rows.slice(0, limit);
      const lastRow = page_rows[page_rows.length - 1];
      const nextCursor = hasMore && lastRow
        ? Buffer.from(JSON.stringify({ date: lastRow.date.toISOString(), id: lastRow.id })).toString('base64url')
        : null;

      return res.json({
        transactions: page_rows.map(j => formatJournalAsTransaction(j)),
        nextCursor,
        hasMore,
      });
    }

    // ── Offset-based path (journal) ────────────────────────────────────────────
    const skip = (page - 1) * limit;
    const [transactions, total] = await Promise.all([
      queryJournalsWithRelations({
        ...where,
        skip,
        limit,
        orderBy: sort === 'amount' ? 'amount' : 'date',
        orderDirection: order === 'asc' ? 'asc' : 'desc',
      }),
      prisma.transactionJournal.count({ where: { ...where, isDeleted: false } }),
    ]);

    const lastRow = transactions[transactions.length - 1];
    const nextCursor = lastRow && (skip + limit) < total
      ? Buffer.from(JSON.stringify({ date: lastRow.date.toISOString(), id: lastRow.id })).toString('base64url')
      : null;

    return res.json({
      transactions: transactions.map(j => formatJournalAsTransaction(j)),
      total,
      page,
      totalPages: Math.ceil(total / limit),
      nextCursor,
    });
  } catch (err) {
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

    const query = {
      householdId,
      dateFrom: startDate ? new Date(startDate) : undefined,
      dateTo: endDate ? new Date(endDate) : undefined,
      limit: 10000,
      orderBy: 'date' as const,
      orderDirection: 'desc' as const,
    };

    const journals = await queryJournalsWithRelations(query);

    // Filter by account if provided
    const filtered = accountId
      ? journals.filter(j => j.entries?.some(e => e.accountId === accountId))
      : journals;

    const rows = filtered.map(j => {
      const mainEntry = j.entries?.[0];
      const amount = Number(j.amountDecimal);
      return {
        date: j.date.toISOString().slice(0, 10),
        description: j.description,
        amount: amount.toFixed(2),
        type: amount >= 0 ? 'Income' : 'Expense',
        category: j.category?.name ?? '',
        account: mainEntry?.account?.name ?? 'Unknown',
        notes: j.notes ?? '',
      };
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
// Soft-deletes (hides) all transactions before the given date.
// Must be registered before /:id to avoid param collision.
// ---------------------------------------------------------------------------
const DeleteBeforeSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
});

router.delete('/before', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const parsed = DeleteBeforeSchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0]?.message ?? 'Invalid date' });
    }
    const cutoff = new Date(parsed.data.date);
    if (isNaN(cutoff.getTime())) {
      return res.status(400).json({ error: 'date is not a valid date' });
    }

    // Soft-delete journals before the given date
    const result = await prisma.transactionJournal.updateMany({
      where: { householdId, date: { lt: cutoff }, isDeleted: false },
      data: { isDeleted: true, updatedAt: new Date() },
    });

    logAudit({
      householdId,
      userId: req.userId!,
      action: 'DELETE',
      entity: 'TRANSACTION',
      entityId: 'bulk-before-date',
      before: { cutoffDate: parsed.data.date, count: result.count },
    });

    return res.json({ count: result.count });
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
    const account = await prisma.account.findFirst({ where: { id: accountId, householdId } });
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
    const account = await prisma.account.findFirst({ where: { id: accountId, householdId } });
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
    const [created, createdJournals] = await prisma.$transaction(async (tx) => {
      const results: string[] = [];
      const journals: any[] = [];
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
        journals.push(journal);
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

      return [results, journals] as const;
    });

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

    const result = await listTransactionJournalGroups({ householdId, limit, cursor });
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

    const group = await getTransactionJournalGroup({ householdId, id });
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

    const journal = await prisma.transactionJournal.findFirst({
      where: { id, householdId, isDeleted: false },
      include: {
        category: { select: { id: true, name: true, icon: true } },
        entries: {
          orderBy: { createdAt: 'asc' },
          include: {
            account: { select: { id: true, name: true } },
          },
        },
        tags: {
          include: {
            tag: { select: { id: true, name: true, color: true } },
          },
        },
        meta: true,
      },
    });

    if (!journal) return res.status(404).json({ error: 'Transaction not found' });

    return res.json({ ...formatJournalAsTransaction(journal), attachments: [] });
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
    const { date, description, amount, accountId, notes, tagIds, isRecurring, isRefund, currencyCode, originalAmount, fxRate } = bodyParsed.data;
    // Normalize empty string categoryId to null to avoid Prisma FK constraint error
    const categoryId = bodyParsed.data.categoryId || null;

    // IDOR: verify account belongs to household
    const account = await prisma.account.findFirst({ where: { id: accountId, householdId } });
    if (!account) return res.status(404).json({ error: 'Account not found' });

    // Validate categoryId if provided
    if (categoryId) {
      const cat = await prisma.category.findFirst({ where: { id: categoryId, householdId } });
      if (!cat) return res.status(404).json({ error: 'Category not found' });
    }

    // Validate tagIds if provided
    if (tagIds && Array.isArray(tagIds) && tagIds.length > 0) {
      const foundTags = await prisma.tag.findMany({
        where: { id: { in: tagIds }, householdId },
        select: { id: true },
      });
      if (foundTags.length !== tagIds.length) {
        return res.status(400).json({ error: 'One or more tagIds are invalid' });
      }
    }

    // Get virtual accounts for journal creation
    const virtualAccounts = await getVirtualAccountsByType(householdId);
    if (!virtualAccounts.expenseAccountId || !virtualAccounts.revenueAccountId) {
      throw new Error('Missing virtual accounts for transaction');
    }

    // Create journal directly (no legacy TX)
    const journal = await prisma.$transaction(async (tx) => {
      const journalResult = await createJournalFromLegacyTransaction(
        tx,
        {
          householdId,
          accountId,
          date: new Date(date),
          description,
          amount,
          categoryId: categoryId ?? undefined,
          currencyCode,
          originalAmount: originalAmount ?? undefined,
          fxRate: fxRate ?? undefined,
          notes: notes ?? undefined,
          isRecurring: isRecurring ?? false,
          isRefund: isRefund ?? false,
          tagIds,
        },
        amount < 0 ? (virtualAccounts.expenseAccountId ?? '') : undefined,
        amount > 0 ? (virtualAccounts.revenueAccountId ?? '') : undefined,
      );

      // Update account balance
      await tx.account.update({
        where: { id: accountId },
        data: { balance: { increment: amount } },
      });

      return journalResult;
    });

    // Get full journal with entries for response
    const fullJournal = await prisma.transactionJournal.findUniqueOrThrow({
      where: { id: journal.journalId },
      include: {
        entries: { include: { account: true } },
        category: true,
        tags: { include: { tag: true } },
        meta: true,
      },
    });

    // Apply rules to journal
    await applyActiveRulesToJournal(prisma, {
      journalId: fullJournal.id,
      householdId,
      matchInput: buildRuleMatchInputFromJournal(fullJournal),
    });

    logAudit({ householdId, userId: req.userId!, action: 'CREATE', entity: 'TRANSACTION', entityId: fullJournal.id, after: { amount: fullJournal.amountDecimal, description: fullJournal.description } });
    fireWebhooks(householdId, 'transaction.created', { id: fullJournal.id, description: fullJournal.description, amount: Number(fullJournal.amountDecimal), date: fullJournal.date }).catch(() => {});
    return res.status(201).json({ id: fullJournal.id, description: fullJournal.description, amount: Number(fullJournal.amountDecimal), date: fullJournal.date, categoryId: fullJournal.categoryId, notes: fullJournal.notes });
  } catch (err) {
    req.log.error({ err }, 'transactions/create');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// PUT /api/v1/transactions/:id/confirm  — marks isPending = false
// Must be registered before /:id to avoid param collision.
// ---------------------------------------------------------------------------
router.put('/:id/confirm', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const householdId = req.householdId!;

    const journal = await prisma.transactionJournal.findFirst({
      where: { id, householdId, isDeleted: false },
      include: {
        category: { select: { id: true, name: true, icon: true } },
        entries: {
          orderBy: { createdAt: 'asc' },
          include: { account: { select: { id: true, name: true } } },
        },
        tags: { include: { tag: { select: { id: true, name: true, color: true } } } },
      },
    });
    if (!journal) return res.status(404).json({ error: 'Transaction not found' });

    const updated = await prisma.transactionJournal.update({
      where: { id },
      data: { isPending: false },
      include: {
        category: { select: { id: true, name: true, icon: true } },
        entries: {
          orderBy: { createdAt: 'asc' },
          include: { account: { select: { id: true, name: true } } },
        },
        tags: { include: { tag: { select: { id: true, name: true, color: true } } } },
      },
    });

    await applyActiveRulesToJournal(prisma, {
      journalId: updated.id,
      householdId,
      matchInput: buildRuleMatchInputFromJournal(updated),
    });

    logAudit({
      householdId,
      userId: req.userId!,
      action: 'UPDATE',
      entity: 'TRANSACTION',
      entityId: id,
      before: { isPending: true },
      after: { isPending: false },
    });

    return res.json(formatJournalAsTransaction(updated));
  } catch (err) {
    req.log.error({ err }, 'transactions/confirm');
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

    // IDOR check
    const existing = await prisma.transactionJournal.findFirst({
      where: { id, householdId, isDeleted: false },
      include: {
        entries: { select: { accountId: true, amountDecimal: true } },
      },
    });
    if (!existing) return res.status(404).json({ error: 'Transaction not found' });

    const UpdateTxSchema = z.object({
      date:            z.string().optional(),
      description:     z.string().optional(),
      merchantName:    z.string().optional(),
      categoryId:      z.string().optional(),
      notes:           z.string().optional(),
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

    const data: any = {};
    const { date, description, merchantName, categoryId, notes, isRecurring, needsReview, isHidden, currencyCode, isPending } = parsed.data;

    if (date) data.date = new Date(date);
    if (description) data.description = description;
    if (merchantName) data.description = merchantName; // merchantName maps to description in journals
    if (categoryId) {
      const cat = await prisma.category.findFirst({ where: { id: categoryId, householdId } });
      if (!cat) return res.status(404).json({ error: 'Category not found' });
      data.categoryId = categoryId;
    }
    if (notes !== undefined) data.notes = notes ?? null;
    if (isRecurring !== undefined) data.isRecurring = isRecurring;
    if (needsReview !== undefined) data.needsReview = needsReview;
    if (isHidden !== undefined) data.isHidden = isHidden;
    if (currencyCode) data.currencyCode = currencyCode;
    if (isPending !== undefined) data.isPending = isPending;

    const updated = await prisma.transactionJournal.update({
      where: { id },
      data,
      include: {
        category: { select: { id: true, name: true, icon: true } },
        entries: {
          orderBy: { createdAt: 'asc' },
          include: { account: { select: { id: true, name: true } } },
        },
        tags: { include: { tag: { select: { id: true, name: true, color: true } } } },
      },
    });

    await applyActiveRulesToJournal(prisma, {
      journalId: updated.id,
      householdId,
      matchInput: buildRuleMatchInputFromJournal(updated),
    });

    logAudit({
      householdId,
      userId: req.userId!,
      action: 'UPDATE',
      entity: 'TRANSACTION',
      entityId: id,
      before: { description: existing.description },
      after: { description: updated.description },
    });

    return res.json(formatJournalAsTransaction(updated));
  } catch (err) {
    req.log.error({ err }, 'transactions/update');
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

    const existing = await prisma.transactionJournal.findFirst({
      where: { id, householdId, isDeleted: false },
      select: { description: true, amountDecimal: true },
    });
    if (!existing) return res.status(404).json({ error: 'Transaction not found' });

    // Soft delete journal
    await prisma.transactionJournal.update({
      where: { id },
      data: { isDeleted: true, updatedAt: new Date() },
    });

    logAudit({
      householdId,
      userId: req.userId!,
      action: 'DELETE',
      entity: 'TRANSACTION',
      entityId: id,
      before: { description: existing.description, amount: Number(existing.amountDecimal) },
    });

    return res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, 'transactions/delete');
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

    if (!Array.isArray(tagIds) || tagIds.length === 0) {
      return res.status(400).json({ error: 'tagIds must be a non-empty array' });
    }

    // IDOR check
    const journal = await prisma.transactionJournal.findFirst({
      where: { id, householdId, isDeleted: false },
      select: { id: true },
    });
    if (!journal) return res.status(404).json({ error: 'Transaction not found' });

    // Validate tags belong to household
    const validTags = await prisma.tag.findMany({
      where: { id: { in: tagIds }, householdId },
      select: { id: true },
    });
    if (validTags.length !== tagIds.length) {
      return res.status(400).json({ error: 'One or more tagIds are invalid' });
    }

    // Upsert each tag link
    await prisma.journalTag.createMany({
      data: tagIds.map((tagId: string) => ({ journalId: id, tagId })),
      skipDuplicates: true,
    });

    // Return updated tags
    const updated = await prisma.journalTag.findMany({
      where: { journalId: id },
      include: { tag: { select: { id: true, name: true, color: true } } },
    });

    return res.json(updated.map((tt: any) => ({ id: tt.tag.id, name: tt.tag.name, color: tt.tag.color })));
  } catch (err) {
    req.log.error({ err }, 'transactions/addTags');
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

    // IDOR check
    const journal = await prisma.transactionJournal.findFirst({
      where: { id, householdId, isDeleted: false },
      select: { id: true },
    });
    if (!journal) return res.status(404).json({ error: 'Transaction not found' });

    const link = await prisma.journalTag.findUnique({
      where: { journalId_tagId: { journalId: id, tagId } },
    });
    if (!link) return res.status(404).json({ error: 'Tag not found on transaction' });

    await prisma.journalTag.delete({
      where: { journalId_tagId: { journalId: id, tagId } },
    });

    return res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, 'transactions/removeTag');
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

    const journal = await prisma.transactionJournal.findFirst({
      where: { id, householdId, isDeleted: false },
      select: { id: true },
    });
    if (!journal) return res.status(404).json({ error: 'Transaction not found' });

    const updated = await prisma.transactionJournal.update({
      where: { id },
      data: { needsReview: !reviewed },
      select: { needsReview: true },
    });

    return res.json({ needsReview: updated.needsReview });
  } catch (err) {
    req.log.error({ err }, 'transactions/review');
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

    // Verify all journals belong to the household
    const count = await prisma.transactionJournal.count({
      where: { id: { in: ids }, householdId, isDeleted: false },
    });
    if (count !== ids.length) {
      return res.status(404).json({ error: 'One or more transactions not found' });
    }

    switch (action) {
      case 'recategorize': {
        if (!categoryId || typeof categoryId !== 'string') {
          return res.status(400).json({ error: 'categoryId is required for recategorize action' });
        }
        const cat = await prisma.category.findFirst({ where: { id: categoryId, householdId } });
        if (!cat) return res.status(404).json({ error: 'Category not found' });
        await prisma.transactionJournal.updateMany({
          where: { id: { in: ids }, householdId },
          data: { categoryId },
        });
        break;
      }

      case 'mark-reviewed': {
        await prisma.transactionJournal.updateMany({
          where: { id: { in: ids }, householdId },
          data: { needsReview: false },
        });
        break;
      }

      case 'hide': {
        await prisma.transactionJournal.updateMany({
          where: { id: { in: ids }, householdId },
          data: { isHidden: true },
        });
        break;
      }

      case 'delete': {
        // Soft-delete journals instead of hard delete
        await prisma.transactionJournal.updateMany({
          where: { id: { in: ids }, householdId },
          data: { isDeleted: true, updatedAt: new Date() },
        });
        break;
      }

      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }

    return res.json({ updated: ids.length });
  } catch (err: any) {
    req.log.error({ err }, 'transactions/bulk');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/v1/transactions/:id/convert-transfer
// ---------------------------------------------------------------------------
const ConvertTransferSchema = z.object({
  fromAccountId: z.string().min(1),
  toAccountId:   z.string().min(1),
  amount:        z.number().positive().optional(),
  date:          z.string().min(1).optional(),
  notes:         z.string().optional().nullable(),
});

router.post('/:id/convert-transfer', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const householdId = req.householdId!;

    const parsed = ConvertTransferSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0]?.message ?? 'Invalid input' });
    }

    // Find journal by ID
    const existing = await prisma.transactionJournal.findFirst({
      where: { id, householdId, isDeleted: false },
      include: {
        category: { select: { id: true, name: true, icon: true } },
        entries: {
          orderBy: { createdAt: 'asc' },
          include: { account: { select: { id: true, name: true } } },
        },
        tags: { include: { tag: { select: { id: true, name: true, color: true } } } },
      },
    });
    if (!existing) return res.status(404).json({ error: 'Transaction not found' });

    // Check if journal is already a transfer (has multiple entries with opposite signs or transfer type)
    const hasTransferMeta = existing.entries && existing.entries.length >= 2;
    if (hasTransferMeta) return res.status(400).json({ error: 'Transaction is already a transfer' });

    const { fromAccountId, toAccountId, amount, date, notes } = parsed.data;
    if (fromAccountId === toAccountId) {
      return res.status(400).json({ error: 'Source and destination accounts must differ' });
    }

    const accounts = await prisma.account.findMany({
      where: { id: { in: [fromAccountId, toAccountId] }, householdId },
      select: { id: true, name: true },
    });
    if (accounts.length !== 2) {
      return res.status(404).json({ error: 'One or both accounts not found' });
    }

    const fromAccount = accounts.find((account) => account.id === fromAccountId)!;
    const toAccount = accounts.find((account) => account.id === toAccountId)!;
    const transferId = crypto.randomUUID();

    // Extract journal data for planning
    const journalData = {
      accountId: existing.entries?.[0]?.accountId || fromAccountId,
      amount: Number(existing.amountDecimal),
      description: existing.description,
      originalDescription: existing.description,
      date: existing.date,
      currencyCode: existing.currencyCode ?? 'CAD',
      notes: existing.notes ?? null,
    };

    const plan = planTransferConversion({
      existing: journalData,
      fromAccountId,
      toAccountId,
      fromAccountName: fromAccount.name,
      toAccountName: toAccount.name,
      transferId,
      amount,
      date: date ? new Date(date) : undefined,
      notes,
    });

    const transferJournal = await prisma.$transaction(async (tx) => {
      // Reverse account balance for old journal
      if (existing.entries?.[0]) {
        const accountId = existing.entries[0].accountId;
        const journalAmount = Number(existing.amountDecimal);
        await tx.account.update({
          where: { id: accountId },
          data: { balance: { increment: -journalAmount } },
        });
      }

      // Delete old journal and its group
      if (existing.groupId) {
        await tx.transactionGroup.delete({ where: { id: existing.groupId } });
      } else {
        await tx.transactionJournal.update({
          where: { id },
          data: { isDeleted: true, updatedAt: new Date() },
        });
      }

      // Create new transfer journal
      const journal = await createTransactionJournalInTransaction(tx, {
        householdId,
        type: 'transfer',
        amount: plan.amount,
        sourceAccountId: fromAccountId,
        destinationAccountId: toAccountId,
        description: `Transfer from ${fromAccount.name} to ${toAccount.name}`,
        date: plan.updatedExisting.date,
        currencyCode: plan.updatedExisting.currencyCode ?? 'CAD',
        notes: plan.updatedExisting.notes ?? undefined,
      });

      // Update account balances for new transfer entries
      await tx.account.update({
        where: { id: fromAccountId },
        data: { balance: { increment: -plan.amount } },
      });
      await tx.account.update({
        where: { id: toAccountId },
        data: { balance: { increment: plan.amount } },
      });

      return journal;
    });

    // Fetch full journal for response
    const fullJournal = await prisma.transactionJournal.findUniqueOrThrow({
      where: { id: transferJournal.journalId },
      include: {
        entries: { include: { account: { select: { id: true, name: true } } } },
        category: { select: { id: true, name: true, icon: true } },
        tags: { include: { tag: { select: { id: true, name: true, color: true } } } },
      },
    });

    await applyActiveRulesToJournal(prisma, {
      journalId: fullJournal.id,
      householdId,
      matchInput: buildRuleMatchInputFromJournal(fullJournal),
    });

    logAudit({
      householdId,
      userId: req.userId!,
      action: 'UPDATE',
      entity: 'TRANSACTION',
      entityId: fullJournal.id,
      before: { description: existing.description, amount: Number(existing.amountDecimal) },
      after: { description: fullJournal.description, amount: Number(fullJournal.amountDecimal), transferId },
    });
    fireWebhooks(householdId, 'transaction.updated', { id: fullJournal.id, description: fullJournal.description, amount: Number(fullJournal.amountDecimal) }).catch(() => {});

    // Format response with debit/credit entries
    const debitEntry = fullJournal.entries?.find(e => Number(e.amountDecimal) < 0);
    const creditEntry = fullJournal.entries?.find(e => Number(e.amountDecimal) > 0);

    return res.status(200).json({
      debit: debitEntry ? {
        id: fullJournal.id,
        date: fullJournal.date.toISOString(),
        description: fullJournal.description,
        amount: Math.abs(Number(debitEntry.amountDecimal)),
        accountId: debitEntry.accountId,
        accountName: debitEntry.account.name,
      } : null,
      credit: creditEntry ? {
        id: fullJournal.id,
        date: fullJournal.date.toISOString(),
        description: fullJournal.description,
        amount: Number(creditEntry.amountDecimal),
        accountId: creditEntry.accountId,
        accountName: creditEntry.account.name,
      } : null,
    });
  } catch (err) {
    req.log.error({ err }, 'transactions/convert-transfer');
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/v1/transactions/transfer
// ---------------------------------------------------------------------------
const TransferSchema = z.object({
  fromAccountId: z.string().min(1),
  toAccountId:   z.string().min(1),
  amount:        z.number().positive(),
  date:          z.string().min(1),
  notes:         z.string().optional(),
});

router.post('/transfer', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const parsed = TransferSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0]?.message ?? 'Invalid input' });
    }
    const { fromAccountId, toAccountId, amount, date, notes } = parsed.data;

    if (fromAccountId === toAccountId) {
      return res.status(400).json({ error: 'Source and destination accounts must differ' });
    }

    // Verify both accounts belong to this household
    const accounts = await prisma.account.findMany({
      where: { id: { in: [fromAccountId, toAccountId] }, householdId },
      select: { id: true, name: true },
    });
    if (accounts.length !== 2) {
      return res.status(404).json({ error: 'One or both accounts not found' });
    }

    const txDate = new Date(date);

    const journal = await prisma.$transaction(async (tx) => {
      // Update both account balances
      await tx.account.update({
        where: { id: fromAccountId },
        data: { balance: { increment: -Math.abs(amount) } },
      });
      await tx.account.update({
        where: { id: toAccountId },
        data: { balance: { increment: Math.abs(amount) } },
      });

      return await createTransactionJournalInTransaction(tx, {
        householdId,
        type: 'transfer',
        amount: Math.abs(amount),
        sourceAccountId: fromAccountId,
        destinationAccountId: toAccountId,
        description: `Transfer from ${accounts.find(a => a.id === fromAccountId)!.name} to ${accounts.find(a => a.id === toAccountId)!.name}`,
        date: txDate,
        currencyCode: 'CAD',
        notes: notes ?? undefined,
      });
    });

    // Fetch full journal with entries for response
    const fullJournal = await prisma.transactionJournal.findUniqueOrThrow({
      where: { id: journal.journalId },
      include: {
        entries: { include: { account: true } },
        category: true,
        tags: { include: { tag: true } },
        meta: true,
      },
    });

    await applyActiveRulesToJournal(prisma, {
      journalId: fullJournal.id,
      householdId,
      matchInput: buildRuleMatchInputFromJournal(fullJournal),
    });

    logAudit({ householdId, userId: req.userId!, action: 'CREATE', entity: 'TRANSACTION', entityId: fullJournal.id, after: { amount: fullJournal.amountDecimal, description: fullJournal.description } });
    fireWebhooks(householdId, 'transaction.created', { id: fullJournal.id, description: fullJournal.description, amount: Number(fullJournal.amountDecimal), date: fullJournal.date }).catch(() => {});

    return res.status(201).json({ id: fullJournal.id, description: fullJournal.description, amount: Number(fullJournal.amountDecimal), date: fullJournal.date, notes: fullJournal.notes });
  } catch (err: any) {
    req.log.error({ err }, 'transactions/transfer');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
