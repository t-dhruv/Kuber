import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyActionsToTransaction,
  applyActiveRulesToTransaction,
  applyActiveRulesToTransactionGrouped,
  evalCondition,
  ruleMatches,
  type RuleAction,
  type RuleCondition,
} from './ruleEngine';

function createPrismaMock() {
  const transactionUpdateMany = vi.fn().mockResolvedValue({});
  const transactionTagUpsert = vi.fn().mockResolvedValue({});
  const ruleFindMany = vi.fn().mockResolvedValue([]);
  const prisma = {
    rule: { findMany: ruleFindMany },
    $transaction: vi.fn(async (fn: (tx: any) => Promise<void>) => {
      await fn({
        transactionJournal: { updateMany: transactionUpdateMany },
        transactionTag: { upsert: transactionTagUpsert },
      });
    }),
  };

  return { prisma, transactionUpdateMany, transactionTagUpsert, ruleFindMany };
}

describe('ruleEngine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('matches string conditions case-insensitively', () => {
    const condition: RuleCondition = {
      field: 'merchantName',
      operator: 'contains',
      value: 'amazon',
    };

    expect(evalCondition(condition, {
      merchantName: 'Amazon Marketplace',
      description: 'Order 123',
      amount: -42.18,
    })).toBe(true);
  });

  it('matches numeric conditions against transaction amount', () => {
    expect(ruleMatches([
      { field: 'amount', operator: 'lte', value: -100 },
      { field: 'description', operator: 'contains', value: 'rent' },
    ], {
      merchantName: 'Landlord',
      description: 'April rent',
      amount: -1250,
    })).toBe(true);
  });

  it('applies updates and tags for matching actions', async () => {
    const { prisma, transactionUpdateMany, transactionTagUpsert } = createPrismaMock();
    const actions: RuleAction[] = [
      { type: 'setCategory', value: 'cat-1' },
      { type: 'hide' },
      { type: 'markReviewed' },
      { type: 'addTag', value: 'tag-1' },
      { type: 'addTag', value: 'tag-2' },
    ];

    await applyActionsToTransaction(prisma as any, 'txn-1', actions, 'hh-1');

    expect(transactionUpdateMany).toHaveBeenCalledWith({
      where: { id: 'txn-1', householdId: 'hh-1' },
      data: { categoryId: 'cat-1', isHidden: true, needsReview: false },
    });
    expect(transactionTagUpsert).toHaveBeenCalledTimes(2);
    expect(transactionTagUpsert).toHaveBeenNthCalledWith(1, {
      where: { transactionId_tagId: { transactionId: 'txn-1', tagId: 'tag-1' } },
      update: {},
      create: { transactionId: 'txn-1', tagId: 'tag-1' },
    });
  });

  it('applies active rules in sort order and reports matches', async () => {
    const { prisma, ruleFindMany } = createPrismaMock();
    ruleFindMany.mockResolvedValue([
      {
        id: 'rule-1',
        sortOrder: 1,
        conditions: [{ field: 'description', operator: 'contains', value: 'coffee' }],
        actions: [{ type: 'addTag', value: 'tag-coffee' }],
      },
      {
        id: 'rule-2',
        sortOrder: 2,
        conditions: [{ field: 'amount', operator: 'lt', value: -20 }],
        actions: [{ type: 'setCategory', value: 'cat-dining' }],
      },
    ]);

    const result = await applyActiveRulesToTransaction(prisma as any, 'txn-9', 'hh-1', {
      merchantName: 'Local Cafe',
      description: 'Morning coffee',
      amount: -6.5,
    });

    expect(ruleFindMany).toHaveBeenCalledWith({
      where: { householdId: 'hh-1', isActive: true, ruleGroupId: null },
      orderBy: { sortOrder: 'asc' },
    });
    expect(result).toEqual(['rule-1']);
  });

  // ── New condition fields ──────────────────────────────────────────────────

  it('matches on categoryId field', () => {
    const condition: RuleCondition = { field: 'categoryId', operator: 'equals', value: 'cat-food' };
    expect(evalCondition(condition, { merchantName: '', description: '', amount: -10, categoryId: 'cat-food' })).toBe(true);
    expect(evalCondition(condition, { merchantName: '', description: '', amount: -10, categoryId: 'cat-other' })).toBe(false);
  });

  it('matches on accountId field', () => {
    const condition: RuleCondition = { field: 'accountId', operator: 'equals', value: 'acc-1' };
    expect(evalCondition(condition, { merchantName: '', description: '', amount: -10, accountId: 'acc-1' })).toBe(true);
  });

  it('startsWith and endsWith string operators', () => {
    const sw: RuleCondition = { field: 'description', operator: 'startsWith', value: 'amazon' };
    const ew: RuleCondition = { field: 'description', operator: 'endsWith', value: 'prime' };
    expect(evalCondition(sw, { merchantName: '', description: 'Amazon Prime', amount: -15 })).toBe(true);
    expect(evalCondition(ew, { merchantName: '', description: 'Amazon Prime', amount: -15 })).toBe(true);
    expect(evalCondition(sw, { merchantName: '', description: 'Netflix Prime', amount: -15 })).toBe(false);
  });

  // ── New action types ──────────────────────────────────────────────────────

  it('setDescription action updates description field', async () => {
    const { prisma, transactionUpdateMany } = createPrismaMock();
    const actions: RuleAction[] = [{ type: 'setDescription', value: 'Mortgage Payment' }];
    await applyActionsToTransaction(prisma as any, 'txn-1', actions, 'hh-1');
    expect(transactionUpdateMany).toHaveBeenCalledWith({
      where: { id: 'txn-1', householdId: 'hh-1' },
      data:  { description: 'Mortgage Payment' },
    });
  });

  it('setNotes action updates notes field', async () => {
    const { prisma, transactionUpdateMany } = createPrismaMock();
    const actions: RuleAction[] = [{ type: 'setNotes', value: 'Auto-tagged by rule' }];
    await applyActionsToTransaction(prisma as any, 'txn-1', actions, 'hh-1');
    expect(transactionUpdateMany).toHaveBeenCalledWith({
      where: { id: 'txn-1', householdId: 'hh-1' },
      data:  { notes: 'Auto-tagged by rule' },
    });
  });

  it('flagForReview action sets needsReview=true', async () => {
    const { prisma, transactionUpdateMany } = createPrismaMock();
    await applyActionsToTransaction(prisma as any, 'txn-1', [{ type: 'flagForReview' }], 'hh-1');
    expect(transactionUpdateMany).toHaveBeenCalledWith({
      where: { id: 'txn-1', householdId: 'hh-1' },
      data:  { needsReview: true },
    });
  });

  it('clearCategory action sets categoryId=null', async () => {
    const { prisma, transactionUpdateMany } = createPrismaMock();
    await applyActionsToTransaction(prisma as any, 'txn-1', [{ type: 'clearCategory' }], 'hh-1');
    expect(transactionUpdateMany).toHaveBeenCalledWith({
      where: { id: 'txn-1', householdId: 'hh-1' },
      data:  { categoryId: null },
    });
  });
});

describe('applyActiveRulesToTransactionGrouped', () => {
  function makeGroupPrisma(groups: any[]) {
    const txUpdateMany = vi.fn().mockResolvedValue({});
    const txTagUpsert  = vi.fn().mockResolvedValue({});
    const prisma = {
      ruleGroup: { findMany: vi.fn().mockResolvedValue(groups) },
      $transaction: vi.fn(async (fn: any) => fn({
        transactionJournal: { updateMany: txUpdateMany },
        transactionTag: { upsert: txTagUpsert },
      })),
    };
    return { prisma, txUpdateMany, txTagUpsert };
  }

  it('stops evaluating after group with stopProcessing fires', async () => {
    const { prisma, txUpdateMany } = makeGroupPrisma([
      {
        id: 'g1', sortOrder: 1, stopProcessing: true, isActive: true,
        rules: [{ id: 'r1', isActive: true, conditions: [{ field: 'description', operator: 'contains', value: 'coffee' }], actions: [{ type: 'setCategory', value: 'cat-coffee' }] }],
      },
      {
        id: 'g2', sortOrder: 2, stopProcessing: false, isActive: true,
        rules: [{ id: 'r2', isActive: true, conditions: [{ field: 'description', operator: 'contains', value: 'coffee' }], actions: [{ type: 'setCategory', value: 'cat-other' }] }],
      },
    ]);

    await applyActiveRulesToTransactionGrouped(prisma as any, 'txn-1', 'hh-1', { merchantName: '', description: 'Starbucks coffee', amount: -5 });

    expect(txUpdateMany).toHaveBeenCalledTimes(1);
    expect(txUpdateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ categoryId: 'cat-coffee' }) }));
  });

  it('continues evaluating when stopProcessing is false', async () => {
    const { prisma, txUpdateMany } = makeGroupPrisma([
      {
        id: 'g1', sortOrder: 1, stopProcessing: false, isActive: true,
        rules: [{ id: 'r1', isActive: true, conditions: [{ field: 'description', operator: 'contains', value: 'coffee' }], actions: [{ type: 'setCategory', value: 'cat-coffee' }] }],
      },
      {
        id: 'g2', sortOrder: 2, stopProcessing: false, isActive: true,
        rules: [{ id: 'r2', isActive: true, conditions: [{ field: 'description', operator: 'contains', value: 'coffee' }], actions: [{ type: 'setNotes', value: 'auto-tagged' }] }],
      },
    ]);

    await applyActiveRulesToTransactionGrouped(prisma as any, 'txn-1', 'hh-1', { merchantName: '', description: 'Starbucks coffee', amount: -5 });

    expect(txUpdateMany).toHaveBeenCalledTimes(2);
  });
});
