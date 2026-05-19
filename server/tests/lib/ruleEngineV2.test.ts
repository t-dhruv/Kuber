import { describe, expect, it, vi } from 'vitest';
import {
  applyActionsToJournal,
  applyActiveRulesToJournal,
  normalizeRuleActions,
  normalizeRuleTriggers,
  ruleMatchesMode,
  type NormalizedRuleAction,
  type NormalizedRuleTrigger,
} from '../../src/lib/ruleEngine';

describe('Firefly-style rule matching', () => {
  const tx = {
    merchantName: 'Amazon Marketplace',
    description: 'Amazon Prime annual fee',
    amount: -139,
    categoryId: 'cat-subscriptions',
    accountId: 'checking-1',
    notes: 'family plan',
  };

  it('strict rules require every trigger to match', () => {
    const triggers: NormalizedRuleTrigger[] = [
      { field: 'description', operator: 'contains', value: 'amazon', sortOrder: 1 },
      { field: 'amount', operator: 'lte', value: -100, sortOrder: 2 },
      { field: 'notes', operator: 'contains', value: 'family', sortOrder: 3 },
    ];

    expect(ruleMatchesMode(triggers, tx, true)).toBe(true);
    expect(ruleMatchesMode([...triggers, { field: 'accountId', operator: 'equals', value: 'visa-1', sortOrder: 4 }], tx, true)).toBe(false);
  });

  it('non-strict rules match when any trigger matches', () => {
    const triggers: NormalizedRuleTrigger[] = [
      { field: 'description', operator: 'contains', value: 'grocery', sortOrder: 1 },
      { field: 'merchantName', operator: 'contains', value: 'amazon', sortOrder: 2 },
    ];

    expect(ruleMatchesMode(triggers, tx, false)).toBe(true);
  });

  it('non-strict amount rules can match values outside a range', () => {
    const triggers: NormalizedRuleTrigger[] = [
      { field: 'amount', operator: 'gt', value: 100, sortOrder: 1 },
      { field: 'amount', operator: 'lt', value: -100, sortOrder: 2 },
    ];

    expect(ruleMatchesMode(triggers, { amount: -139 }, false)).toBe(true);
    expect(ruleMatchesMode(triggers, { amount: 139 }, false)).toBe(true);
    expect(ruleMatchesMode(triggers, { amount: 50 }, false)).toBe(false);
  });

  it('normalizes legacy JSON conditions and normalized trigger rows into one ordered trigger list', () => {
    const triggers = normalizeRuleTriggers({
      conditions: [{ field: 'amount', operator: 'lte', value: -50 }],
      triggers: [{ field: 'description', operator: 'contains', value: 'prime', sortOrder: 1 }],
    });

    expect(triggers).toEqual([
      { field: 'description', operator: 'contains', value: 'prime', sortOrder: 1 },
      { field: 'amount', operator: 'lte', value: -50, sortOrder: 2 },
    ]);
  });
});

describe('Firefly-style rule actions', () => {
  it('normalizes legacy JSON actions and normalized action rows into one ordered action list', () => {
    const actions = normalizeRuleActions({
      actions: [{ type: 'setNotes', value: 'legacy note' }],
      ruleActions: [
        { type: 'setCategory', value: 'cat-1', sortOrder: 1, stopProcessing: false },
        { type: 'addTag', value: 'tag-1', sortOrder: 2, stopProcessing: true },
      ],
    });

    expect(actions).toEqual([
      { type: 'setCategory', value: 'cat-1', sortOrder: 1, stopProcessing: false },
      { type: 'addTag', value: 'tag-1', sortOrder: 2, stopProcessing: true },
      { type: 'setNotes', value: 'legacy note', sortOrder: 3, stopProcessing: false },
    ]);
  });

  it('applies journal category, notes, description, and tag mutations in one transaction', async () => {
    const journalUpdateMany = vi.fn().mockResolvedValue({});
    const journalTagUpsert = vi.fn().mockResolvedValue({});
    const journalTagDeleteMany = vi.fn().mockResolvedValue({});
    const ruleExecutionLogCreate = vi.fn().mockResolvedValue({});
    const prisma = {
      $transaction: vi.fn(async (fn: (tx: any) => Promise<void>) => fn({
        transactionJournal: { updateMany: journalUpdateMany },
        journalTag: { upsert: journalTagUpsert, deleteMany: journalTagDeleteMany },
        ruleExecutionLog: { create: ruleExecutionLogCreate },
      })),
    };

    const actions: NormalizedRuleAction[] = [
      { type: 'setCategory', value: 'cat-food', sortOrder: 1, stopProcessing: false },
      { type: 'setDescription', value: 'Groceries', sortOrder: 2, stopProcessing: false },
      { type: 'setNotes', value: 'auto categorized', sortOrder: 3, stopProcessing: false },
      { type: 'addTag', value: 'tag-food', sortOrder: 4, stopProcessing: false },
      { type: 'removeTag', value: 'tag-review', sortOrder: 5, stopProcessing: false },
    ];

    await applyActionsToJournal(prisma as any, {
      journalId: 'journal-1',
      householdId: 'hh-1',
      ruleId: 'rule-1',
      actions,
    });

    expect(journalUpdateMany).toHaveBeenCalledWith({
      where: { id: 'journal-1', householdId: 'hh-1' },
      data: { categoryId: 'cat-food', description: 'Groceries', notes: 'auto categorized' },
    });
    expect(journalTagUpsert).toHaveBeenCalledWith({
      where: { journalId_tagId: { journalId: 'journal-1', tagId: 'tag-food' } },
      update: {},
      create: { journalId: 'journal-1', tagId: 'tag-food' },
    });
    expect(journalTagDeleteMany).toHaveBeenCalledWith({ where: { journalId: 'journal-1', tagId: 'tag-review' } });
    expect(ruleExecutionLogCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        householdId: 'hh-1',
        ruleId: 'rule-1',
        journalId: 'journal-1',
        actionsApplied: 5,
        status: 'applied',
      }),
    });
  });

  it('stops action execution when an action has stopProcessing', async () => {
    const journalUpdateMany = vi.fn().mockResolvedValue({});
    const prisma = {
      $transaction: vi.fn(async (fn: (tx: any) => Promise<void>) => fn({
        transactionJournal: { updateMany: journalUpdateMany },
        journalTag: { upsert: vi.fn(), deleteMany: vi.fn() },
        ruleExecutionLog: { create: vi.fn() },
      })),
    };

    await applyActionsToJournal(prisma as any, {
      journalId: 'journal-1',
      householdId: 'hh-1',
      ruleId: 'rule-1',
      actions: [
        { type: 'setNotes', value: 'first', sortOrder: 1, stopProcessing: true },
        { type: 'setDescription', value: 'second', sortOrder: 2, stopProcessing: false },
      ],
    });

    expect(journalUpdateMany).toHaveBeenCalledWith({
      where: { id: 'journal-1', householdId: 'hh-1' },
      data: { notes: 'first' },
    });
  });

  it('can switch journal source and destination account entries', async () => {
    const entryUpdateMany = vi.fn().mockResolvedValue({});
    const prisma = {
      $transaction: vi.fn(async (fn: (tx: any) => Promise<void>) => fn({
        transactionJournal: { updateMany: vi.fn() },
        transactionEntry: { updateMany: entryUpdateMany },
        journalTag: { upsert: vi.fn(), deleteMany: vi.fn() },
        ruleExecutionLog: { create: vi.fn() },
      })),
    };

    await applyActionsToJournal(prisma as any, {
      journalId: 'journal-1',
      householdId: 'hh-1',
      ruleId: 'rule-1',
      actions: [
        { type: 'setSourceAccount' as any, value: 'checking-2', sortOrder: 1, stopProcessing: false },
        { type: 'setDestinationAccount' as any, value: 'expense-food', sortOrder: 2, stopProcessing: false },
      ],
    });

    expect(entryUpdateMany).toHaveBeenNthCalledWith(1, {
      where: { journalId: 'journal-1', amountDecimal: { lt: 0 } },
      data: { accountId: 'checking-2' },
    });
    expect(entryUpdateMany).toHaveBeenNthCalledWith(2, {
      where: { journalId: 'journal-1', amountDecimal: { gt: 0 } },
      data: { accountId: 'expense-food' },
    });
  });
});

describe('journal-backed active rule execution', () => {
  it('evaluates groups and rules by sort order, then stops after a matching rule with stopProcessing', async () => {
    const ruleGroupFindMany = vi.fn().mockResolvedValue([
      {
        id: 'group-1',
        sortOrder: 1,
        stopProcessing: false,
        rules: [
          {
            id: 'rule-1',
            strict: true,
            stopProcessing: true,
            conditions: [],
            actions: [],
            triggers: [{ field: 'description', operator: 'contains', value: 'coffee', sortOrder: 1 }],
            ruleActions: [{ type: 'setCategory', value: 'cat-coffee', sortOrder: 1, stopProcessing: false }],
          },
          {
            id: 'rule-2',
            strict: false,
            stopProcessing: false,
            conditions: [],
            actions: [],
            triggers: [{ field: 'amount', operator: 'lt', value: -1, sortOrder: 1 }],
            ruleActions: [{ type: 'setNotes', value: 'should not run', sortOrder: 1, stopProcessing: false }],
          },
        ],
      },
    ]);
    const journalUpdateMany = vi.fn().mockResolvedValue({});
    const prisma = {
      ruleGroup: { findMany: ruleGroupFindMany },
      $transaction: vi.fn(async (fn: (tx: any) => Promise<void>) => fn({
        transactionJournal: { updateMany: journalUpdateMany },
        journalTag: { upsert: vi.fn(), deleteMany: vi.fn() },
        ruleExecutionLog: { create: vi.fn() },
      })),
    };

    const fired = await applyActiveRulesToJournal(prisma as any, {
      journalId: 'journal-1',
      householdId: 'hh-1',
      matchInput: { description: 'Morning coffee', merchantName: 'Cafe', amount: -5, accountId: 'checking-1' },
    });

    expect(ruleGroupFindMany).toHaveBeenCalledWith({
      where: { householdId: 'hh-1', isActive: true },
      include: {
        rules: {
          where: { isActive: true },
          include: { triggers: true, ruleActions: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
      orderBy: { sortOrder: 'asc' },
    });
    expect(fired).toEqual(['rule-1']);
    expect(journalUpdateMany).toHaveBeenCalledTimes(1);
  });
});

