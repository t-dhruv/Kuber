import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import reportsRouter from '../../src/routes/reports';
import { prisma } from '../../src/lib/prisma';
import { fetchJournalReportRows, type JournalReportRow } from '../../src/lib/journalReportingCore';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    account: { findMany: vi.fn(), count: vi.fn() },
    investmentHolding: { findMany: vi.fn() },
    netWorthSnapshot: { findMany: vi.fn() },
    manualAsset: { findMany: vi.fn() },
    manualLiability: { findMany: vi.fn() },
    duplicateDismissal: { count: vi.fn() },
    importHistory: { count: vi.fn() },
    ruleExecutionLog: { count: vi.fn() },
    budget: { findMany: vi.fn() },
    budgetLimit: { findMany: vi.fn() },
    savedReport: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    category: { findMany: vi.fn(), count: vi.fn() },
    categoryGroup: { findMany: vi.fn() },
    merchant: { findMany: vi.fn() },
    tag: { findMany: vi.fn() },
    transactionJournal: { findMany: vi.fn() },
  },
}));

vi.mock('../../src/lib/journalReportingCore', async () => {
  const actual = await vi.importActual<typeof import('../../src/lib/journalReportingCore')>('../../src/lib/journalReportingCore');
  return {
    ...actual,
    fetchJournalReportRows: vi.fn(),
  };
});

function makeApp(householdId = 'hh-1', userId = 'user-1') {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res: any, next: any) => {
    req.householdId = householdId;
    req.userId = userId;
    req.log = { error: vi.fn(), info: vi.fn(), child: () => req.log };
    next();
  });
  app.use('/reports', reportsRouter);
  return app;
}

const rows: JournalReportRow[] = [
  {
    id: 'journal-food',
    householdId: 'hh-1',
    transactionType: 'withdrawal',
    date: new Date('2026-01-05T00:00:00.000Z'),
    description: 'Market',
    amount: 75,
    signedAmount: -75,
    category: { id: 'cat-food', name: 'Food', icon: 'cart', type: 'expense', isTaxDeductible: false },
    reportAccount: { id: 'acct-checking', name: 'Checking', type: 'bank', excludeFromReports: false },
    tags: [{ id: 'tag-home', name: 'Home', color: '#111111' }],
    entryBalance: 0,
  },
  {
    id: 'journal-payroll',
    householdId: 'hh-1',
    transactionType: 'deposit',
    date: new Date('2026-01-20T00:00:00.000Z'),
    description: 'Payroll',
    amount: 300,
    signedAmount: 300,
    category: { id: 'cat-pay', name: 'Salary', icon: null, type: 'income', isTaxDeductible: false },
    reportAccount: { id: 'acct-checking', name: 'Checking', type: 'bank', excludeFromReports: false },
    tags: [{ id: 'tag-work', name: 'Work', color: '#222222' }],
    entryBalance: 0,
  },
  {
    id: 'journal-transfer',
    householdId: 'hh-1',
    transactionType: 'transfer',
    date: new Date('2026-01-21T00:00:00.000Z'),
    description: 'Move savings',
    amount: 100,
    signedAmount: -100,
    category: null,
    reportAccount: { id: 'acct-checking', name: 'Checking', type: 'bank', excludeFromReports: false },
    tags: [],
    entryBalance: 0,
  },
  {
    id: 'journal-donation',
    householdId: 'hh-1',
    transactionType: 'withdrawal',
    date: new Date('2026-02-10T00:00:00.000Z'),
    description: 'Donation',
    amount: 50,
    signedAmount: -50,
    category: { id: 'cat-charity', name: 'Charity', icon: 'heart', type: 'expense', isTaxDeductible: true },
    reportAccount: { id: 'acct-checking', name: 'Checking', type: 'bank', excludeFromReports: false },
    tags: [],
    entryBalance: 0,
  },
];

describe('journal-backed report routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchJournalReportRows).mockResolvedValue(rows);
  });

  it('serves spending from journal rows without querying flat transactions', async () => {
    const res = await request(makeApp()).get('/reports/spending?startDate=2026-01-01&endDate=2026-01-31&groupBy=category');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      total: 75,
      transactionCount: 1,
      items: [expect.objectContaining({ id: 'cat-food', name: 'Food', amount: 75, percent: 100 })],
    });
    expect(fetchJournalReportRows).toHaveBeenCalledWith({
      householdId: 'hh-1',
      start: new Date('2026-01-01'),
      end: new Date('2026-01-31'),
    });
  });

  it('serves cashflow from journal rows and excludes transfers', async () => {
    const res = await request(makeApp()).get('/reports/cashflow?startDate=2026-01-01&endDate=2026-01-31');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ income: 300, expenses: 75, net: 225 });
    expect(res.body.byMonth).toEqual([{ year: 2026, month: 1, income: 300, expenses: 75, net: 225 }]);
  });

  it('classifies category-level transfers separately in report overview', async () => {
    vi.mocked(prisma.account.findMany).mockResolvedValue([] as any);
    vi.mocked(prisma.investmentHolding.findMany).mockResolvedValue([] as any);
    vi.mocked(fetchJournalReportRows).mockResolvedValue([
      ...rows,
      {
        ...rows[0],
        id: 'journal-emergency-fund',
        description: 'Emergency fund transfer',
        amount: 250,
        signedAmount: -250,
        category: {
          id: 'cat-emergency-fund',
          name: 'Emergency Fund',
          icon: 'banknote',
          type: 'transfer',
          isTaxDeductible: false,
        },
      },
    ]);

    const res = await request(makeApp()).get('/reports/overview?year=2026&month=1');

    expect(res.status).toBe(200);
    expect(res.body.cashFlow).toMatchObject({
      income: 300,
      expense: 125,
      transferTotal: 350,
    });
  });

  it('honors reports page excludeCategory and excludeAccount aliases', async () => {
    const res = await request(makeApp()).get(
      '/reports/spending?startDate=2026-01-01&endDate=2026-01-31&groupBy=category&excludeCategories=cat-food&excludeAccounts=acct-hidden',
    );

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      total: 0,
      transactionCount: 0,
      items: [],
    });
  });

  it('returns journal drilldown rows for a report segment', async () => {
    const res = await request(makeApp()).get('/reports/drill?startDate=2026-01-01&endDate=2026-01-31&groupBy=category&groupId=cat-food&mode=spending');

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.transactions[0]).toMatchObject({
      id: 'journal-food',
      description: 'Market',
      amount: -75,
      account: { id: 'acct-checking', name: 'Checking' },
    });
  });

  it('exports journal-backed report CSV', async () => {
    const res = await request(makeApp()).get('/reports/export/csv?type=spending&startDate=2026-01-01&endDate=2026-01-31');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text).toContain('Category,Amount,Percentage');
    expect(res.text).toContain('Food,75,100');
  });

  it('accepts from/to aliases for report CSV exports', async () => {
    const res = await request(makeApp()).get('/reports/export/csv?type=cashflow&from=2026-01-01&to=2026-01-31');

    expect(res.status).toBe(200);
    expect(res.text).toContain('Month,Income,Expenses,Net');
    expect(fetchJournalReportRows).toHaveBeenCalledWith({
      householdId: 'hh-1',
      start: new Date('2026-01-01'),
      end: new Date('2026-01-31'),
    });
  });

  it('exports tax report CSV by year', async () => {
    const res = await request(makeApp()).get('/reports/export/csv?type=tax&year=2026');

    expect(res.status).toBe(200);
    expect(res.text).toContain('Category,Transactions,Amount');
    expect(res.text).toContain('Charity,1,50');
    expect(fetchJournalReportRows).toHaveBeenCalledWith({
      householdId: 'hh-1',
      start: new Date(2026, 0, 1),
      end: new Date(2026, 11, 31, 23, 59, 59, 999),
    });
  });

  it('generates a standardized overview report from household-scoped journals', async () => {
    vi.mocked(prisma.transactionJournal.findMany).mockResolvedValue([
      {
        id: 'journal-standard-income',
        householdId: 'hh-1',
        transactionType: 'deposit',
        date: new Date('2026-01-05T00:00:00.000Z'),
        description: 'Payroll',
        amountDecimal: '1000.00',
        currencyCode: 'CAD',
        isPending: false,
        isHidden: false,
        isDeleted: false,
        isSplit: false,
        isReconciled: true,
        category: { id: 'cat-pay', name: 'Salary', groupId: null, excludeFromReports: false, group: null },
        merchant: { id: 'merchant-payroll', displayName: 'Payroll' },
        entries: [{ accountId: 'acct-checking', amountDecimal: '1000.00', account: { id: 'acct-checking', name: 'Checking', type: 'bank', excludeFromReports: false, excludeFromNetWorth: false, isHidden: false, isDeleted: false } }],
        tags: [],
        transactionTags: [],
        splits: [],
      },
      {
        id: 'journal-standard-expense',
        householdId: 'hh-1',
        transactionType: 'withdrawal',
        date: new Date('2026-01-06T00:00:00.000Z'),
        description: 'Market',
        amountDecimal: '75.25',
        currencyCode: 'CAD',
        isPending: false,
        isHidden: false,
        isDeleted: false,
        isSplit: false,
        isReconciled: false,
        category: { id: 'cat-food', name: 'Food', groupId: null, excludeFromReports: false, group: null },
        merchant: { id: 'merchant-market', displayName: 'Market' },
        entries: [{ accountId: 'acct-checking', amountDecimal: '-75.25', account: { id: 'acct-checking', name: 'Checking', type: 'bank', excludeFromReports: false, excludeFromNetWorth: false, isHidden: false, isDeleted: false } }],
        tags: [{ tag: { id: 'tag-home', name: 'Home', color: '#111111' } }],
        transactionTags: [],
        splits: [],
      },
    ] as any);

    const res = await request(makeApp()).get('/reports/standard/generate?reportType=overview&startDate=2026-01-01&endDate=2026-01-31&currencyCode=CAD');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      reportType: 'overview',
      title: 'Overview Report',
      currencyCode: 'CAD',
      dateRange: { startDate: '2026-01-01', endDate: '2026-01-31' },
      metadata: { dataFreshness: { usesLiveData: true } },
    });
    expect(res.body.summaryCards.find((card: any) => card.key === 'totalIncome').value).toBe('1000.00');
    expect(res.body.summaryCards.find((card: any) => card.key === 'totalExpenses').value).toBe('75.25');
    expect(prisma.transactionJournal.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        householdId: 'hh-1',
        date: { gte: new Date('2026-01-01T00:00:00.000Z'), lte: new Date('2026-01-31T23:59:59.999Z') },
      }),
    }));
  });

  it('returns standardized drill-down rows with pagination', async () => {
    vi.mocked(prisma.transactionJournal.findMany).mockResolvedValue([
      {
        id: 'journal-standard-expense',
        householdId: 'hh-1',
        transactionType: 'withdrawal',
        date: new Date('2026-01-06T00:00:00.000Z'),
        description: 'Market',
        amountDecimal: '75.25',
        currencyCode: 'CAD',
        isPending: false,
        isHidden: false,
        isDeleted: false,
        isSplit: false,
        isReconciled: false,
        category: { id: 'cat-food', name: 'Food', groupId: null, excludeFromReports: false, group: null },
        merchant: { id: 'merchant-market', displayName: 'Market' },
        entries: [{ accountId: 'acct-checking', amountDecimal: '-75.25', account: { id: 'acct-checking', name: 'Checking', type: 'bank', excludeFromReports: false, excludeFromNetWorth: false, isHidden: false, isDeleted: false } }],
        tags: [],
        transactionTags: [],
        splits: [],
      },
    ] as any);

    const res = await request(makeApp()).get('/reports/standard/drilldown?reportType=overview&startDate=2026-01-01&endDate=2026-01-31&categoryId=cat-food&pageSize=1');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      total: 1,
      page: 1,
      pageSize: 1,
      items: [expect.objectContaining({ id: 'journal-standard-expense', amountDecimal: '-75.25' })],
    });
  });

  it('supports saved report aliases used by the reports page', async () => {
    vi.mocked(prisma.savedReport.create).mockResolvedValue({
      id: 'saved-1',
      householdId: 'hh-1',
      name: 'Monthly Review',
      filters: { tab: 'overview', startDate: '2026-01-01', endDate: '2026-01-31' },
      createdAt: new Date('2026-01-31T00:00:00.000Z'),
      updatedAt: new Date('2026-01-31T00:00:00.000Z'),
    } as any);

    const res = await request(makeApp())
      .post('/reports/saved-views')
      .send({ name: 'Monthly Review', filters: { tab: 'overview', startDate: '2026-01-01', endDate: '2026-01-31' } });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ id: 'saved-1', name: 'Monthly Review' });
    expect(prisma.savedReport.create).toHaveBeenCalledWith({
      data: {
        householdId: 'hh-1',
        name: 'Monthly Review',
        filters: { tab: 'overview', startDate: '2026-01-01', endDate: '2026-01-31' },
      },
    });
  });

  it('updates saved reports within the authenticated household', async () => {
    vi.mocked(prisma.savedReport.findFirst).mockResolvedValue({ id: 'saved-1', householdId: 'hh-1' } as any);
    vi.mocked(prisma.savedReport.update).mockResolvedValue({
      id: 'saved-1',
      householdId: 'hh-1',
      name: 'Updated',
      filters: { tab: 'cashflow' },
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    } as any);

    const res = await request(makeApp()).put('/reports/saved/saved-1').send({ name: 'Updated', filters: { tab: 'cashflow' } });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 'saved-1', name: 'Updated' });
    expect(prisma.savedReport.findFirst).toHaveBeenCalledWith({ where: { id: 'saved-1', householdId: 'hh-1' } });
    expect(prisma.savedReport.update).toHaveBeenCalledWith({
      where: { id: 'saved-1' },
      data: { name: 'Updated', filters: { tab: 'cashflow' } },
    });
  });

  it('generates a standardized budget report from household-scoped budget limits', async () => {
    vi.mocked(prisma.transactionJournal.findMany).mockResolvedValue([] as any);
    vi.mocked(prisma.budgetLimit.findMany).mockResolvedValue([
      {
        id: 'limit-food',
        budgetId: 'budget-food',
        periodKey: '2026-01',
        limitAmount: '100.00',
        spentAmount: '80.00',
        rolloverAmount: '10.00',
        budget: { id: 'budget-food', name: 'Food Budget', categoryId: 'cat-food', category: { id: 'cat-food', name: 'Food' } },
      },
    ] as any);

    const res = await request(makeApp()).get('/reports/standard/generate?reportType=budget&startDate=2026-01-01&endDate=2026-01-31&currencyCode=CAD');

    expect(res.status).toBe(200);
    expect(res.body.reportType).toBe('budget');
    expect(res.body.tables[0].rows).toEqual([
      expect.objectContaining({ id: 'budget-food', budgeted: '100.00', actualSpent: '80.00' }),
    ]);
    expect(prisma.budgetLimit.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { householdId: 'hh-1', periodKey: { in: ['2026-01'] }, budget: { isDeleted: false } },
    }));
  });

  it('exports a standardized report table as CSV', async () => {
    vi.mocked(prisma.transactionJournal.findMany).mockResolvedValue([
      {
        id: 'journal-standard-expense',
        householdId: 'hh-1',
        transactionType: 'withdrawal',
        date: new Date('2026-01-06T00:00:00.000Z'),
        description: 'Market',
        amountDecimal: '75.25',
        currencyCode: 'CAD',
        isPending: false,
        isHidden: false,
        isDeleted: false,
        isSplit: false,
        isReconciled: false,
        category: { id: 'cat-food', name: 'Food', groupId: null, excludeFromReports: false, group: null },
        merchant: { id: 'merchant-market', displayName: 'Market' },
        entries: [{ accountId: 'acct-checking', amountDecimal: '-75.25', account: { id: 'acct-checking', name: 'Checking', type: 'bank', excludeFromReports: false, excludeFromNetWorth: false, isHidden: false, isDeleted: false } }],
        tags: [],
        transactionTags: [],
        splits: [],
      },
    ] as any);

    const res = await request(makeApp()).get('/reports/standard/export/csv?reportType=merchant&startDate=2026-01-01&endDate=2026-01-31&tableKey=merchantTotals&currencyCode=CAD');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text).toContain('Merchant,Spending,Transactions');
    expect(res.text).toContain('Market,75.25,1');
  });

  it('exports a standardized full report as JSON', async () => {
    vi.mocked(prisma.transactionJournal.findMany).mockResolvedValue([] as any);

    const res = await request(makeApp()).get('/reports/standard/export/json?reportType=category&startDate=2026-01-01&endDate=2026-01-31');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ reportType: 'category', title: 'Category Report' });
  });

  it('generates a standardized audit report with household-scoped audit context', async () => {
    vi.mocked(prisma.transactionJournal.findMany).mockResolvedValue([] as any);
    vi.mocked(prisma.duplicateDismissal.count).mockResolvedValue(2);
    vi.mocked(prisma.importHistory.count).mockResolvedValue(1);
    vi.mocked(prisma.ruleExecutionLog.count).mockResolvedValue(3);
    vi.mocked(prisma.account.count).mockResolvedValue(1);
    vi.mocked(prisma.category.count).mockResolvedValue(1);

    const res = await request(makeApp()).get('/reports/standard/generate?reportType=audit&startDate=2026-01-01&endDate=2026-01-31');

    expect(res.status).toBe(200);
    expect(res.body.reportType).toBe('audit');
    expect(res.body.tables[0].rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ issueType: 'rule_execution_failures', count: 3 }),
    ]));
    expect(prisma.ruleExecutionLog.count).toHaveBeenCalledWith({
      where: {
        householdId: 'hh-1',
        createdAt: { gte: new Date('2026-01-01T00:00:00.000Z'), lte: new Date('2026-01-31T23:59:59.999Z') },
        status: { not: 'applied' },
      },
    });
  });

  it('generates a standardized net worth report from existing wealth tables', async () => {
    vi.mocked(prisma.transactionJournal.findMany).mockResolvedValue([] as any);
    vi.mocked(prisma.netWorthSnapshot.findMany).mockResolvedValue([
      { date: new Date('2026-01-31T00:00:00.000Z'), assetsDecimal: '4000.00', assets: 0, liabilitiesDecimal: '500.00', liabilities: 0, netWorthDecimal: '3500.00', netWorth: 0 },
    ] as any);
    vi.mocked(prisma.account.findMany).mockResolvedValue([
      { id: 'acct-checking', name: 'Checking', type: 'bank', balanceDecimal: '1.00', balance: 1000 },
    ] as any);
    vi.mocked(prisma.manualAsset.findMany).mockResolvedValue([{ currentValueDecimal: '1.00', currentValue: 750 }] as any);
    vi.mocked(prisma.manualLiability.findMany).mockResolvedValue([{ currentBalanceDecimal: '1.00', currentBalance: 300 }] as any);
    vi.mocked(prisma.investmentHolding.findMany).mockResolvedValue([{ sharesDecimal: '1', shares: 10, currentPriceDecimal: '1.00', currentPrice: 250 }] as any);

    const res = await request(makeApp()).get('/reports/standard/generate?reportType=net_worth&startDate=2026-01-01&endDate=2026-01-31&currencyCode=CAD');

    expect(res.status).toBe(200);
    expect(res.body.reportType).toBe('net_worth');
    expect(res.body.summaryCards.find((card: any) => card.key === 'netWorth').value).toBe('3950.00');
  });

  it('generates a safe standardized investment report', async () => {
    vi.mocked(prisma.transactionJournal.findMany).mockResolvedValue([] as any);
    vi.mocked(prisma.investmentHolding.findMany).mockResolvedValue([
      {
        id: 'holding-1',
        accountId: 'acct-invest',
        symbol: 'ABC',
        name: 'ABC Fund',
        sharesDecimal: '1',
        shares: 10,
        currentPriceDecimal: '1.00',
        currentPrice: 120,
        costBasisDecimal: '1.00',
        costBasis: 1000,
        assetClass: 'equity',
        account: { id: 'acct-invest', name: 'Investing' },
        dividends: [{ amountDecimal: '25.00' }],
        recurringInvestments: [{ id: 'recurring-1' }],
      },
    ] as any);

    const res = await request(makeApp()).get('/reports/standard/generate?reportType=investment&startDate=2026-01-01&endDate=2026-01-31');

    expect(res.status).toBe(200);
    expect(res.body.reportType).toBe('investment');
    expect(res.body.summaryCards.find((card: any) => card.key === 'unrealizedGainLoss').value).toBe('200.00');
    expect(res.body.summaryCards.find((card: any) => card.key === 'realizedGainLoss').value).toBe('0.00');
    expect(res.body.metadata.warnings).toContain('Investment performance excludes TWR/MWR return calculations until portfolio cash-flow timing is audited.');
  });

  it('returns household-scoped standard report filter options', async () => {
    vi.mocked(prisma.account.findMany).mockResolvedValue([
      { id: 'acct-checking', name: 'Checking', type: 'bank', currency: 'CAD' },
    ] as any);
    vi.mocked(prisma.category.findMany).mockResolvedValue([
      { id: 'cat-food', name: 'Food', type: 'expense', groupId: 'group-needs', icon: 'cart' },
    ] as any);
    vi.mocked(prisma.categoryGroup.findMany).mockResolvedValue([
      { id: 'group-needs', name: 'Needs' },
    ] as any);
    vi.mocked(prisma.budget.findMany).mockResolvedValue([
      { id: 'budget-food', name: 'Food Budget', categoryId: 'cat-food', category: { name: 'Food' } },
    ] as any);
    vi.mocked(prisma.tag.findMany).mockResolvedValue([
      { id: 'tag-home', name: 'Home', color: '#111111' },
    ] as any);
    vi.mocked(prisma.merchant.findMany).mockResolvedValue([
      { id: 'merchant-market', displayName: 'Market' },
    ] as any);

    const res = await request(makeApp()).get('/reports/standard/options');

    expect(res.status).toBe(200);
    expect(res.body.accounts).toEqual([{ id: 'acct-checking', name: 'Checking', type: 'bank', currency: 'CAD' }]);
    expect(res.body.categories).toEqual([{ id: 'cat-food', name: 'Food', type: 'expense', groupId: 'group-needs', icon: 'cart' }]);
    expect(res.body.categoryGroups).toEqual([{ id: 'group-needs', name: 'Needs' }]);
    expect(res.body.budgets).toEqual([{ id: 'budget-food', name: 'Food Budget', categoryId: 'cat-food', categoryName: 'Food' }]);
    expect(res.body.tags).toEqual([{ id: 'tag-home', name: 'Home', color: '#111111' }]);
    expect(res.body.merchants).toEqual([{ id: 'merchant-market', name: 'Market' }]);
    expect(prisma.account.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { householdId: 'hh-1', isDeleted: false },
    }));
    expect(prisma.category.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { householdId: 'hh-1', isDeleted: false },
    }));
    expect(prisma.budget.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { householdId: 'hh-1', isDeleted: false },
    }));
  });

  it('includes audited realized gain/loss from sell lots in the standardized investment report', async () => {
    vi.mocked(prisma.transactionJournal.findMany).mockResolvedValue([] as any);
    vi.mocked(prisma.investmentHolding.findMany).mockResolvedValue([
      {
        id: 'holding-1',
        accountId: 'acct-invest',
        symbol: 'ABC',
        name: 'ABC Fund',
        sharesDecimal: '10',
        shares: 0,
        currentPriceDecimal: '120.00',
        currentPrice: 0,
        costBasisDecimal: '1000.00',
        costBasis: 0,
        assetClass: 'equity',
        account: { id: 'acct-invest', name: 'Investing' },
        lots: [{ transactionType: 'sell', realizedGainDecimal: '45.25', status: 'confirmed' }],
        dividends: [{ amountDecimal: '25.00' }],
        recurringInvestments: [],
      },
    ] as any);

    const res = await request(makeApp()).get('/reports/standard/generate?reportType=investment&startDate=2026-01-01&endDate=2026-01-31');

    expect(res.status).toBe(200);
    expect(res.body.summaryCards.find((card: any) => card.key === 'realizedGainLoss').value).toBe('45.25');
    expect(res.body.metadata.warnings.join(' ')).not.toContain('realized performance is audited');
    expect(prisma.investmentHolding.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ isDeleted: false }),
      include: expect.objectContaining({
        lots: expect.objectContaining({
          where: {
            date: { gte: new Date('2026-01-01T00:00:00.000Z'), lte: new Date('2026-01-31T23:59:59.999Z') },
            transactionType: 'sell',
            status: 'confirmed',
            isDeleted: false,
          },
        }),
      }),
    }));
  });

  it('excludes soft-deleted budgets from budget variance', async () => {
    vi.mocked(prisma.budget.findMany).mockResolvedValue([
      {
        id: 'budget-food',
        categoryId: 'cat-food',
        amount: 100,
        category: { id: 'cat-food', name: 'Food', icon: 'cart' },
      },
    ] as any);

    const res = await request(makeApp()).get('/reports/budget-variance?from=2026-01-01&to=2026-01-31');

    expect(res.status).toBe(200);
    expect(prisma.budget.findMany).toHaveBeenCalledWith({
      where: { householdId: 'hh-1', isDeleted: false },
      include: { category: { select: { id: true, name: true, icon: true } } },
    });
    expect(res.body.categories[0]).toMatchObject({
      categoryId: 'cat-food',
      budgeted: 100,
      actual: 75,
      variance: 25,
    });
  });
});


