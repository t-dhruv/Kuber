import { Decimal } from '@prisma/client/runtime/library';
import type { PrismaClient } from '@prisma/client';
import { getPeriodKey } from './budgetLimits';

type PrevLimit = { amount: Decimal; spent: Decimal } | null;

export function computeAutoBudgetAmount(
  type: string,
  base: Decimal,
  prev: PrevLimit,
): Decimal {
  if (!prev || type === 'RESET') return base;

  if (type === 'ROLLOVER') {
    const unspent = prev.amount.sub(prev.spent);
    return unspent.gt(0) ? base.add(unspent) : base;
  }

  if (type === 'ADJUSTED') {
    const overspent = prev.spent.sub(prev.amount);
    return overspent.gt(0) ? base.sub(overspent) : base;
  }

  return base;
}

function getPreviousPeriodKey(periodKey: string): string {
  const [y, m] = periodKey.split('-').map(Number);
  if (m === 1) return `${y - 1}-12`;
  return `${y}-${String(m - 1).padStart(2, '0')}`;
}

export async function runAutoBudget(prisma: PrismaClient): Promise<void> {
  const periodKey = getPeriodKey(new Date(), 'monthly');
  const prevKey   = getPreviousPeriodKey(periodKey);

  const budgets = await prisma.budget.findMany({
    where: { autoBudgetType: { not: null }, autoBudgetAmount: { not: null } },
  });

  for (const budget of budgets) {
    const prevLimit = await prisma.budgetLimit.findUnique({
      where: { budgetId_periodKey: { budgetId: budget.id, periodKey: prevKey } },
    });

    const newAmount = computeAutoBudgetAmount(
      budget.autoBudgetType!,
      budget.autoBudgetAmount!,
      prevLimit ? { amount: prevLimit.limitAmount, spent: prevLimit.spentAmount } : null,
    );

    await prisma.budgetLimit.upsert({
      where:  { budgetId_periodKey: { budgetId: budget.id, periodKey } },
      create: {
        budgetId:    budget.id,
        householdId: budget.householdId,
        periodKey,
        limitAmount: newAmount,
        spentAmount: new Decimal(0),
      },
      update: { limitAmount: newAmount },
    });
  }
}
