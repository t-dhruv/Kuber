import type { PrismaClient } from '@prisma/client';

export type RuleCondition = {
  field: 'merchantName' | 'description' | 'amount';
  operator: 'contains' | 'equals' | 'startsWith' | 'endsWith' | 'gt' | 'lt' | 'gte' | 'lte';
  value: string | number;
};

export type RuleAction = {
  type: 'setCategory' | 'addTag' | 'hide' | 'markReviewed';
  value?: string;
};

export type RuleMatchInput = {
  description: string;
  merchantName: string;
  amount: number;
};

export function evalCondition(cond: RuleCondition, tx: RuleMatchInput): boolean {
  const raw = cond.field === 'amount'
    ? tx.amount
    : (cond.field === 'merchantName' ? tx.merchantName : tx.description);

  if (cond.field === 'amount') {
    const n = typeof raw === 'number' ? raw : 0;
    const v = typeof cond.value === 'number' ? cond.value : parseFloat(cond.value);
    switch (cond.operator) {
      case 'equals': return n === v;
      case 'gt': return n > v;
      case 'lt': return n < v;
      case 'gte': return n >= v;
      case 'lte': return n <= v;
      default: return false;
    }
  }

  const s = String(raw).toLowerCase();
  const v = String(cond.value).toLowerCase();
  switch (cond.operator) {
    case 'contains': return s.includes(v);
    case 'equals': return s === v;
    case 'startsWith': return s.startsWith(v);
    case 'endsWith': return s.endsWith(v);
    default: return false;
  }
}

export function ruleMatches(conditions: RuleCondition[], tx: RuleMatchInput): boolean {
  return conditions.every((condition) => evalCondition(condition, tx));
}

export async function applyActionsToTransaction(
  prisma: PrismaClient,
  txId: string,
  actions: RuleAction[],
  householdId: string,
): Promise<number> {
  const updates: Record<string, unknown> = {};
  const tagIds: string[] = [];

  for (const action of actions) {
    switch (action.type) {
      case 'setCategory':
        if (action.value) updates.categoryId = action.value;
        break;
      case 'hide':
        updates.isHidden = true;
        break;
      case 'markReviewed':
        updates.needsReview = false;
        break;
      case 'addTag':
        if (action.value) tagIds.push(action.value);
        break;
    }
  }

  await prisma.$transaction(async (tx) => {
    if (Object.keys(updates).length > 0) {
      await tx.transaction.updateMany({ where: { id: txId, householdId }, data: updates });
    }
    for (const tagId of tagIds) {
      await tx.transactionTag.upsert({
        where: { transactionId_tagId: { transactionId: txId, tagId } },
        update: {},
        create: { transactionId: txId, tagId },
      });
    }
  });

  return 1;
}

export async function applyActiveRulesToTransaction(
  prisma: PrismaClient,
  txId: string,
  householdId: string,
  tx: RuleMatchInput,
): Promise<{ matched: number; ruleIds: string[] }> {
  const rules = await prisma.rule.findMany({
    where: { householdId, isActive: true },
    orderBy: { sortOrder: 'asc' },
  });

  let matched = 0;
  const ruleIds: string[] = [];

  for (const rule of rules) {
    const conditions = rule.conditions as unknown as RuleCondition[];
    if (!ruleMatches(conditions, tx)) continue;

    await applyActionsToTransaction(
      prisma,
      txId,
      rule.actions as unknown as RuleAction[],
      householdId,
    );
    matched += 1;
    ruleIds.push(rule.id);
  }

  return { matched, ruleIds };
}
