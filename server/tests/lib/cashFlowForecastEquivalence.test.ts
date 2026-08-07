import { describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { computeCashFlowForecast } from '../../src/lib/cashFlowForecast';

/**
 * Plan 011 step 5: prove the extraction changed nothing.
 *
 * `legacyForecast` below is the body of the GET /api/v1/cashflow/forecast handler
 * exactly as it stood at commit 237b09e (server/src/routeModules/cashflow.ts:575-707),
 * copied here with only two edits: `prisma` and `now` are parameters instead of module
 * imports and `new Date()`. Both implementations are driven by the same fake Prisma and
 * the same fixed clock, and their JSON bodies are compared.
 *
 * This file is a frozen historical record. Do not "fix" it to match a future change in
 * cashFlowForecast.ts — if the two ever diverge, that is the extraction being broken.
 */

type LegacyJournal = {
  amountDecimal: unknown;
  transactionType?: string | null;
  category?: { type?: string | null } | null;
};

type LegacyDirection = 'income' | 'expense' | 'transfer' | 'ignored';

function legacyReportableCategoryFilter() {
  return {
    AND: [
      { transactionType: { not: 'transfer' } },
      { OR: [{ categoryId: null }, { category: { is: { excludeFromReports: false } } }] },
      { OR: [{ categoryId: null }, { category: { is: { type: { not: 'transfer' } } } }] },
    ],
  };
}

function legacyClassify(journal: LegacyJournal): LegacyDirection {
  const transactionType = journal.transactionType?.toLowerCase();
  const categoryType = journal.category?.type?.toLowerCase();

  if (transactionType === 'transfer' || categoryType === 'transfer') return 'transfer';
  if (categoryType === 'investment') return 'ignored';
  if (transactionType === 'deposit') return 'income';
  if (transactionType === 'withdrawal') return 'expense';
  if (categoryType === 'income') return 'income';
  if (categoryType === 'expense') return 'expense';

  return Number(journal.amountDecimal) >= 0 ? 'income' : 'expense';
}

function legacyAmount(journal: LegacyJournal): number {
  return Math.abs(Number(journal.amountDecimal));
}

function legacyAdvanceByFrequency(date: Date, frequency: string): Date {
  const next = new Date(date);
  switch (frequency.toLowerCase()) {
    case 'weekly':
      next.setDate(next.getDate() + 7);
      break;
    case 'biweekly':
      next.setDate(next.getDate() + 14);
      break;
    case 'monthly':
      next.setMonth(next.getMonth() + 1);
      break;
    case 'quarterly':
      next.setDate(next.getDate() + 90);
      break;
    case 'annually':
    case 'yearly':
      next.setFullYear(next.getFullYear() + 1);
      break;
    default:
      next.setMonth(next.getMonth() + 1);
  }
  return next;
}

async function legacyForecast(householdId: string, days: number, now: Date, prisma: ForecastPrisma) {
  const balanceAgg = await prisma.account.aggregate({
    _sum: { balance: true },
    where: { householdId, isHidden: false },
  });
  const currentBalance = balanceAgg._sum.balance ?? 0;

  const historyStart = new Date(now);
  historyStart.setDate(historyStart.getDate() - 90);

  const historicalJournals = await prisma.transactionJournal.findMany({
    where: {
      householdId,
      date: { gte: historyStart, lte: now },
      isHidden: false,
      isRecurring: false,
      isDeleted: false,
      ...legacyReportableCategoryFilter(),
    },
    select: { amountDecimal: true, transactionType: true, category: { select: { type: true } } },
  }) as LegacyJournal[];

  let totalIncome = 0;
  let totalExpenses = 0;
  for (const j of historicalJournals) {
    const direction = legacyClassify(j);
    const amount = legacyAmount(j);
    if (direction === 'income') totalIncome += amount;
    if (direction === 'expense') totalExpenses += amount;
  }

  const avgDailyIncome = historicalJournals.length > 0 ? totalIncome / 90 : 0;
  const avgDailyExpense = historicalJournals.length > 0 ? totalExpenses / 90 : 0;

  const recurringItems = await prisma.recurringItem.findMany({ where: { householdId, isActive: true } });

  const recurringMap = new Map<string, number>();
  const forecastEnd = new Date(now);
  forecastEnd.setDate(forecastEnd.getDate() + days);

  for (const item of recurringItems) {
    let cursor = new Date(item.nextDate);
    while (cursor < now) {
      cursor = legacyAdvanceByFrequency(cursor, item.frequency);
    }
    while (cursor <= forecastEnd) {
      const dateKey = cursor.toISOString().slice(0, 10);
      recurringMap.set(dateKey, (recurringMap.get(dateKey) ?? 0) + item.amount);
      cursor = legacyAdvanceByFrequency(cursor, item.frequency);
    }
  }

  const projections: Array<{ date: string; projected: number; dailyNet: number }> = [];
  let balance = currentBalance;
  let knownRecurringTotal = 0;

  for (let d = 1; d <= days; d++) {
    const date = new Date(now);
    date.setDate(date.getDate() + d);
    const dateKey = date.toISOString().slice(0, 10);

    const recurringAdj = recurringMap.get(dateKey) ?? 0;
    const dailyNet = avgDailyIncome - avgDailyExpense + recurringAdj;
    balance += dailyNet;
    knownRecurringTotal += recurringAdj;

    projections.push({
      date: dateKey,
      projected: Math.round(balance * 100) / 100,
      dailyNet: Math.round(dailyNet * 100) / 100,
    });
  }

  const projectedEndBalance = projections.length > 0
    ? projections[projections.length - 1].projected
    : currentBalance;

  return {
    currentBalance: Math.round(currentBalance * 100) / 100,
    projections,
    summary: {
      days,
      projectedEndBalance: Math.round(projectedEndBalance * 100) / 100,
      avgMonthlyIncome: Math.round(avgDailyIncome * 30 * 100) / 100,
      avgMonthlyExpense: Math.round(avgDailyExpense * 30 * 100) / 100,
      knownRecurringTotal: Math.round(knownRecurringTotal * 100) / 100,
    },
  };
}

type ForecastPrisma = Pick<PrismaClient, 'account' | 'transactionJournal' | 'recurringItem'>;

function fakePrisma(options: {
  balance: number | null;
  journals: LegacyJournal[];
  recurringItems: Array<{ nextDate: Date; frequency: string; amount: number }>;
}): ForecastPrisma {
  return {
    account: { aggregate: async () => ({ _sum: { balance: options.balance } }) },
    transactionJournal: { findMany: async () => options.journals },
    recurringItem: { findMany: async () => options.recurringItems },
  } as unknown as ForecastPrisma;
}

const NOW = new Date('2026-06-15T12:00:00.000Z');

const FIXTURES: Array<{
  name: string;
  balance: number | null;
  journals: LegacyJournal[];
  recurringItems: Array<{ nextDate: Date; frequency: string; amount: number }>;
}> = [
  {
    name: 'mixed history with a stale monthly recurring item',
    balance: 4231.77,
    journals: [
      { amountDecimal: 1800, transactionType: 'deposit', category: { type: 'income' } },
      { amountDecimal: -912.31, transactionType: 'withdrawal', category: { type: 'expense' } },
      { amountDecimal: -33.07, transactionType: 'withdrawal', category: null },
      { amountDecimal: 500, transactionType: null, category: { type: 'income' } },
      { amountDecimal: -250, transactionType: null, category: { type: 'investment' } },
      { amountDecimal: -75, transactionType: 'transfer', category: { type: 'transfer' } },
      { amountDecimal: 12.5, transactionType: null, category: null },
      { amountDecimal: -12.5, transactionType: null, category: null },
    ],
    recurringItems: [
      { nextDate: new Date('2026-04-20T12:00:00.000Z'), frequency: 'monthly', amount: -100 },
      { nextDate: new Date('2026-06-18T12:00:00.000Z'), frequency: 'weekly', amount: -19.99 },
      { nextDate: new Date('2025-01-03T12:00:00.000Z'), frequency: 'biweekly', amount: 1420.5 },
      { nextDate: new Date('2026-07-01T12:00:00.000Z'), frequency: 'quarterly', amount: -300 },
      { nextDate: new Date('2024-08-09T12:00:00.000Z'), frequency: 'annually', amount: -1200 },
      { nextDate: new Date('2026-06-25T12:00:00.000Z'), frequency: 'unrecognised-frequency', amount: -5 },
    ],
  },
  { name: 'no history and no recurring items', balance: 0, journals: [], recurringItems: [] },
  { name: 'null balance sum', balance: null, journals: [{ amountDecimal: -10, transactionType: 'withdrawal' }], recurringItems: [] },
  {
    name: 'income only',
    balance: 100,
    journals: [{ amountDecimal: 9000, transactionType: 'deposit' }],
    recurringItems: [{ nextDate: new Date('2026-06-16T12:00:00.000Z'), frequency: 'yearly', amount: 42 }],
  },
];

describe('computeCashFlowForecast matches the pre-extraction route handler', () => {
  for (const fixture of FIXTURES) {
    for (const days of [30, 60, 90] as const) {
      it(`${fixture.name}, days=${days}`, async () => {
        const legacy = await legacyForecast('household-1', days, NOW, fakePrisma(fixture));
        const extracted = await computeCashFlowForecast(
          { householdId: 'household-1', days, now: NOW },
          fakePrisma(fixture),
        );

        expect(JSON.stringify(extracted)).toBe(JSON.stringify(legacy));
      });
    }
  }
});
