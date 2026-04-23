import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyActionsToTransaction,
  applyActiveRulesToTransaction,
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
        transaction: { updateMany: transactionUpdateMany },
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
      where: { householdId: 'hh-1', isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
    expect(result).toEqual({ matched: 1, ruleIds: ['rule-1'] });
  });
});
