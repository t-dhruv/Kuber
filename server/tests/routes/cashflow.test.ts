import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import cashflowRouter from '../../src/routes/cashflow';
import { prisma } from '../../src/lib/prisma';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    account: { aggregate: vi.fn() },
    transactionJournal: { findMany: vi.fn() },
    recurringItem: { findMany: vi.fn() },
  },
}));

function makeApp(householdId = 'hh-1') {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res: any, next: any) => {
    req.householdId = householdId;
    req.log = { error: vi.fn(), info: vi.fn(), child: () => req.log };
    next();
  });
  app.use('/cashflow', cashflowRouter);
  return app;
}

describe('cashflow routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-07T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('filters reporting-excluded categories from the cash flow screen', async () => {
    vi.mocked(prisma.transactionJournal.findMany).mockResolvedValue([]);

    const res = await request(makeApp()).get('/cashflow?year=2026');

    expect(res.status).toBe(200);
    expect(prisma.transactionJournal.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        AND: [
          {
            transactionType: { not: 'transfer' },
          },
          {
            OR: [
              { categoryId: null },
              { category: { is: { excludeFromReports: false } } },
            ],
          },
          {
            OR: [
              { categoryId: null },
              { category: { is: { type: { not: 'transfer' } } } },
            ],
          },
        ],
      }),
    }));
  });

  it('classifies positive withdrawal journal amounts as yearly expenses', async () => {
    vi.mocked(prisma.transactionJournal.findMany).mockResolvedValue([
      { date: new Date('2026-01-05T00:00:00.000Z'), amountDecimal: 250, transactionType: 'withdrawal' },
      { date: new Date('2026-01-10T00:00:00.000Z'), amountDecimal: 1000, transactionType: 'deposit' },
    ] as any);

    const res = await request(makeApp()).get('/cashflow?year=2026');

    expect(res.status).toBe(200);
    expect(res.body.months[0]).toMatchObject({
      income: 1000,
      expenses: 250,
      net: 750,
    });
    expect(res.body.ytdIncome).toBe(1000);
    expect(res.body.ytdExpenses).toBe(250);
  });

  it('classifies positive withdrawal journal amounts as monthly expenses', async () => {
    vi.mocked(prisma.transactionJournal.findMany).mockResolvedValue([
      {
        date: new Date(2026, 4, 5),
        amountDecimal: 80,
        transactionType: 'withdrawal',
        description: 'Groceries',
        categoryId: 'cat-food',
        category: {
          id: 'cat-food',
          name: 'Food',
          icon: 'cart',
          type: 'expense',
          groupId: 'group-needs',
          group: { id: 'group-needs', name: 'Needs' },
        },
        merchantId: null,
        merchant: null,
      },
      {
        date: new Date(2026, 4, 10),
        amountDecimal: 1200,
        transactionType: 'deposit',
        description: 'Payroll',
        categoryId: 'cat-pay',
        category: {
          id: 'cat-pay',
          name: 'Salary',
          icon: null,
          type: 'income',
          groupId: null,
          group: null,
        },
        merchantId: null,
        merchant: null,
      },
    ] as any);

    const res = await request(makeApp()).get('/cashflow/month?year=2026&month=5');

    expect(res.status).toBe(200);
    expect(res.body.income.total).toBe(1200);
    expect(res.body.expenses.total).toBe(80);
    expect(res.body.net).toBe(1120);
    expect(res.body.dailyFlow[4]).toMatchObject({ day: 5, income: 0, expenses: 80 });
  });

  it('classifies positive withdrawal journal amounts as sankey spending', async () => {
    vi.mocked(prisma.transactionJournal.findMany).mockResolvedValue([
      {
        amountDecimal: 90,
        transactionType: 'withdrawal',
        categoryId: 'cat-food',
        category: { id: 'cat-food', name: 'Food', icon: 'cart', type: 'expense', bucketType: 'needs' },
      },
      {
        amountDecimal: 500,
        transactionType: 'deposit',
        categoryId: 'cat-pay',
        category: { id: 'cat-pay', name: 'Salary', icon: null, type: 'income', bucketType: 'uncategorized' },
      },
    ] as any);

    const res = await request(makeApp()).get('/cashflow/sankey?startDate=2026-05-01&endDate=2026-05-31');

    expect(res.status).toBe(200);
    expect(res.body.totalIncome).toBe(500);
    expect(res.body.totalSpending).toBe(90);
    expect(res.body.net).toBe(410);
    expect(res.body.buckets[0]).toMatchObject({
      name: 'Needs',
      amount: 90,
      categories: [expect.objectContaining({ id: 'cat-food', amount: 90 })],
    });
  });

  it('does not double-count known recurring items in forecast daily averages', async () => {
    vi.mocked(prisma.account.aggregate).mockResolvedValue({ _sum: { balance: 1000 } } as any);
    vi.mocked(prisma.transactionJournal.findMany).mockResolvedValue([
      { amountDecimal: -30 },
    ] as any);
    vi.mocked(prisma.recurringItem.findMany).mockResolvedValue([
      {
        amount: -90,
        frequency: 'monthly',
        nextDate: new Date('2026-05-08T00:00:00.000Z'),
      },
    ] as any);

    const res = await request(makeApp()).get('/cashflow/forecast?days=30');

    expect(res.status).toBe(200);
    expect(prisma.transactionJournal.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({}),
    }));
    expect(res.body.projections[0]).toMatchObject({
      date: '2026-05-08',
      projected: 909.67,
      dailyNet: -90.33,
    });
    expect(res.body.summary.avgMonthlyExpense).toBe(10);
  });

  it('classifies positive withdrawal journal amounts as forecast expense history', async () => {
    vi.mocked(prisma.account.aggregate).mockResolvedValue({ _sum: { balance: 1000 } } as any);
    vi.mocked(prisma.transactionJournal.findMany).mockResolvedValue([
      { amountDecimal: 300, transactionType: 'withdrawal' },
      { amountDecimal: 900, transactionType: 'deposit' },
    ] as any);
    vi.mocked(prisma.recurringItem.findMany).mockResolvedValue([]);

    const res = await request(makeApp()).get('/cashflow/forecast?days=30');

    expect(res.status).toBe(200);
    expect(res.body.summary.avgMonthlyIncome).toBe(300);
    expect(res.body.summary.avgMonthlyExpense).toBe(100);
  });
});


