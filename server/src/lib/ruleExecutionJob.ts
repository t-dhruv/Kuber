import { prisma } from './prisma';
import { applyActiveRulesToTransaction } from './ruleEngine';

const LOOKBACK_HOURS = 24;

/**
 * Applies all active household rules to transactions created in the last LOOKBACK_HOURS.
 * Runs on a schedule; skips transactions that already have a categoryId when the
 * matching rule would only set category (non-destructive — other rule actions still fire).
 */
export async function runRuleExecutionJob(): Promise<{ processed: number; matched: number }> {
  const since = new Date(Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000);

  const transactions = await prisma.transaction.findMany({
    where: { createdAt: { gte: since } },
    select: {
      id: true,
      householdId: true,
      description: true,
      amount: true,
      amountDecimal: true,
      merchant: { select: { name: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  let processed = 0;
  let matched = 0;

  for (const tx of transactions) {
    const txContext = {
      description: tx.description ?? '',
      merchantName: tx.merchant?.name ?? '',
      amount: tx.amountDecimal ? Number(tx.amountDecimal) : tx.amount,
    };

    const fired: string[] = await applyActiveRulesToTransaction(prisma, tx.id, tx.householdId, txContext);
    processed++;
    matched += fired.length;
  }

  return { processed, matched };
}
