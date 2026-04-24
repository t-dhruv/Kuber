import type { PrismaClient } from '@prisma/client';

export type RuleCondition = {
  field: 'merchantName' | 'description' | 'amount' | 'categoryId' | 'accountId' | 'notes';
  operator: 'contains' | 'notContains' | 'startsWith' | 'endsWith' | 'equals' | 'notEquals' | 'gt' | 'gte' | 'lt' | 'lte';
  value: string | number;
};

export type RuleAction = {
  type: 'setCategory' | 'clearCategory' | 'addTag' | 'removeTag' | 'hide' | 'unhide' |
        'markReviewed' | 'flagForReview' | 'setDescription' | 'setNotes' | 'appendNotes';
  value?: string;
};

export type RuleMatchInput = {
  merchantName?: string | null;
  description?:  string | null;
  amount?:       number | null;
  categoryId?:   string | null;
  accountId?:    string | null;
  notes?:        string | null;
};

export function evalCondition(cond: RuleCondition, tx: RuleMatchInput): boolean {
  const raw = tx[cond.field as keyof RuleMatchInput];

  if (['gt', 'gte', 'lt', 'lte'].includes(cond.operator)) {
    const num = typeof raw === 'number' ? raw : parseFloat(String(raw ?? '0'));
    const v   = typeof cond.value === 'number' ? cond.value : parseFloat(String(cond.value));
    if (cond.operator === 'gt')  return num > v;
    if (cond.operator === 'gte') return num >= v;
    if (cond.operator === 'lt')  return num < v;
    if (cond.operator === 'lte') return num <= v;
  }

  const s = String(raw ?? '').toLowerCase();
  const v = String(cond.value).toLowerCase();
  if (cond.operator === 'equals')      return s === v;
  if (cond.operator === 'notEquals')   return s !== v;
  if (cond.operator === 'contains')    return s.includes(v);
  if (cond.operator === 'notContains') return !s.includes(v);
  if (cond.operator === 'startsWith')  return s.startsWith(v);
  if (cond.operator === 'endsWith')    return s.endsWith(v);
  return false;
}

export function ruleMatches(conditions: RuleCondition[], tx: RuleMatchInput): boolean {
  return conditions.every(c => evalCondition(c, tx));
}

export async function applyActionsToTransaction(
  prisma: Pick<PrismaClient, '$transaction'>,
  txId: string,
  actions: RuleAction[],
  householdId: string,
): Promise<void> {
  const updateData: Record<string, unknown> = {};
  const tagUpserts: string[] = [];
  const tagRemovals: string[] = [];

  for (const action of actions) {
    switch (action.type) {
      case 'setCategory':    updateData.categoryId   = action.value; break;
      case 'clearCategory':  updateData.categoryId   = null; break;
      case 'hide':           updateData.isHidden      = true; break;
      case 'unhide':         updateData.isHidden      = false; break;
      case 'markReviewed':   updateData.needsReview   = false; break;
      case 'flagForReview':  updateData.needsReview   = true; break;
      case 'setDescription': updateData.description   = action.value; break;
      case 'setNotes':       updateData.notes         = action.value; break;
      case 'appendNotes':    break; // no-op for now
      case 'addTag':    if (action.value) tagUpserts.push(action.value); break;
      case 'removeTag': if (action.value) tagRemovals.push(action.value); break;
    }
  }

  await (prisma as any).$transaction(async (tx: any) => {
    if (Object.keys(updateData).length > 0) {
      await tx.transaction.updateMany({ where: { id: txId, householdId }, data: updateData });
    }
    for (const tagId of tagUpserts) {
      await tx.transactionTag.upsert({
        where:  { transactionId_tagId: { transactionId: txId, tagId } },
        update: {},
        create: { transactionId: txId, tagId },
      });
    }
    for (const tagId of tagRemovals) {
      await tx.transactionTag.deleteMany({ where: { transactionId: txId, tagId } }).catch(() => {});
    }
  });
}

export async function applyActiveRulesToTransaction(
  prisma: Pick<PrismaClient, 'rule' | '$transaction'>,
  txId: string,
  householdId: string,
  txData: RuleMatchInput,
): Promise<string[]> {
  const rules = await (prisma as any).rule.findMany({
    where: { householdId, isActive: true, ruleGroupId: null },
    orderBy: { sortOrder: 'asc' },
  });
  const fired: string[] = [];
  for (const rule of rules) {
    if (ruleMatches(rule.conditions as RuleCondition[], txData)) {
      await applyActionsToTransaction(prisma, txId, rule.actions as RuleAction[], householdId);
      fired.push(rule.id);
    }
  }
  return fired;
}

export async function applyActiveRulesToTransactionGrouped(
  prisma: Pick<PrismaClient, 'ruleGroup' | '$transaction'>,
  txId: string,
  householdId: string,
  txData: RuleMatchInput,
): Promise<string[]> {
  const groups = await (prisma as any).ruleGroup.findMany({
    where: { householdId, isActive: true },
    include: { rules: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } } },
    orderBy: { sortOrder: 'asc' },
  });
  const fired: string[] = [];
  for (const group of groups) {
    let groupFired = false;
    for (const rule of group.rules) {
      if (ruleMatches(rule.conditions as RuleCondition[], txData)) {
        await applyActionsToTransaction(prisma, txId, rule.actions as RuleAction[], householdId);
        fired.push(rule.id);
        groupFired = true;
      }
    }
    if (groupFired && group.stopProcessing) break;
  }
  return fired;
}
