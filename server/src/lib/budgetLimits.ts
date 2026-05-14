import { Prisma } from '@prisma/client';
import { prisma as defaultPrisma } from './prisma';

// ---------------------------------------------------------------------------
// Period key helpers
// ---------------------------------------------------------------------------

export function getPeriodKey(date: Date, period: string): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');

  switch (period) {
    case 'yearly':
      return `${y}`;
    case 'quarterly':
      return `${y}-Q${Math.ceil((date.getMonth() + 1) / 3)}`;
    case 'weekly':
      return `${y}-W${String(getISOWeek(date)).padStart(2, '0')}`;
    default: // monthly
      return `${y}-${m}`;
  }
}

function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

export function parsePeriodKey(key: string, period: string): { start: Date; end: Date } {
  switch (period) {
    case 'yearly': {
      const y = parseInt(key, 10);
      return { start: new Date(y, 0, 1), end: new Date(y, 11, 31) };
    }
    case 'quarterly': {
      const [y, q] = key.split('-Q').map(Number);
      const startMonth = (q - 1) * 3;
      const endMonth = startMonth + 2;
      const endDay = new Date(y, endMonth + 1, 0).getDate();
      return { start: new Date(y, startMonth, 1), end: new Date(y, endMonth, endDay) };
    }
    default: {
      // monthly: "2024-03"
      const [y, m] = key.split('-').map(Number);
      const lastDay = new Date(y, m, 0).getDate();
      return { start: new Date(y, m - 1, 1), end: new Date(y, m - 1, lastDay) };
    }
  }
}

// ---------------------------------------------------------------------------
// Rollover calculation
// ---------------------------------------------------------------------------

interface RolloverInput {
  prevLimit: number;
  prevSpent: number;
  prevRollover: number;
  rolloverEnabled: boolean;
}

export function computeRolloverAmount({ prevLimit, prevSpent, prevRollover, rolloverEnabled }: RolloverInput): number {
  if (!rolloverEnabled) return 0;
  const leftover = prevLimit + prevRollover - prevSpent;
  return Math.round(leftover * 100) / 100;
}

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------

export async function getOrCreateBudgetLimit(
  budgetId: string,
  householdId: string,
  periodKey: string,
  limitAmount: Prisma.Decimal,
  db = defaultPrisma,
) {
  return db.budgetLimit.upsert({
    where: { budgetId_periodKey: { budgetId, periodKey } },
    create: { budgetId, householdId, periodKey, limitAmount },
    update: {},
  });
}

export async function recalcSpentAmount(
  budgetId: string,
  periodKey: string,
  period: string,
  db = defaultPrisma,
): Promise<Prisma.Decimal> {
  const budget = await db.budget.findUniqueOrThrow({
    where: { id: budgetId },
    select: { categoryId: true, householdId: true },
  });

  const { start, end } = parsePeriodKey(periodKey, period);

  const agg = await db.transactionJournal.aggregate({
    where: {
      householdId: budget.householdId,
      categoryId: budget.categoryId ?? undefined,
      transactionType: 'withdrawal',
      isDeleted: false,
      date: { gte: start, lte: end },
    },
    _sum: { amountDecimal: true },
  });

  const spent = (agg._sum as { amountDecimal?: Prisma.Decimal | null }).amountDecimal ?? new Prisma.Decimal(0);

  await db.budgetLimit.update({
    where: { budgetId_periodKey: { budgetId, periodKey } },
    data: { spentAmount: spent },
  });

  return spent;
}

export async function rolloverPreviousPeriod(
  budgetId: string,
  prevPeriodKey: string,
  nextPeriodKey: string,
  period: string,
  db = defaultPrisma,
): Promise<void> {
  const budget = await db.budget.findUniqueOrThrow({
    where: { id: budgetId },
    select: { rollover: true, amountDecimal: true, householdId: true },
  });

  if (!budget.rollover) return;

  const prevLimit = await db.budgetLimit.findUnique({
    where: { budgetId_periodKey: { budgetId, periodKey: prevPeriodKey } },
  });

  if (!prevLimit) return;

  const rolloverAmt = computeRolloverAmount({
    prevLimit: Number(prevLimit.limitAmount),
    prevSpent: Number(prevLimit.spentAmount),
    prevRollover: Number(prevLimit.rolloverAmount),
    rolloverEnabled: true,
  });

  const baseLimit = budget.amountDecimal ?? new Prisma.Decimal(0);

  await db.budgetLimit.upsert({
    where: { budgetId_periodKey: { budgetId, periodKey: nextPeriodKey } },
    create: {
      budgetId,
      householdId: budget.householdId,
      periodKey: nextPeriodKey,
      limitAmount: baseLimit,
      rolloverAmount: new Prisma.Decimal(rolloverAmt),
    },
    update: { rolloverAmount: new Prisma.Decimal(rolloverAmt) },
  });

  await recalcSpentAmount(budgetId, nextPeriodKey, period, db);
}
