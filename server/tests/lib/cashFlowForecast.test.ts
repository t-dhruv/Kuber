import { describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { computeCashFlowForecast } from '../../src/lib/cashFlowForecast';

/**
 * A fixed clock. Chosen in June so that neither the 90-day history window nor the
 * 90-day forecast window crosses a daylight-saving boundary in America/Toronto, and
 * anchored at midday UTC so the ISO date keys are stable under any test TZ.
 */
const NOW = new Date('2026-06-15T12:00:00.000Z');

type ForecastPrisma = Pick<PrismaClient, 'account' | 'transactionJournal' | 'recurringItem'>;

interface FakeCalls {
  account: unknown[];
  transactionJournal: unknown[];
  recurringItem: unknown[];
}

function fakePrisma(options: {
  balance: number | null;
  journals: Array<{ amountDecimal: unknown; transactionType?: string | null; category?: { type?: string | null } | null }>;
  recurringItems: Array<{ nextDate: Date; frequency: string; amount: number }>;
}): { prisma: ForecastPrisma; calls: FakeCalls } {
  const calls: FakeCalls = { account: [], transactionJournal: [], recurringItem: [] };
  const prisma = {
    account: {
      aggregate: async (args: unknown) => {
        calls.account.push(args);

        return { _sum: { balance: options.balance } };
      },
    },
    transactionJournal: {
      findMany: async (args: unknown) => {
        calls.transactionJournal.push(args);

        return options.journals;
      },
    },
    recurringItem: {
      findMany: async (args: unknown) => {
        calls.recurringItem.push(args);

        return options.recurringItems;
      },
    },
  } as unknown as ForecastPrisma;

  return { prisma, calls };
}

/**
 * The worked example every assertion below is derived from.
 *
 * Balance                1000.00
 * History (90-day window, isRecurring: false)
 *   deposit    1800.00 -> income   -> totalIncome   1800 / 90 =  20.00 per day
 *   withdrawal  900.00 -> expense  -> totalExpenses  900 / 90 =  10.00 per day
 *   base daily net = 20 - 10 = 10.00
 *   avgMonthlyIncome  = 20 * 30 = 600.00
 *   avgMonthlyExpense = 10 * 30 = 300.00
 * Recurring: one monthly item of -100.00 whose nextDate is 2026-04-20, i.e. in the
 *   past. The walk-forward advances 2026-04-20 -> 2026-05-20 -> 2026-06-20, the first
 *   occurrence at or after `now`. Only 2026-06-20 falls inside the 30-day window
 *   (the next, 2026-07-20, is past the 2026-07-15 forecast end), so
 *   knownRecurringTotal = -100.00.
 * Projection over 30 days, starting tomorrow (2026-06-16):
 *   days 1-4   +10.00/day  -> 1010, 1020, 1030, 1040
 *   day 5      +10 - 100   ->  950   (2026-06-20, the recurring item)
 *   days 6-30  +10.00/day  ->  950 + 25 * 10 = 1200.00
 */
const baseOptions = {
  balance: 1000,
  journals: [
    { amountDecimal: 1800, transactionType: 'deposit', category: { type: 'income' } },
    { amountDecimal: -900, transactionType: 'withdrawal', category: { type: 'expense' } },
  ],
  recurringItems: [
    { nextDate: new Date('2026-04-20T12:00:00.000Z'), frequency: 'monthly', amount: -100 },
  ],
};

describe('computeCashFlowForecast', () => {
  it('projects the hand-computed worked example exactly', async () => {
    const { prisma } = fakePrisma(baseOptions);
    const result = await computeCashFlowForecast({ householdId: 'household-1', days: 30, now: NOW }, prisma);

    expect(result.currentBalance).toBe(1000);
    expect(result.projections).toHaveLength(30);
    // The projection starts tomorrow, not today.
    expect(result.projections[0]).toEqual({ date: '2026-06-16', projected: 1010, dailyNet: 10 });
    expect(result.projections[3]).toEqual({ date: '2026-06-19', projected: 1040, dailyNet: 10 });
    // The stale monthly RecurringItem lands here, walked forward two months.
    expect(result.projections[4]).toEqual({ date: '2026-06-20', projected: 950, dailyNet: -90 });
    expect(result.projections[5]).toEqual({ date: '2026-06-21', projected: 960, dailyNet: 10 });
    expect(result.projections[29]).toEqual({ date: '2026-07-15', projected: 1200, dailyNet: 10 });

    // Every other day carries only the historical average.
    for (const [index, point] of result.projections.entries()) {
      if (index !== 4) expect(point.dailyNet).toBe(10);
    }

    expect(result.summary).toEqual({
      days: 30,
      projectedEndBalance: 1200,
      avgMonthlyIncome: 600,
      avgMonthlyExpense: 300,
      knownRecurringTotal: -100,
    });
    expect(result.summary.projectedEndBalance).toBe(result.projections[29].projected);
  });

  it('emits the stale RecurringItem at its walked-forward date, never at nextDate', async () => {
    const { prisma } = fakePrisma(baseOptions);
    const result = await computeCashFlowForecast({ householdId: 'household-1', days: 90, now: NOW }, prisma);

    const withRecurring = result.projections.filter((point) => point.dailyNet !== 10);
    expect(withRecurring.map((point) => point.date)).toEqual(['2026-06-20', '2026-07-20', '2026-08-20']);
    expect(result.projections.some((point) => point.date === '2026-04-20')).toBe(false);
    expect(result.summary.knownRecurringTotal).toBe(-300);
    expect(result.projections).toHaveLength(90);
    expect(result.projections[0].date).toBe('2026-06-16');
    expect(result.summary.projectedEndBalance).toBe(result.projections[89].projected);
  });

  it('averages over the 90-day window, not over the days that returned rows', async () => {
    // A single 900.00 expense still divides by 90, giving 10.00 per day.
    const { prisma } = fakePrisma({ balance: 0, journals: [{ amountDecimal: -900, transactionType: 'withdrawal' }], recurringItems: [] });
    const result = await computeCashFlowForecast({ householdId: 'household-1', days: 30, now: NOW }, prisma);

    expect(result.summary.avgMonthlyExpense).toBe(300);
    expect(result.projections[0].dailyNet).toBe(-10);
  });

  it('returns a flat projection when there is no history at all', async () => {
    const { prisma } = fakePrisma({ balance: 250, journals: [], recurringItems: [] });
    const result = await computeCashFlowForecast({ householdId: 'household-1', days: 60, now: NOW }, prisma);

    expect(result.currentBalance).toBe(250);
    expect(result.projections).toHaveLength(60);
    expect(result.summary).toEqual({
      days: 60,
      projectedEndBalance: 250,
      avgMonthlyIncome: 0,
      avgMonthlyExpense: 0,
      knownRecurringTotal: 0,
    });
  });

  it('treats a null account balance sum as zero', async () => {
    const { prisma } = fakePrisma({ balance: null, journals: [], recurringItems: [] });
    const result = await computeCashFlowForecast({ householdId: 'household-1', days: 30, now: NOW }, prisma);

    expect(result.currentBalance).toBe(0);
  });

  it('scopes all three queries to the household and excludes recurring journals from the average', async () => {
    const { prisma, calls } = fakePrisma(baseOptions);
    await computeCashFlowForecast({ householdId: 'household-7', days: 30, now: NOW }, prisma);

    expect(calls.account).toHaveLength(1);
    expect(calls.transactionJournal).toHaveLength(1);
    expect(calls.recurringItem).toHaveLength(1);
    for (const call of [...calls.account, ...calls.transactionJournal, ...calls.recurringItem]) {
      expect((call as { where: { householdId: string } }).where.householdId).toBe('household-7');
    }

    const journalWhere = (calls.transactionJournal[0] as { where: Record<string, unknown> }).where;
    // Recurring Journals are added back from RecurringItem; counting them here would double them.
    expect(journalWhere.isRecurring).toBe(false);
    expect(journalWhere.isHidden).toBe(false);
    expect(journalWhere.isDeleted).toBe(false);
    // The history window is exactly 90 days back from `now`.
    expect((journalWhere.date as { gte: Date; lte: Date }).gte.toISOString()).toBe('2026-03-17T12:00:00.000Z');
    expect((journalWhere.date as { gte: Date; lte: Date }).lte).toEqual(NOW);
  });
});
