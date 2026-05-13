import type { PrismaClient } from '@prisma/client';

export type RuleCondition = {
  field: 'merchantName' | 'description' | 'amount' | 'categoryId' | 'accountId' | 'notes';
  operator: 'contains' | 'notContains' | 'startsWith' | 'endsWith' | 'equals' | 'notEquals' | 'gt' | 'gte' | 'lt' | 'lte';
  value: string | number;
};

export type RuleAction = {
  type: 'setCategory' | 'clearCategory' | 'addTag' | 'removeTag' | 'hide' | 'unhide' |
        'markReviewed' | 'flagForReview' | 'setDescription' | 'setNotes' | 'appendNotes' |
        'setSourceAccount' | 'setDestinationAccount';
  value?: string;
};

export type NormalizedRuleTrigger = RuleCondition & {
  sortOrder?: number;
};

export type NormalizedRuleAction = RuleAction & {
  sortOrder?: number;
  stopProcessing?: boolean;
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

function sortByOrder<T extends { sortOrder?: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}

export function normalizeRuleTriggers(rule: {
  conditions?: unknown;
  triggers?: unknown;
}): NormalizedRuleTrigger[] {
  const normalized = Array.isArray(rule.triggers)
    ? sortByOrder(rule.triggers as NormalizedRuleTrigger[])
    : [];
  const legacy = Array.isArray(rule.conditions)
    ? (rule.conditions as RuleCondition[]).map((condition, index) => ({
        ...condition,
        sortOrder: normalized.length + index + 1,
      }))
    : [];

  return [...normalized, ...legacy];
}

export function normalizeRuleActions(rule: {
  actions?: unknown;
  ruleActions?: unknown;
}): NormalizedRuleAction[] {
  const normalized = Array.isArray(rule.ruleActions)
    ? sortByOrder(rule.ruleActions as NormalizedRuleAction[])
    : [];
  const legacy = Array.isArray(rule.actions)
    ? (rule.actions as RuleAction[]).map((action, index) => ({
        ...action,
        sortOrder: normalized.length + index + 1,
        stopProcessing: false,
      }))
    : [];

  return [...normalized, ...legacy];
}

export function ruleMatchesMode(
  triggers: NormalizedRuleTrigger[],
  tx: RuleMatchInput,
  strict: boolean,
): boolean {
  if (triggers.length === 0) return false;
  return strict
    ? triggers.every(trigger => evalCondition(trigger, tx))
    : triggers.some(trigger => evalCondition(trigger, tx));
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
      case 'setSourceAccount':
      case 'setDestinationAccount':
        break;
    }
  }

  await (prisma as any).$transaction(async (tx: any) => {
    if (Object.keys(updateData).length > 0) {
      await tx.transactionJournal.updateMany({ where: { id: txId, householdId }, data: updateData });
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

export async function applyActionsToJournal(
  prisma: Pick<PrismaClient, '$transaction'>,
  input: {
    journalId: string;
    householdId: string;
    ruleId: string;
    actions: NormalizedRuleAction[];
  },
): Promise<number> {
  const updateData: Record<string, unknown> = {};
  const tagUpserts: string[] = [];
  const tagRemovals: string[] = [];
  const entryAccountUpdates: Array<{ direction: 'source' | 'destination'; accountId: string }> = [];
  let actionsApplied = 0;

  for (const action of sortByOrder(input.actions)) {
    actionsApplied++;
    switch (action.type) {
      case 'setCategory': updateData.categoryId = action.value; break;
      case 'clearCategory': updateData.categoryId = null; break;
      case 'setDescription': updateData.description = action.value; break;
      case 'setNotes': updateData.notes = action.value; break;
      case 'appendNotes': updateData.notes = action.value; break;
      case 'addTag': if (action.value) tagUpserts.push(action.value); break;
      case 'removeTag': if (action.value) tagRemovals.push(action.value); break;
      case 'setSourceAccount':
        if (action.value) entryAccountUpdates.push({ direction: 'source', accountId: action.value });
        break;
      case 'setDestinationAccount':
        if (action.value) entryAccountUpdates.push({ direction: 'destination', accountId: action.value });
        break;
      case 'hide':
      case 'unhide':
      case 'markReviewed':
      case 'flagForReview':
        break;
    }
    if (action.stopProcessing) break;
  }

  await (prisma as any).$transaction(async (tx: any) => {
    if (Object.keys(updateData).length > 0) {
      await tx.transactionJournal.updateMany({
        where: { id: input.journalId, householdId: input.householdId },
        data: updateData,
      });
    }
    for (const tagId of tagUpserts) {
      await tx.journalTag.upsert({
        where: { journalId_tagId: { journalId: input.journalId, tagId } },
        update: {},
        create: { journalId: input.journalId, tagId },
      });
    }
    for (const tagId of tagRemovals) {
      await tx.journalTag.deleteMany({ where: { journalId: input.journalId, tagId } });
    }
    for (const update of entryAccountUpdates) {
      await tx.transactionEntry.updateMany({
        where: {
          journalId: input.journalId,
          amountDecimal: update.direction === 'source' ? { lt: 0 } : { gt: 0 },
        },
        data: { accountId: update.accountId },
      });
    }
    if (tx.ruleExecutionLog?.create) {
      await tx.ruleExecutionLog.create({
        data: {
          householdId: input.householdId,
          ruleId: input.ruleId,
          journalId: input.journalId,
          status: 'applied',
          actionsApplied,
        },
      });
    }
  });

  return actionsApplied;
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

export async function applyActiveRulesToJournal(
  prisma: Pick<PrismaClient, 'ruleGroup' | '$transaction'>,
  input: {
    journalId: string;
    householdId: string;
    matchInput: RuleMatchInput;
  },
): Promise<string[]> {
  const groups = await (prisma as any).ruleGroup.findMany({
    where: { householdId: input.householdId, isActive: true },
    include: {
      rules: {
        where: { isActive: true },
        include: { triggers: true, ruleActions: true },
        orderBy: { sortOrder: 'asc' },
      },
    },
    orderBy: { sortOrder: 'asc' },
  });
  const fired: string[] = [];

  for (const group of groups) {
    let groupFired = false;
    for (const rule of group.rules) {
      const triggers = normalizeRuleTriggers(rule);
      if (!ruleMatchesMode(triggers, input.matchInput, rule.strict ?? true)) continue;

      await applyActionsToJournal(prisma, {
        journalId: input.journalId,
        householdId: input.householdId,
        ruleId: rule.id,
        actions: normalizeRuleActions(rule),
      });
      fired.push(rule.id);
      groupFired = true;
      if (rule.stopProcessing) break;
    }
    if (groupFired && group.stopProcessing) break;
  }

  return fired;
}
