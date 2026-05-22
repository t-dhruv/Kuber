import { Router, Response } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { logAudit } from '../lib/audit';
import { toCSV, setCsvHeaders } from '../lib/csvExport';
import { NOT_DELETED } from '../lib/softDeleteWhere';
import { createJournalFromLegacyTransaction, getVirtualAccountsByType } from '../lib/legacyToJournalMigration';
import { encryptedFieldSchema } from '../lib/encryptedField';

const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = file.originalname.split('.').pop()?.toLowerCase();
    if (ext === 'csv') cb(null, true);
    else cb(new Error('Only CSV files are accepted'));
  },
});

// CSV parser (RFC 4180 compliant — handles quoted fields)
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
      else if (ch === ',') { row.push(field.trim()); field = ''; }
      else if (ch === '\n' || (ch === '\r' && next === '\n')) {
        if (ch === '\r') i++;
        row.push(field.trim()); field = '';
        if (row.some((c) => c)) rows.push(row);
        row = [];
      } else if (ch === '\r') {
        row.push(field.trim()); field = '';
        if (row.some((c) => c)) rows.push(row);
        row = [];
      } else { field += ch; }
    }
  }
  if (field || row.length > 0) { row.push(field.trim()); if (row.some((c) => c)) rows.push(row); }
  return rows;
}

const bulkRowSchema = z.object({
  name:                  z.string().min(1),
  type:                  z.string().min(1),
  balance:               z.number(),
  institution:           z.string().optional(),
  last_four:             z.string().max(4).optional(),
  currency:              z.string().length(3).default('USD'),
  credit_limit:          z.number().min(0).optional(),
  exclude_from_net_worth: z.boolean().default(false),
  id:                    z.string().optional(), // present → update; absent → create
});

const router = Router();

const VIRTUAL_ACCOUNT_TYPES = ['expense', 'revenue', 'equity'];

const VALID_ACCOUNT_TYPES = [
  'CHECKING', 'SAVINGS', 'CREDIT_CARD', 'INVESTMENT', 'LOAN', 'OTHER',
  // Canadian registered accounts
  'TFSA', 'RRSP', 'FHSA', 'RESP',
  // US retirement accounts
  '401K', 'IRA', 'ROTH_IRA',
];

function formatAccount(account: {
  id: string;
  name: string;
  nameEncrypted?: unknown;
  type: string;
  institution: string | null;
  institutionEncrypted?: unknown;
  institutionLogo: string | null;
  lastFour: string | null;
  balance: number;
  currency: string;
  creditLimit: number | null;
  isHidden: boolean;
  excludeFromNetWorth: boolean;
  lastSynced: Date | null;
  createdAt: Date;
}) {
  const availableCredit =
    account.type === 'CREDIT_CARD' && account.creditLimit != null
      ? account.creditLimit + account.balance
      : null;
  return {
    id: account.id,
    name: account.name,
    nameEncrypted: account.nameEncrypted ?? null,
    type: account.type,
    institution: account.institution,
    institutionEncrypted: account.institutionEncrypted ?? null,
    institutionLogo: account.institutionLogo,
    lastFour: account.lastFour,
    balance: account.balance,
    currency: account.currency,
    creditLimit: account.creditLimit ?? null,
    availableCredit,
    isHidden: account.isHidden,
    excludeFromNetWorth: account.excludeFromNetWorth,
    lastSyncedAt: account.lastSynced ? account.lastSynced.toISOString() : null,
    createdAt: account.createdAt.toISOString(),
  };
}

function parseEncryptedFieldInput(value: unknown, fieldName: string) {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.JsonNull;
  const parsed = encryptedFieldSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error(`${fieldName} must be a valid encrypted field envelope`);
  }
  return parsed.data;
}

// GET /api/v1/accounts
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;

    const accounts = await prisma.account.findMany({
      where: { householdId, ...NOT_DELETED, type: { notIn: VIRTUAL_ACCOUNT_TYPES } },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    });

    // Group by type
    const groupMap = new Map<string, typeof accounts>();
    for (const account of accounts) {
      const type = account.type;
      if (!groupMap.has(type)) groupMap.set(type, []);
      groupMap.get(type)!.push(account);
    }

    const groups = Array.from(groupMap.entries()).map(([type, accs]) => ({
      type,
      totalBalance: accs.reduce((sum, a) => sum + a.balance, 0),
      accounts: accs.map(formatAccount),
    }));

    // Net worth: only non-excluded accounts
    const netWorthAccounts = accounts.filter(a => !a.excludeFromNetWorth);
    const LIABILITY_TYPES = ['CREDIT_CARD', 'LOAN'];

    const assets = netWorthAccounts
      .filter(a => !LIABILITY_TYPES.includes(a.type) && a.balance > 0)
      .reduce((sum, a) => sum + a.balance, 0);

    // Credit cards and loans are always liabilities. If balance is positive (overpayment),
    // they contribute 0 to liabilities (not counted as assets).
    const liabilities = netWorthAccounts
      .filter(a => LIABILITY_TYPES.includes(a.type) || a.balance < 0)
      .reduce((sum, a) => {
        return sum + (LIABILITY_TYPES.includes(a.type) ? Math.min(a.balance, 0) : a.balance);
      }, 0);

    return res.json({
      groups,
      netWorth: {
        assets,
        liabilities,
        total: assets + liabilities,
      },
    });
  } catch (err) {
    req.log.error({ err }, 'accounts/GET /');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/accounts/export/csv
router.get('/export/csv', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;

    const accounts = await prisma.account.findMany({
      where: { householdId, ...NOT_DELETED, type: { notIn: VIRTUAL_ACCOUNT_TYPES } },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    });

    const rows = accounts.map(a => ({
      name: a.name,
      type: a.type,
      institution: a.institution ?? '',
      lastFour: a.lastFour ?? '',
      balance: a.balanceDecimal ? Number(a.balanceDecimal) : a.balance,
      currency: a.currency,
      hidden: a.isHidden ? 'Yes' : 'No',
      excludeFromNetWorth: a.excludeFromNetWorth ? 'Yes' : 'No',
    }));

    const columns = [
      { key: 'name',               header: 'Name' },
      { key: 'type',               header: 'Type' },
      { key: 'institution',        header: 'Institution' },
      { key: 'lastFour',           header: 'Last Four' },
      { key: 'balance',            header: 'Balance' },
      { key: 'currency',           header: 'Currency' },
      { key: 'hidden',             header: 'Hidden' },
      { key: 'excludeFromNetWorth', header: 'Exclude From Net Worth' },
    ];

    const filename = `accounts-${new Date().toISOString().slice(0, 10)}.csv`;
    setCsvHeaders(res, filename);
    return res.send(toCSV(rows, columns));
  } catch (err) {
    req.log.error({ err }, 'accounts/export/csv');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/accounts/:id/history?range=1M|3M|6M|1Y
router.get('/:id/history', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const { id } = req.params;

    const account = await prisma.account.findFirst({ where: { id, householdId, ...NOT_DELETED }, select: { id: true } });
    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    const VALID_RANGES = ['1M', '3M', '6M', '1Y'] as const;
    type Range = typeof VALID_RANGES[number];
    const rawRange = String(req.query.range ?? '3M').toUpperCase();
    const range: Range = (VALID_RANGES as readonly string[]).includes(rawRange)
      ? (rawRange as Range)
      : '3M';

    const now = new Date();
    const startDate = new Date(now);
    if (range === '1M') startDate.setMonth(startDate.getMonth() - 1);
    else if (range === '3M') startDate.setMonth(startDate.getMonth() - 3);
    else if (range === '6M') startDate.setMonth(startDate.getMonth() - 6);
    else startDate.setFullYear(startDate.getFullYear() - 1);

    const snapshots = await prisma.accountBalanceSnapshot.findMany({
      where: {
        accountId: id,
        householdId,
        date: { gte: startDate },
      },
      orderBy: { date: 'asc' },
      select: { date: true, balance: true },
    });

    return res.json(
      snapshots.map((s) => ({
        date: s.date.toISOString().slice(0, 10),
        balance: s.balance,
      })),
    );
  } catch (err) {
    req.log.error({ err }, 'accounts/GET /:id/history');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/accounts/:id
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const { id } = req.params;

    const account = await prisma.account.findFirst({ where: { id, householdId, ...NOT_DELETED } });

    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    // Fetch transactions for balance history (12 months back)
    const now = new Date();
    const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);

    const journals = await prisma.transactionJournal.findMany({
      where: {
        householdId,
        entries: { some: { accountId: id } },
        date: { gte: twelveMonthsAgo },
        isHidden: false,
        isDeleted: false,
      },
      select: { date: true, amountDecimal: true },
      orderBy: { date: 'asc' },
    });

    // Build monthly sum map
    const monthlySums = new Map<string, number>();
    for (const j of journals) {
      const key = `${j.date.getFullYear()}-${String(j.date.getMonth() + 1).padStart(2, '0')}`;
      monthlySums.set(key, (monthlySums.get(key) ?? 0) + Number(j.amountDecimal));
    }

    // Back-project from current balance: start at current, walk backwards subtracting each month's net
    const balanceHistory: Array<{ date: string; balance: number }> = [];
    let runningBalance = account.balance;
    for (let i = 0; i < 12; i++) {
      const pointDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${pointDate.getFullYear()}-${String(pointDate.getMonth() + 1).padStart(2, '0')}`;
      balanceHistory.unshift({
        date: pointDate.toISOString().slice(0, 10),
        balance: Math.round(runningBalance * 100) / 100,
      });
      runningBalance -= monthlySums.get(key) ?? 0;
    }

    // Recent journals (last 10)
    const recentJournals = await prisma.transactionJournal.findMany({
      where: { householdId, entries: { some: { accountId: id } }, isHidden: false, isDeleted: false },
      orderBy: { date: 'desc' },
      take: 10,
      include: {
        category: { select: { name: true, icon: true } },
        merchant: { select: { displayName: true } },
      },
    });

    const recentTransactions = recentJournals.map(j => ({
      id: j.id,
      date: j.date.toISOString(),
      merchantName: j.merchant?.displayName ?? j.description,
      amount: Number(j.amountDecimal),
      categoryName: j.category?.name ?? null,
      categoryIcon: j.category?.icon ?? null,
    }));

    return res.json({
      account: formatAccount(account),
      balanceHistory,
      recentTransactions,
    });
  } catch (err) {
    req.log.error({ err }, 'accounts/GET /:id');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/v1/accounts
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const {
      name,
      type,
      institution,
      institutionLogo,
      lastFour,
      balance,
      currency,
      creditLimit,
      nameEncrypted,
      institutionEncrypted,
    } = req.body;

    if (!name || typeof name !== 'string' || name.trim() === '') {
      return res.status(400).json({ error: 'name is required' });
    }
    const normalizedType = typeof type === 'string' ? type.toUpperCase().replace(/\s+/g, '_') : type;
    if (!normalizedType || !VALID_ACCOUNT_TYPES.includes(normalizedType)) {
      return res.status(400).json({ error: `type must be one of: ${VALID_ACCOUNT_TYPES.join(', ')}` });
    }
    if (balance === undefined || balance === null || typeof balance !== 'number') {
      return res.status(400).json({ error: 'balance must be a number' });
    }

    const parsedNameEncrypted = parseEncryptedFieldInput(nameEncrypted, 'nameEncrypted');
    const parsedInstitutionEncrypted = parseEncryptedFieldInput(institutionEncrypted, 'institutionEncrypted');

    const account = await prisma.account.create({
      data: {
        householdId,
        name: name.trim(),
        nameEncrypted: parsedNameEncrypted,
        type: normalizedType,
        institution: institution ?? null,
        institutionEncrypted: parsedInstitutionEncrypted,
        institutionLogo: institutionLogo ?? null,
        lastFour: lastFour ?? null,
        balance,
        currency: currency ?? 'USD',
        creditLimit: normalizedType === 'CREDIT_CARD' && typeof creditLimit === 'number' && creditLimit > 0 ? creditLimit : null,
        // notes is not a field on the Account model per schema — ignored
      },
    });

    logAudit({ householdId, userId: req.userId!, action: 'CREATE', entity: 'ACCOUNT', entityId: account.id, after: { name: account.name, type: account.type } });
    return res.status(201).json({ account: formatAccount(account) });
  } catch (err) {
    req.log.error({ err }, 'accounts/POST /');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/v1/accounts/:id
router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const { id } = req.params;

    const existing = await prisma.account.findFirst({ where: { id, householdId, ...NOT_DELETED } });
    if (!existing) {
      return res.status(404).json({ error: 'Account not found' });
    }

    const {
      name,
      type,
      institution,
      institutionLogo,
      lastFour,
      isHidden,
      excludeFromNetWorth,
      nameEncrypted,
      institutionEncrypted,
    } = req.body;

    const data: Record<string, unknown> = {};
    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim() === '') {
        return res.status(400).json({ error: 'name must be a non-empty string' });
      }
      data.name = name.trim();
    }
    if (nameEncrypted !== undefined) {
      data.nameEncrypted = parseEncryptedFieldInput(nameEncrypted, 'nameEncrypted');
    }
    if (type !== undefined) {
      const normalizedType = String(type).toUpperCase().replace(/\s+/g, '_');
      if (!VALID_ACCOUNT_TYPES.includes(normalizedType)) {
        return res.status(400).json({ error: `Invalid account type. Valid: ${VALID_ACCOUNT_TYPES.join(', ')}` });
      }
      data.type = normalizedType;
    }
    if (institution !== undefined) data.institution = institution;
    if (institutionEncrypted !== undefined) {
      data.institutionEncrypted = parseEncryptedFieldInput(institutionEncrypted, 'institutionEncrypted');
    }
    if (institutionLogo !== undefined) data.institutionLogo = institutionLogo ?? null;
    if (lastFour !== undefined) data.lastFour = lastFour;
    if (isHidden !== undefined) data.isHidden = isHidden;
    if (excludeFromNetWorth !== undefined) data.excludeFromNetWorth = excludeFromNetWorth;
    const { creditLimit, balance } = req.body;
    if (creditLimit !== undefined) {
      data.creditLimit = typeof creditLimit === 'number' && creditLimit > 0 ? creditLimit : null;
    }
    if (balance !== undefined) {
      const parsed = Number(balance);
      if (isNaN(parsed)) return res.status(400).json({ error: 'balance must be a number' });
      data.balance = parsed;
    }

    const account = await prisma.account.update({ where: { id }, data });
    logAudit({ householdId, userId: req.userId!, action: 'UPDATE', entity: 'ACCOUNT', entityId: id, before: { name: existing.name }, after: { name: account.name } });

    return res.json({ account: formatAccount(account) });
  } catch (err) {
    req.log.error({ err }, 'accounts/PUT /:id');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/v1/accounts/:id/reconcile
router.post('/:id/reconcile', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const { id } = req.params;
    const { actualBalance } = req.body;

    if (actualBalance === undefined || isNaN(Number(actualBalance))) {
      return res.status(400).json({ error: 'actualBalance is required and must be a number' });
    }

    const account = await prisma.account.findFirst({ where: { id, householdId, ...NOT_DELETED } });
    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    const target = Number(actualBalance);
    const adjustment = target - Number(account.balance);

    if (Math.abs(adjustment) < 0.001) {
      return res.json({ message: 'Already balanced', adjustment: 0 });
    }

    // Create balance adjustment as journal transaction
    const virtualAccounts = await getVirtualAccountsByType(householdId);
    const expenseAccountId = adjustment < 0 ? virtualAccounts.expenseAccountId : virtualAccounts.revenueAccountId;

    if (!expenseAccountId) {
      throw new Error('Missing virtual account for balance adjustment');
    }

    await prisma.$transaction(async (tx) => {
      await createJournalFromLegacyTransaction(
        tx,
        {
          householdId,
          accountId: id,
          date: new Date(),
          description: 'Balance Adjustment',
          amount: adjustment,
        },
        adjustment < 0 ? expenseAccountId : undefined,
        adjustment > 0 ? expenseAccountId : undefined,
      );

      // Update account balance
      await tx.account.update({
        where: { id },
        data: { balance: target },
      });
    });

    logAudit({ householdId, userId: req.userId!, action: 'UPDATE', entity: 'ACCOUNT', entityId: id, before: { balance: account.balance }, after: { balance: target } });

    return res.json({ message: 'Account reconciled', adjustment });
  } catch (err) {
    req.log.error({ err }, 'accounts/POST /:id/reconcile');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/v1/accounts/:id/close
router.post('/:id/close', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const { id } = req.params;

    const existing = await prisma.account.findFirst({ where: { id, householdId, ...NOT_DELETED } });
    if (!existing) {
      return res.status(404).json({ error: 'Account not found' });
    }

    // Schema has no isActive field; use isHidden for soft-close
    await prisma.account.update({ where: { id }, data: { isHidden: true } });

    return res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, 'accounts/POST /:id/close');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/v1/accounts/:id
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const { id } = req.params;

    const existing = await prisma.account.findFirst({ where: { id, householdId, ...NOT_DELETED } });
    if (!existing) {
      return res.status(404).json({ error: 'Account not found' });
    }

    await prisma.$transaction(async (tx) => {
      await tx.transactionJournal.updateMany({
        where: { entries: { some: { accountId: id } }, householdId },
        data: { isDeleted: true, isHidden: true },
      });
      await tx.recurringItem.updateMany({
        where: { householdId, accountId: id, isDeleted: false },
        data: { isDeleted: true, isActive: false },
      });
      await tx.goal.updateMany({
        where: { householdId, accountId: id, isDeleted: false },
        data: { isDeleted: true },
      });
      await tx.taxAccount.updateMany({
        where: { householdId, linkedAccountId: id },
        data: { linkedAccountId: null },
      });
      await tx.accountBalanceSnapshot.deleteMany({
        where: { householdId, accountId: id },
      });
      await tx.reconciliation.deleteMany({
        where: { householdId, accountId: id },
      });
      await tx.reportingSnapshot.deleteMany({
        where: { householdId, kind: 'account_balance', subjectId: id },
      });
      await tx.reportingRollup.deleteMany({
        where: { householdId, kind: 'account_balance', subjectId: id },
      });
      await tx.investmentHolding.deleteMany({
        where: { accountId: id },
      });
      await tx.account.update({
        where: { id },
        data: { isDeleted: true, isHidden: true },
      });
    });

    return res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, 'accounts/DELETE /:id');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/accounts/:id/transactions
router.get('/:id/transactions', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const { id } = req.params;

    const account = await prisma.account.findFirst({ where: { id, householdId, ...NOT_DELETED } });
    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(String(req.query.limit ?? '20'), 10) || 20));
    const skip = (page - 1) * limit;

    const dateFilter: { gte?: Date; lte?: Date } = {};
    if (req.query.startDate) {
      const d = new Date(String(req.query.startDate));
      if (!isNaN(d.getTime())) dateFilter.gte = d;
    }
    if (req.query.endDate) {
      const d = new Date(String(req.query.endDate));
      if (!isNaN(d.getTime())) dateFilter.lte = d;
    }

    const journalWhere = {
      householdId,
      entries: { some: { accountId: id } },
      isHidden: false,
      isDeleted: false,
      ...(Object.keys(dateFilter).length > 0 ? { date: dateFilter } : {}),
    };

    const [total, journals] = await Promise.all([
      prisma.transactionJournal.count({ where: journalWhere }),
      prisma.transactionJournal.findMany({
        where: journalWhere,
        orderBy: { date: 'desc' },
        skip,
        take: limit,
        include: {
          category: { select: { name: true, icon: true } },
          merchant: { select: { displayName: true } },
        },
      }),
    ]);

    const data = journals.map(j => ({
      id: j.id,
      date: j.date.toISOString(),
      description: j.description,
      merchantName: j.merchant?.displayName ?? j.description,
      amount: Number(j.amountDecimal),
      categoryName: j.category?.name ?? null,
      categoryIcon: j.category?.icon ?? null,
      isRecurring: j.isRecurring,
      needsReview: j.needsReview,
      isPending: j.isPending,
    }));

    return res.json({
      transactions: data,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    req.log.error({ err }, 'accounts/GET /:id/transactions');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /api/v1/accounts/bulk-import/template ────────────────────────────────
// Returns a CSV template the user can fill in.

router.get('/bulk-import/template', (_req: AuthRequest, res: Response) => {
  const header = 'name,type,balance,institution,last_four,currency,credit_limit,exclude_from_net_worth,id';
  const example = [
    'Chase Checking,CHECKING,2500.00,Chase Bank,4321,USD,,,',
    'Scotia Visa,CREDIT_CARD,-1200.00,Scotia Bank,8899,CAD,5000,,',
    'TD Savings,SAVINGS,8000.00,TD Bank,,USD,,,',
  ].join('\n');
  setCsvHeaders(res, 'accounts-import-template.csv');
  return res.send(`${header}\n${example}`);
});

// ── POST /api/v1/accounts/bulk-import/preview ────────────────────────────────
// Parses the CSV and returns a preview with per-row validation — no DB writes.

router.post('/bulk-import/preview', csvUpload.single('file'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const householdId = req.householdId!;
    const text = req.file.buffer.toString('utf-8');
    const rows = parseCSV(text);
    if (rows.length < 2) return res.status(400).json({ error: 'CSV must have a header row and at least one data row' });

    // Normalise header: lowercase + trim + spaces→underscore
    const header = rows[0].map((h) => h.toLowerCase().replace(/\s+/g, '_').replace(/-/g, '_'));
    const dataRows = rows.slice(1);

    // Fetch existing accounts so we can resolve update targets and detect name conflicts
    const existingAccounts = await prisma.account.findMany({
      where: { householdId, ...NOT_DELETED },
      select: { id: true, name: true, type: true },
    });
    const existingById   = new Map(existingAccounts.map((a) => [a.id, a]));
    const existingByName = new Map(existingAccounts.map((a) => [a.name.toLowerCase(), a]));

    type RowResult = {
      rowIndex: number;
      action:   'create' | 'update' | 'skip';
      data:     Record<string, unknown>;
      errors:   string[];
      warnings: string[];
    };

    const results: RowResult[] = dataRows.map((cols, idx) => {
      const raw: Record<string, string> = {};
      header.forEach((h, i) => { raw[h] = cols[i] ?? ''; });

      const errors: string[]   = [];
      const warnings: string[] = [];

      // Map raw strings to typed values
      const parsed: Record<string, unknown> = {
        name:                  raw.name?.trim(),
        type:                  raw.type?.trim().toUpperCase().replace(/\s+/g, '_') || undefined,
        balance:               raw.balance !== '' ? parseFloat(raw.balance) : undefined,
        institution:           raw.institution?.trim() || undefined,
        last_four:             raw.last_four?.replace(/\D/g, '').slice(0, 4) || undefined,
        currency:              raw.currency?.trim().toUpperCase() || 'USD',
        credit_limit:          raw.credit_limit !== '' && raw.credit_limit ? parseFloat(raw.credit_limit) : undefined,
        exclude_from_net_worth: raw.exclude_from_net_worth === 'true' || raw.exclude_from_net_worth === '1',
        id:                    raw.id?.trim() || undefined,
      };

      const validated = bulkRowSchema.safeParse(parsed);
      if (!validated.success) {
        validated.error.errors.forEach((e) => errors.push(`${e.path.join('.')}: ${e.message}`));
      }

      if (isNaN(parsed.balance as number)) errors.push('balance must be a valid number');
      if (parsed.type && !VALID_ACCOUNT_TYPES.includes(parsed.type as string)) {
        errors.push(`type "${parsed.type}" is not valid — must be one of: ${VALID_ACCOUNT_TYPES.join(', ')}`);
      }

      // Determine action
      let action: 'create' | 'update' | 'skip' = 'create';
      if (parsed.id) {
        if (existingById.has(parsed.id as string)) {
          action = 'update';
        } else {
          errors.push(`id "${parsed.id}" not found in this household`);
          action = 'skip';
        }
      } else {
        // Check name collision → treat as update suggestion
        const match = existingByName.get((parsed.name as string)?.toLowerCase());
        if (match) {
          warnings.push(`Account named "${parsed.name}" already exists (id: ${match.id}) — will be treated as UPDATE`);
          parsed.id = match.id;
          action = 'update';
        }
      }

      return { rowIndex: idx + 2, action, data: parsed, errors, warnings };
    });

    const summary = {
      total:   results.length,
      creates: results.filter((r) => r.action === 'create').length,
      updates: results.filter((r) => r.action === 'update').length,
      errors:  results.filter((r) => r.errors.length > 0).length,
    };

    return res.json({ summary, rows: results });
  } catch (err) {
    req.log.error({ err }, 'accounts/bulk-import/preview');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /api/v1/accounts/bulk-import/confirm ────────────────────────────────
// Applies validated rows: creates new accounts and updates existing ones.

router.post('/bulk-import/confirm', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;

    const rowsSchema = z.array(z.object({
      action: z.enum(['create', 'update']),
      data:   z.record(z.unknown()),
    }));
    const parsed = rowsSchema.safeParse(req.body.rows);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid rows payload' });

    const rows = parsed.data.filter((r) => r.action === 'create' || r.action === 'update');
    if (rows.length === 0) return res.status(400).json({ error: 'No rows to import' });

    const created: unknown[] = [];
    const updated: unknown[] = [];
    const failed:  Array<{ rowIndex?: number; error: string }> = [];

    for (const row of rows) {
      const d = row.data as Record<string, unknown>;
      try {
        const normalizedType = String(d.type ?? '').toUpperCase().replace(/\s+/g, '_');

        if (row.action === 'create') {
          const account = await prisma.account.create({
            data: {
              householdId,
              name:        String(d.name).trim(),
              type:        normalizedType,
              balance:     Number(d.balance),
              institution: d.institution ? String(d.institution) : null,
              lastFour:    d.last_four   ? String(d.last_four)   : null,
              currency:    d.currency    ? String(d.currency)    : 'USD',
              creditLimit: normalizedType === 'CREDIT_CARD' && d.credit_limit ? Number(d.credit_limit) : null,
              excludeFromNetWorth: Boolean(d.exclude_from_net_worth),
            },
          });
          logAudit({ householdId, userId: req.userId!, action: 'CREATE', entity: 'ACCOUNT', entityId: account.id, after: { name: account.name, type: account.type, source: 'bulk-import' } });
          created.push(formatAccount(account));
        } else {
          // update
          const existing = await prisma.account.findUnique({ where: { id: String(d.id) } });
          if (!existing || existing.householdId !== householdId) {
            failed.push({ error: `Account ${d.id} not found` });
            continue;
          }
          const updateData: Record<string, unknown> = {};
          if (d.name        !== undefined) updateData.name        = String(d.name).trim();
          if (d.balance     !== undefined) updateData.balance     = Number(d.balance);
          if (d.institution !== undefined) updateData.institution = d.institution ? String(d.institution) : null;
          if (d.last_four   !== undefined) updateData.lastFour    = d.last_four   ? String(d.last_four)   : null;
          if (d.currency    !== undefined) updateData.currency    = String(d.currency);
          if (d.credit_limit !== undefined) {
            updateData.creditLimit = existing.type === 'CREDIT_CARD' && d.credit_limit ? Number(d.credit_limit) : null;
          }
          if (d.exclude_from_net_worth !== undefined) updateData.excludeFromNetWorth = Boolean(d.exclude_from_net_worth);

          const account = await prisma.account.update({ where: { id: String(d.id) }, data: updateData });
          logAudit({ householdId, userId: req.userId!, action: 'UPDATE', entity: 'ACCOUNT', entityId: account.id, before: { name: existing.name }, after: { name: account.name, source: 'bulk-import' } });
          updated.push(formatAccount(account));
        }
      } catch (rowErr) {
        req.log.error({ rowErr }, 'row error');
        failed.push({ error: `Failed to ${row.action} account "${d.name}": ${(rowErr as Error).message}` });
      }
    }

    return res.json({
      created: created.length,
      updated: updated.length,
      failed:  failed.length,
      errors:  failed,
      accounts: [...created, ...updated],
    });
  } catch (err) {
    req.log.error({ err }, 'accounts/bulk-import/confirm');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
