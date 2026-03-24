import { Router, Response } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { logAudit } from '../lib/audit';
import { toCSV, setCsvHeaders } from '../lib/csvExport';

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
  category: { select: { id: true, name: true, emoji: true } },
  merchant: { select: { name: true, displayName: true } },
  account: { select: { id: true, name: true } },
  tags: { include: { tag: { select: { id: true, name: true, color: true } } } },
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
    amount: t.amount,
    categoryId: t.categoryId ?? null,
    categoryName: t.category?.name ?? null,
    categoryIcon: t.category?.emoji ?? null,
    categoryColor: null,
    accountId: t.accountId,
    accountName: t.account.name,
    isRecurring: t.isRecurring,
    needsReview: t.needsReview,
    isHidden: t.isHidden,
    isSplit: t.isSplit,
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
    const {
      accountId,
      categoryId,
      startDate,
      endDate,
      minAmount,
      maxAmount,
      search,
      isRecurring,
      needsReview,
      sort = 'date',
      order = 'desc',
      tagIds,
    } = req.query as Record<string, string | undefined>;

    // Build where clause
    const where: any = { householdId };

    if (accountId) where.accountId = accountId;
    if (categoryId) where.categoryId = categoryId;

    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = new Date(startDate);
      if (endDate) where.date.lte = new Date(endDate);
    }

    if (minAmount !== undefined || maxAmount !== undefined) {
      where.amount = {};
      if (minAmount !== undefined) where.amount.gte = parseFloat(minAmount);
      if (maxAmount !== undefined) where.amount.lte = parseFloat(maxAmount);
    }

    if (search) {
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

    // ── Cursor-based path ──────────────────────────────────────────────────────
    if (cursorParam) {
      let cursor: { date: string; id: string };
      try {
        cursor = JSON.parse(Buffer.from(cursorParam, 'base64url').toString('utf8'));
      } catch {
        return res.status(400).json({ error: 'Invalid cursor' });
      }

      const cursorDate = new Date(cursor.date);
      // Fetch one extra to determine if there's a next page
      const whereWithCursor = {
        ...where,
        OR: [
          { date: sortOrder === 'desc' ? { lt: cursorDate } : { gt: cursorDate } },
          { date: cursorDate, id: { lt: cursor.id } },
        ],
      };

      const rows = await prisma.transaction.findMany({
        where: whereWithCursor,
        include: TX_INCLUDE,
        orderBy,
        take: limit + 1,
      });

      const hasMore = rows.length > limit;
      const page_rows = rows.slice(0, limit);
      const lastRow = page_rows[page_rows.length - 1];
      const nextCursor = hasMore && lastRow
        ? Buffer.from(JSON.stringify({ date: lastRow.date.toISOString(), id: lastRow.id })).toString('base64url')
        : null;

      return res.json({
        transactions: page_rows.map(formatTx),
        nextCursor,
        hasMore,
      });
    }

    // ── Offset-based path (backward compat + page-number UI) ──────────────────
    const skip = (page - 1) * limit;
    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({ where, include: TX_INCLUDE, orderBy, skip, take: limit }),
      prisma.transaction.count({ where }),
    ]);

    const lastRow = transactions[transactions.length - 1];
    const nextCursor = lastRow && (skip + limit) < total
      ? Buffer.from(JSON.stringify({ date: lastRow.date.toISOString(), id: lastRow.id })).toString('base64url')
      : null;

    return res.json({
      transactions: transactions.map(formatTx),
      total,
      page,
      totalPages: Math.ceil(total / limit),
      nextCursor,
    });
  } catch (err) {
    console.error('[transactions/list]', err);
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

    const where: Record<string, unknown> = { householdId };

    if (accountId) where.accountId = accountId;

    if (startDate || endDate) {
      const dateFilter: { gte?: Date; lte?: Date } = {};
      if (startDate) dateFilter.gte = new Date(startDate);
      if (endDate) dateFilter.lte = new Date(endDate);
      where.date = dateFilter;
    }

    const transactions = await prisma.transaction.findMany({
      where,
      include: TX_INCLUDE,
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
      take: 10000,
    });

    const rows = transactions.map(t => ({
      date: t.date.toISOString().slice(0, 10),
      description: formatMerchantName(t.merchant, t.description),
      amount: t.amount,
      type: t.amount >= 0 ? 'Income' : 'Expense',
      category: t.category?.name ?? '',
      account: t.account.name,
      notes: t.notes ?? '',
    }));

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
    console.error('[transactions/export/csv]', err);
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

    const result = await prisma.transaction.updateMany({
      where: { householdId, date: { lt: cutoff } },
      data: { isHidden: true },
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
    console.error('[transactions/before DELETE]', err);
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
    const rawDesc = row[descIdx] ?? '';
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
    const { accountId, dateFormat, mapping: mappingStr } = bodyParsed.data;

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
    console.error('[transactions/import/preview]', err);
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
    const { accountId, dateFormat, mapping: mappingStr } = bodyParsed.data;

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

    // Run all inserts in a transaction
    const created = await prisma.$transaction(async (tx) => {
      const results: string[] = [];

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

        const newTx = await tx.transaction.create({
          data: {
            householdId,
            accountId,
            date: row.date,
            description: row.description,
            originalDescription: row.description,
            amount: row.amount,
            categoryId,
            merchantId,
            notes: row.notes ?? null,
            needsReview: true, // imported transactions start as needing review
            isHidden: false,
            isRecurring: false,
            isSplit: false,
          },
          select: { id: true },
        });
        results.push(newTx.id);
      }

      return results;
    });

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
    console.error('[transactions/import]', err);
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

    const tx = await prisma.transaction.findFirst({
      where: { id, householdId },
      include: TX_INCLUDE,
    });

    if (!tx) return res.status(404).json({ error: 'Transaction not found' });

    const base = formatTx(tx);

    // Parse splits from splitDetails JSON if isSplit
    let splits: Array<{
      id: string;
      categoryId: string | null;
      categoryName: string | null;
      amount: number;
      notes: string | null;
    }> = [];

    if (tx.isSplit && tx.splitDetails) {
      const raw = tx.splitDetails as any;
      if (Array.isArray(raw)) {
        splits = raw.map((s: any) => ({
          id: s.id ?? '',
          categoryId: s.categoryId ?? null,
          categoryName: s.categoryName ?? null,
          amount: typeof s.amount === 'number' ? s.amount : 0,
          notes: s.notes ?? null,
        }));
      }
    }

    return res.json({ ...base, splits, attachments: [] });
  } catch (err) {
    console.error('[transactions/get]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/v1/transactions
// ---------------------------------------------------------------------------
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const { date, description, amount, accountId, categoryId, notes, tagIds, isRecurring } = req.body;

    // Validation
    if (!date) return res.status(400).json({ error: 'date is required' });
    if (!description) return res.status(400).json({ error: 'description is required' });
    if (amount === undefined || amount === null) return res.status(400).json({ error: 'amount is required' });
    if (amount === 0) return res.status(400).json({ error: 'amount must be non-zero' });
    if (!accountId) return res.status(400).json({ error: 'accountId is required' });

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

    const tx = await prisma.transaction.create({
      data: {
        householdId,
        accountId,
        date: new Date(date),
        description,
        originalDescription: description,
        amount,
        categoryId: categoryId ?? null,
        notes: notes ?? null,
        isRecurring: isRecurring ?? false,
        needsReview: false,
        isHidden: false,
        isSplit: false,
        ...(tagIds && Array.isArray(tagIds) && tagIds.length > 0
          ? { tags: { create: tagIds.map((tagId: string) => ({ tagId })) } }
          : {}),
      },
      include: TX_INCLUDE,
    });

    logAudit({ householdId, userId: req.userId!, action: 'CREATE', entity: 'TRANSACTION', entityId: tx.id, after: { amount: tx.amount, description: tx.description } });
    return res.status(201).json(formatTx(tx));
  } catch (err) {
    console.error('[transactions/create]', err);
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
    const existing = await prisma.transaction.findFirst({ where: { id, householdId } });
    if (!existing) return res.status(404).json({ error: 'Transaction not found' });

    const allowed = ['date', 'description', 'amount', 'categoryId', 'accountId', 'notes', 'isRecurring', 'needsReview', 'isHidden'];
    const data: any = {};

    for (const field of allowed) {
      if (req.body[field] !== undefined) {
        if (field === 'date') {
          data.date = new Date(req.body.date);
        } else if (field === 'amount' && req.body.amount === 0) {
          return res.status(400).json({ error: 'amount must be non-zero' });
        } else {
          data[field] = req.body[field];
        }
      }
    }

    // If changing accountId, verify it belongs to the household
    if (data.accountId) {
      const account = await prisma.account.findFirst({ where: { id: data.accountId, householdId } });
      if (!account) return res.status(404).json({ error: 'Account not found' });
    }

    // If changing categoryId, verify it belongs to the household
    if (data.categoryId) {
      const cat = await prisma.category.findFirst({ where: { id: data.categoryId, householdId } });
      if (!cat) return res.status(404).json({ error: 'Category not found' });
    }

    const tx = await prisma.transaction.update({
      where: { id },
      data,
      include: TX_INCLUDE,
    });

    logAudit({ householdId, userId: req.userId!, action: 'UPDATE', entity: 'TRANSACTION', entityId: tx.id, before: { amount: existing.amount, description: existing.description }, after: { amount: tx.amount, description: tx.description } });
    return res.json(formatTx(tx));
  } catch (err) {
    console.error('[transactions/update]', err);
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

    const existing = await prisma.transaction.findFirst({ where: { id, householdId } });
    if (!existing) return res.status(404).json({ error: 'Transaction not found' });

    await prisma.transaction.delete({ where: { id } });
    logAudit({ householdId, userId: req.userId!, action: 'DELETE', entity: 'TRANSACTION', entityId: id, before: { amount: existing.amount, description: existing.description } });

    return res.json({ success: true });
  } catch (err) {
    console.error('[transactions/delete]', err);
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
    const tx = await prisma.transaction.findFirst({ where: { id, householdId } });
    if (!tx) return res.status(404).json({ error: 'Transaction not found' });

    // Validate tags belong to household
    const validTags = await prisma.tag.findMany({
      where: { id: { in: tagIds }, householdId },
      select: { id: true },
    });
    if (validTags.length !== tagIds.length) {
      return res.status(400).json({ error: 'One or more tagIds are invalid' });
    }

    // Upsert each tag link (createMany + skipDuplicates)
    await prisma.transactionTag.createMany({
      data: tagIds.map((tagId: string) => ({ transactionId: id, tagId })),
      skipDuplicates: true,
    });

    // Return updated tags
    const updated = await prisma.transactionTag.findMany({
      where: { transactionId: id },
      include: { tag: { select: { id: true, name: true, color: true } } },
    });

    return res.json(updated.map(tt => ({ id: tt.tag.id, name: tt.tag.name, color: tt.tag.color })));
  } catch (err) {
    console.error('[transactions/addTags]', err);
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
    const tx = await prisma.transaction.findFirst({ where: { id, householdId } });
    if (!tx) return res.status(404).json({ error: 'Transaction not found' });

    const link = await prisma.transactionTag.findUnique({
      where: { transactionId_tagId: { transactionId: id, tagId } },
    });
    if (!link) return res.status(404).json({ error: 'Tag not found on transaction' });

    await prisma.transactionTag.delete({
      where: { transactionId_tagId: { transactionId: id, tagId } },
    });

    return res.json({ success: true });
  } catch (err) {
    console.error('[transactions/removeTag]', err);
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

    const tx = await prisma.transaction.findFirst({ where: { id, householdId } });
    if (!tx) return res.status(404).json({ error: 'Transaction not found' });

    const updated = await prisma.transaction.update({
      where: { id },
      data: { needsReview: !reviewed },
      select: { needsReview: true },
    });

    return res.json({ needsReview: updated.needsReview });
  } catch (err) {
    console.error('[transactions/review]', err);
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

    // Verify all transactions belong to the household
    const count = await prisma.transaction.count({
      where: { id: { in: ids }, householdId },
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
        await prisma.transaction.updateMany({
          where: { id: { in: ids }, householdId },
          data: { categoryId },
        });
        break;
      }

      case 'mark-reviewed': {
        await prisma.transaction.updateMany({
          where: { id: { in: ids }, householdId },
          data: { needsReview: false },
        });
        break;
      }

      case 'hide': {
        await prisma.transaction.updateMany({
          where: { id: { in: ids }, householdId },
          data: { isHidden: true },
        });
        break;
      }

      case 'delete': {
        await prisma.transaction.deleteMany({
          where: { id: { in: ids }, householdId },
        });
        break;
      }

      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }

    return res.json({ updated: ids.length });
  } catch (err: any) {
    console.error('[transactions/bulk]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
