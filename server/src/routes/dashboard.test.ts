import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import dashboardRouter from './dashboard';
import { prisma } from '../lib/prisma';
import { makeRouteTestApp } from '../test/integrationHarness';
import { queryJournalAmounts } from '../lib/transactionJournalService';

vi.mock('../lib/prisma', () => ({
  prisma: {
    account: { findMany: vi.fn() },
    budget: { findMany: vi.fn() },
    transactionJournal: { findMany: vi.fn() },
    recurringItem: { findMany: vi.fn() },
    goal: { findMany: vi.fn() },
    netWorthSnapshot: { findMany: vi.fn() },
    category: { findFirst: vi.fn() },
  },
}));

vi.mock('../lib/transactionJournalService', () => ({
  queryJournalAmounts: vi.fn(),
}));

function makeApp() {
  return makeRouteTestApp(dashboardRouter, { householdId: 'household-1', userId: 'user-1' });
}

describe('dashboard route integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-15T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns summary metrics from active accounts and scoped journal amounts', async () => {
    vi.mocked(prisma.account.findMany).mockResolvedValue([{ balance: 1000 }, { balance: -250 }] as any);
    vi.mocked(queryJournalAmounts)
      .mockResolvedValueOnce([{ amountDecimal: 3000 }, { amountDecimal: -900 }] as any)
      .mockResolvedValueOnce([{ amountDecimal: 2500 }, { amountDecimal: -800 }] as any);

    const res = await request(makeApp()).get('/summary');

    expect(res.status).toBe(200);
    expect(prisma.account.findMany).toHaveBeenCalledWith({
      where: {
        householdId: 'household-1',
        isHidden: false,
        excludeFromNetWorth: false,
        isDeleted: false,
      },
      select: { balance: true },
    });
    expect(queryJournalAmounts).toHaveBeenCalledWith(expect.objectContaining({
      householdId: 'household-1',
      dateFrom: new Date(2026, 4, 1),
      dateTo: new Date(2026, 5, 1),
    }));
    expect(res.body).toMatchObject({
      netWorth: { current: 750 },
      spending: { thisMonth: 900, lastMonth: 800 },
      income: { thisMonth: 3000, lastMonth: 2500 },
      savings: { amount: 2100, rate: 70 },
    });
  });

  it('groups spending chart expenses by day for this and previous month', async () => {
    vi.mocked(queryJournalAmounts)
      .mockResolvedValueOnce([
        { date: new Date('2026-05-03T12:00:00.000Z'), amountDecimal: -10 },
        { date: new Date('2026-05-03T18:00:00.000Z'), amountDecimal: -15.5 },
      ] as any)
      .mockResolvedValueOnce([
        { date: new Date('2026-04-02T12:00:00.000Z'), amountDecimal: -20 },
      ] as any);

    const res = await request(makeApp()).get('/spending-chart');

    expect(res.status).toBe(200);
    expect(queryJournalAmounts).toHaveBeenNthCalledWith(1, expect.objectContaining({
      householdId: 'household-1',
      amountLt: 0,
    }));
    expect(res.body).toEqual({
      thisMonth: [{ day: 3, amount: 25.5 }],
      lastMonth: [{ day: 2, amount: 20 }],
    });
  });

  it('returns active budget progress by category', async () => {
    vi.mocked(prisma.budget.findMany).mockResolvedValue([
      {
        categoryId: 'cat-food',
        amount: 400,
        name: null,
        category: { id: 'cat-food', name: 'Food', icon: 'utensils' },
      },
    ] as any);
    vi.mocked(queryJournalAmounts).mockResolvedValue([
      { categoryId: 'cat-food', amountDecimal: -125 },
    ] as any);

    const res = await request(makeApp()).get('/budget-summary');

    expect(res.status).toBe(200);
    expect(prisma.budget.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { householdId: 'household-1', isDeleted: false },
    }));
    expect(res.body).toMatchObject({
      totalBudget: 400,
      totalSpent: 125,
      categories: [{ id: 'cat-food', name: 'Food', budget: 400, spent: 125, remaining: 275 }],
    });
  });

  it('returns recent visible non-deleted transactions', async () => {
    vi.mocked(prisma.transactionJournal.findMany).mockResolvedValue([
      {
        id: 'journal-1',
        date: new Date('2026-05-14T12:00:00.000Z'),
        description: 'Coffee',
        amountDecimal: -4.25,
        category: { name: 'Dining', icon: 'utensils' },
        entries: [{ account: { name: 'Checking' } }],
      },
    ] as any);

    const res = await request(makeApp()).get('/recent-transactions');

    expect(res.status).toBe(200);
    expect(prisma.transactionJournal.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { householdId: 'household-1', isHidden: false, isDeleted: false },
      take: 5,
    }));
    expect(res.body[0]).toMatchObject({
      id: 'journal-1',
      merchantName: 'Coffee',
      amount: -4.25,
      accountName: 'Checking',
    });
  });

  it('splits recurring items into paid and upcoming buckets', async () => {
    vi.mocked(prisma.recurringItem.findMany).mockResolvedValue([
      { id: 'paid-1', name: 'Rent', amount: -1200, nextDate: new Date('2026-05-05T12:00:00.000Z') },
      { id: 'upcoming-1', name: 'Internet', amount: -80, nextDate: new Date('2026-05-20T12:00:00.000Z') },
    ] as any);

    const res = await request(makeApp()).get('/recurring-summary');

    expect(res.status).toBe(200);
    expect(prisma.recurringItem.findMany).toHaveBeenCalledWith({
      where: { householdId: 'household-1', isActive: true, isDeleted: false },
      select: { id: true, name: true, amount: true, nextDate: true },
    });
    expect(res.body).toMatchObject({
      paid: [{ id: 'paid-1', amount: 1200 }],
      upcoming: [{ id: 'upcoming-1', amount: 80, daysUntil: 5 }],
      totalPaid: 1200,
      totalUpcoming: 80,
      totalMonthly: 1280,
    });
  });

  it('returns a 12 point net worth chart', async () => {
    vi.mocked(prisma.account.findMany).mockResolvedValue([{ balance: 1000 }] as any);
    vi.mocked(queryJournalAmounts).mockResolvedValue([
      { amountDecimal: 900 },
      { amountDecimal: -300 },
    ] as any);

    const res = await request(makeApp()).get('/net-worth-chart');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(12);
    expect(res.body.at(-1)).toEqual({ date: '2026-05-01', value: 1000 });
  });

  it('returns active goals summary with status', async () => {
    vi.mocked(prisma.goal.findMany).mockResolvedValue([
      {
        id: 'goal-1',
        name: 'Emergency Fund',
        targetAmount: 1000,
        currentAmount: 1000,
        targetDate: null,
        monthlyContribution: 0,
      },
    ] as any);

    const res = await request(makeApp()).get('/goals-summary');

    expect(res.status).toBe(200);
    expect(prisma.goal.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { householdId: 'household-1', isDeleted: false },
    }));
    expect(res.body).toEqual([
      expect.objectContaining({
        id: 'goal-1',
        percent: 100,
        status: 'completed',
      }),
    ]);
  });

  it('returns weekly recap with top category and upcoming items', async () => {
    vi.mocked(queryJournalAmounts)
      .mockResolvedValueOnce([{ categoryId: 'cat-food', amountDecimal: -50 }] as any)
      .mockResolvedValueOnce([{ categoryId: 'cat-food', amountDecimal: -25 }] as any);
    vi.mocked(prisma.netWorthSnapshot.findMany).mockResolvedValue([
      { netWorth: 1200 },
      { netWorth: 1000 },
    ] as any);
    vi.mocked(prisma.account.findMany).mockResolvedValue([{ balance: 1200 }] as any);
    vi.mocked(prisma.category.findFirst).mockResolvedValue({ name: 'Food', icon: 'utensils' } as any);
    vi.mocked(prisma.recurringItem.findMany).mockResolvedValue([
      { name: 'Internet', amount: -80, nextDate: new Date('2026-05-18T12:00:00.000Z') },
    ] as any);

    const res = await request(makeApp()).get('/weekly-recap');

    expect(res.status).toBe(200);
    expect(prisma.category.findFirst).toHaveBeenCalledWith({
      where: { id: 'cat-food', householdId: 'household-1', isDeleted: false },
      select: { name: true, icon: true },
    });
    expect(res.body).toMatchObject({
      spending: { total: 50, change: 25, changePercent: 100 },
      netWorth: { current: 1200, change: 200, changePercent: 20 },
      topCategory: { name: 'Food', amount: 50, icon: 'utensils' },
      upcoming: [{ name: 'Internet', amount: 80, daysUntilDue: 3 }],
    });
  });

  it('returns financial health score components', async () => {
    vi.mocked(queryJournalAmounts)
      .mockResolvedValueOnce([{ amountDecimal: 3000 }, { amountDecimal: -1500 }] as any)
      .mockResolvedValueOnce([{ categoryId: 'cat-food', amountDecimal: -200 }] as any);
    vi.mocked(prisma.budget.findMany).mockResolvedValue([
      { categoryId: 'cat-food', amount: 400 },
    ] as any);
    vi.mocked(prisma.goal.findMany).mockResolvedValue([
      { targetAmount: 1000, currentAmount: 500 },
    ] as any);
    vi.mocked(prisma.account.findMany).mockResolvedValue([{ balance: 5000 }] as any);

    const res = await request(makeApp()).get('/health-score');

    expect(res.status).toBe(200);
    expect(prisma.budget.findMany).toHaveBeenCalledWith({
      where: { householdId: 'household-1', isDeleted: false },
      select: { categoryId: true, amount: true },
    });
    expect(prisma.goal.findMany).toHaveBeenCalledWith({
      where: { householdId: 'household-1', isDeleted: false },
      select: { targetAmount: true, currentAmount: true },
    });
    expect(res.body).toMatchObject({
      score: 73,
      breakdown: {
        savingsScore: 15,
        budgetScore: 25,
        goalScore: 13,
        emergencyScore: 20,
      },
    });
  });
});
