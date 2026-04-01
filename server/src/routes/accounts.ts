import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { logAudit } from '../lib/audit';
import { toCSV, setCsvHeaders } from '../lib/csvExport';

const router = Router();

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
  type: string;
  institution: string | null;
  institutionLogo: string | null;
  lastFour: string | null;
  balance: number;
  currency: string;
  isHidden: boolean;
  excludeFromNetWorth: boolean;
  lastSynced: Date | null;
  createdAt: Date;
}) {
  return {
    id: account.id,
    name: account.name,
    type: account.type,
    institution: account.institution,
    institutionLogo: account.institutionLogo,
    lastFour: account.lastFour,
    balance: account.balance,
    currency: account.currency,
    isHidden: account.isHidden,
    excludeFromNetWorth: account.excludeFromNetWorth,
    lastSyncedAt: account.lastSynced ? account.lastSynced.toISOString() : null,
    createdAt: account.createdAt.toISOString(),
  };
}

// GET /api/v1/accounts
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;

    const accounts = await prisma.account.findMany({
      where: { householdId },
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
    const assets = netWorthAccounts
      .filter(a => a.balance > 0)
      .reduce((sum, a) => sum + a.balance, 0);
    const liabilities = netWorthAccounts
      .filter(a => a.balance < 0)
      .reduce((sum, a) => sum + a.balance, 0);

    return res.json({
      groups,
      netWorth: {
        assets,
        liabilities,
        total: assets + liabilities,
      },
    });
  } catch (err) {
    console.error('[accounts/GET /]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/accounts/export/csv
router.get('/export/csv', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;

    const accounts = await prisma.account.findMany({
      where: { householdId },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    });

    const rows = accounts.map(a => ({
      name: a.name,
      type: a.type,
      institution: a.institution ?? '',
      lastFour: a.lastFour ?? '',
      balance: a.balance,
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
    console.error('[accounts/export/csv]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/accounts/:id/history?range=1M|3M|6M|1Y
router.get('/:id/history', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const { id } = req.params;

    const account = await prisma.account.findUnique({ where: { id }, select: { id: true, householdId: true } });
    if (!account || account.householdId !== householdId) {
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
    console.error('[accounts/GET /:id/history]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/accounts/:id
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const { id } = req.params;

    const account = await prisma.account.findUnique({ where: { id } });

    if (!account || account.householdId !== householdId) {
      return res.status(404).json({ error: 'Account not found' });
    }

    // Fetch transactions for balance history (12 months back)
    const now = new Date();
    const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);

    const transactions = await prisma.transaction.findMany({
      where: {
        accountId: id,
        date: { gte: twelveMonthsAgo },
        isHidden: false,
      },
      select: { date: true, amount: true },
      orderBy: { date: 'asc' },
    });

    // Build monthly sum map
    const monthlySums = new Map<string, number>();
    for (const t of transactions) {
      const key = `${t.date.getFullYear()}-${String(t.date.getMonth() + 1).padStart(2, '0')}`;
      monthlySums.set(key, (monthlySums.get(key) ?? 0) + t.amount);
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

    // Recent transactions (last 10)
    const recentTxns = await prisma.transaction.findMany({
      where: { accountId: id, isHidden: false },
      orderBy: { date: 'desc' },
      take: 10,
      include: {
        category: { select: { name: true, emoji: true } },
        merchant: { select: { displayName: true } },
      },
    });

    const recentTransactions = recentTxns.map(t => ({
      id: t.id,
      date: t.date.toISOString(),
      merchantName: t.merchant?.displayName ?? t.description,
      amount: t.amount,
      categoryName: t.category?.name ?? null,
      categoryIcon: t.category?.emoji ?? null,
    }));

    return res.json({
      account: formatAccount(account),
      balanceHistory,
      recentTransactions,
    });
  } catch (err) {
    console.error('[accounts/GET /:id]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/v1/accounts
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const { name, type, institution, institutionLogo, lastFour, balance, currency, notes } = req.body;

    if (!name || typeof name !== 'string' || name.trim() === '') {
      return res.status(400).json({ error: 'name is required' });
    }
    const normalizedType = typeof type === 'string' ? type.toUpperCase().replace(' ', '_') : type;
    if (!normalizedType || !VALID_ACCOUNT_TYPES.includes(normalizedType)) {
      return res.status(400).json({ error: `type must be one of: ${VALID_ACCOUNT_TYPES.join(', ')}` });
    }
    if (balance === undefined || balance === null || typeof balance !== 'number') {
      return res.status(400).json({ error: 'balance must be a number' });
    }

    const account = await prisma.account.create({
      data: {
        householdId,
        name: name.trim(),
        type: normalizedType,
        institution: institution ?? null,
        institutionLogo: institutionLogo ?? null,
        lastFour: lastFour ?? null,
        balance,
        currency: currency ?? 'USD',
        // notes is not a field on the Account model per schema — ignored
      },
    });

    logAudit({ householdId, userId: req.userId!, action: 'CREATE', entity: 'ACCOUNT', entityId: account.id, after: { name: account.name, type: account.type } });
    return res.status(201).json({ account: formatAccount(account) });
  } catch (err) {
    console.error('[accounts/POST /]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/v1/accounts/:id
router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const { id } = req.params;

    const existing = await prisma.account.findUnique({ where: { id } });
    if (!existing || existing.householdId !== householdId) {
      return res.status(404).json({ error: 'Account not found' });
    }

    const { name, institution, institutionLogo, lastFour, isHidden, excludeFromNetWorth } = req.body;

    const data: Record<string, unknown> = {};
    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim() === '') {
        return res.status(400).json({ error: 'name must be a non-empty string' });
      }
      data.name = name.trim();
    }
    if (institution !== undefined) data.institution = institution;
    if (institutionLogo !== undefined) data.institutionLogo = institutionLogo ?? null;
    if (lastFour !== undefined) data.lastFour = lastFour;
    if (isHidden !== undefined) data.isHidden = isHidden;
    if (excludeFromNetWorth !== undefined) data.excludeFromNetWorth = excludeFromNetWorth;

    const account = await prisma.account.update({ where: { id }, data });
    logAudit({ householdId, userId: req.userId!, action: 'UPDATE', entity: 'ACCOUNT', entityId: id, before: { name: existing.name }, after: { name: account.name } });

    return res.json({ account: formatAccount(account) });
  } catch (err) {
    console.error('[accounts/PUT /:id]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/v1/accounts/:id/close
router.post('/:id/close', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const { id } = req.params;

    const existing = await prisma.account.findUnique({ where: { id } });
    if (!existing || existing.householdId !== householdId) {
      return res.status(404).json({ error: 'Account not found' });
    }

    // Schema has no isActive field; use isHidden for soft-close
    await prisma.account.update({ where: { id }, data: { isHidden: true } });

    return res.json({ success: true });
  } catch (err) {
    console.error('[accounts/POST /:id/close]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/accounts/:id/transactions
router.get('/:id/transactions', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const { id } = req.params;

    const account = await prisma.account.findUnique({ where: { id } });
    if (!account || account.householdId !== householdId) {
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

    const where = {
      accountId: id,
      isHidden: false,
      ...(Object.keys(dateFilter).length > 0 ? { date: dateFilter } : {}),
    };

    const [total, transactions] = await Promise.all([
      prisma.transaction.count({ where }),
      prisma.transaction.findMany({
        where,
        orderBy: { date: 'desc' },
        skip,
        take: limit,
        include: {
          category: { select: { name: true, emoji: true } },
          merchant: { select: { displayName: true } },
        },
      }),
    ]);

    const data = transactions.map(t => ({
      id: t.id,
      date: t.date.toISOString(),
      description: t.description,
      merchantName: t.merchant?.displayName ?? t.description,
      amount: t.amount,
      categoryName: t.category?.name ?? null,
      categoryIcon: t.category?.emoji ?? null,
      isRecurring: t.isRecurring,
      needsReview: t.needsReview,
      isPending: t.isPending,
    }));

    return res.json({
      transactions: data,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error('[accounts/GET /:id/transactions]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
