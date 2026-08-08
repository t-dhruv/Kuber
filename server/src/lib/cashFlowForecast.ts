import type { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from './prisma';

/**
 * The cash-flow forecast, extracted verbatim from the GET /api/v1/cashflow/forecast
 * route handler so that both that route and the `cash_flow_forecast` standard report
 * read from one projection instead of two that drift apart.
 *
 * The maths is deliberately unchanged from the route version. Three details are
 * load-bearing and must not be "cleaned up":
 *
 * - The history window is 90 days and the average divides by the literal 90, not by
 *   the number of days that actually returned rows. The average is over the window.
 * - `isRecurring: false` on the historical query. Recurring Journals are excluded from
 *   the average because they are added back explicitly from RecurringItem; without the
 *   filter every subscription is counted twice.
 * - The walk-forward loop advances a RecurringItem whose nextDate is in the past to its
 *   first future occurrence, rather than skipping it or emitting it at the stale date.
 */

export interface CashFlowForecastInput {
  householdId: string;
  days: 30 | 60 | 90;
  /** Injectable for tests; defaults to `new Date()`. Every other date derives from it. */
  now?: Date;
}

export interface CashFlowForecastResult {
  currentBalance: number;
  projections: Array<{ date: string; projected: number; dailyNet: number }>;
  summary: {
    days: number;
    projectedEndBalance: number;
    avgMonthlyIncome: number;
    avgMonthlyExpense: number;
    knownRecurringTotal: number;
  };
}

type CashflowJournal = {
  amountDecimal: unknown;
  transactionType?: string | null;
  category?: { type?: string | null } | null;
};

type CashflowDirection = 'income' | 'expense' | 'transfer' | 'ignored';

function reportableCategoryFilter() {
  return {
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
  };
}

function classifyCashflowJournal(journal: CashflowJournal): CashflowDirection {
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

function cashflowAmount(journal: CashflowJournal): number {
  return Math.abs(Number(journal.amountDecimal));
}

function advanceByFrequency(date: Date, frequency: string): Date {
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

export async function computeCashFlowForecast(
  input: CashFlowForecastInput,
  prisma: Pick<PrismaClient, 'account' | 'transactionJournal' | 'recurringItem'> = defaultPrisma,
): Promise<CashFlowForecastResult> {
  const householdId = input.householdId;
  const days = input.days;
  const now = input.now ?? new Date();

  // 1. Current balance: sum of all non-hidden accounts
  const balanceAgg = await prisma.account.aggregate({
    _sum: { balance: true },
    where: { householdId, isHidden: false },
  });
  const currentBalance = balanceAgg._sum.balance ?? 0;

  // 2. Historical daily averages from last 90 days
  const historyStart = new Date(now);
  historyStart.setDate(historyStart.getDate() - 90);

  const historicalJournals = await prisma.transactionJournal.findMany({
    where: {
      householdId,
      date: { gte: historyStart, lte: now },
      isHidden: false,
      isRecurring: false,
      isDeleted: false,
      ...reportableCategoryFilter(),
    },
    select: { amountDecimal: true, transactionType: true, category: { select: { type: true } } },
  }) as CashflowJournal[];

  let totalIncome = 0;
  let totalExpenses = 0;
  for (const j of historicalJournals) {
    const direction = classifyCashflowJournal(j);
    const amount = cashflowAmount(j);
    if (direction === 'income') totalIncome += amount;
    if (direction === 'expense') totalExpenses += amount;
  }

  const avgDailyIncome = historicalJournals.length > 0 ? totalIncome / 90 : 0;
  const avgDailyExpense = historicalJournals.length > 0 ? totalExpenses / 90 : 0;

  // 3. Known recurring items in the forecast window
  const recurringItems = await prisma.recurringItem.findMany({
    where: { householdId, isActive: true },
  });

  // Build a map of date -> adjustment
  const recurringMap = new Map<string, number>();
  const forecastEnd = new Date(now);
  forecastEnd.setDate(forecastEnd.getDate() + days);

  for (const item of recurringItems) {
    let cursor = new Date(item.nextDate);
    // Walk cursor forward if it's before today so we start from first future occurrence
    while (cursor < now) {
      cursor = advanceByFrequency(cursor, item.frequency);
    }
    // Now collect all occurrences within forecast window
    while (cursor <= forecastEnd) {
      const dateKey = cursor.toISOString().slice(0, 10);
      recurringMap.set(dateKey, (recurringMap.get(dateKey) ?? 0) + item.amount);
      cursor = advanceByFrequency(cursor, item.frequency);
    }
  }

  // 4. Project forward day by day
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
