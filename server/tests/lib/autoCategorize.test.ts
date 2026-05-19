import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  batchAutoCategorize,
  detectRuleSuggestions,
  getBatchJobState,
  normalizeMerchant,
  startBatchAutoCategorize,
  suggestCategory,
} from '../../src/lib/autoCategorize';
import { getAiClientForHousehold } from '../../src/lib/ai/index.js';

vi.mock('../../src/lib/ai/index.js', () => ({
  getAiClientForHousehold: vi.fn(),
}));

vi.mock('../../src/lib/ruleEngine.js', () => ({
  ruleMatches: vi.fn((conditions: Array<{ value?: string }>, input: { description: string }) =>
    conditions.some((condition) => input.description.toLowerCase().includes(String(condition.value).toLowerCase())),
  ),
}));

function makePrisma() {
  return {
    category: { findMany: vi.fn() },
    categoryLearningExample: { findMany: vi.fn() },
    rule: { findMany: vi.fn() },
    transactionJournal: {
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  };
}

describe('auto categorization', () => {
  beforeEach(() => vi.clearAllMocks());

  it('normalizes merchant descriptions by removing volatile suffixes', () => {
    expect(normalizeMerchant('AMAZON.CA* B70MA7890')).toBe('amazon.ca');
    expect(normalizeMerchant('Coffee Shop 123456789')).toBe('coffee shop');
    expect(normalizeMerchant('PAYMENT [ABCDEF12]')).toBe('payment');
  });

  it('returns null when no categories exist for single-transaction suggestions', async () => {
    const prisma = makePrisma();
    prisma.category.findMany.mockResolvedValue([]);
    prisma.categoryLearningExample.findMany.mockResolvedValue([]);

    const suggestion = await suggestCategory(prisma as any, 'household-1', 'Grocery Store', -42);

    expect(suggestion).toBeNull();
    expect(getAiClientForHousehold).not.toHaveBeenCalled();
  });

  it('maps a confident AI category to an existing category', async () => {
    const prisma = makePrisma();
    prisma.category.findMany.mockResolvedValue([{ id: 'cat-1', name: 'Groceries', type: 'expense' }]);
    prisma.categoryLearningExample.findMany.mockResolvedValue([]);
    vi.mocked(getAiClientForHousehold).mockResolvedValue({
      complete: vi.fn().mockResolvedValue({
        content: '{"t0":{"category":"Groceries","confidence":0.91,"noMatch":false}}',
      }),
    } as any);

    const suggestion = await suggestCategory(prisma as any, 'household-1', 'Fresh Market', -52);

    expect(suggestion).toEqual({
      categoryId: 'cat-1',
      categoryName: 'Groceries',
      suggestedNewName: null,
      confidence: 0.91,
    });
  });

  it('returns notConfigured when batch categorization has no AI provider', async () => {
    const prisma = makePrisma();
    vi.mocked(getAiClientForHousehold).mockRejectedValue(new Error('not configured'));

    const result = await startBatchAutoCategorize(prisma as any, 'household-1');

    expect(result).toEqual({ jobId: '', total: 0, notConfigured: true });
    expect(prisma.transactionJournal.updateMany).not.toHaveBeenCalled();
  });

  it('applies active rules before queuing AI review work', async () => {
    const prisma = makePrisma();
    vi.mocked(getAiClientForHousehold).mockResolvedValue({
      complete: vi.fn().mockResolvedValue({ content: '{}' }),
    } as any);
    prisma.rule.findMany.mockResolvedValue([
      {
        conditions: [{ field: 'description', operator: 'contains', value: 'payroll' }],
        actions: [{ type: 'setCategory', value: 'income-cat' }],
      },
    ]);
    prisma.transactionJournal.findMany.mockResolvedValue([
      { id: 'txn-1', description: 'Payroll Deposit', amountDecimal: 1000, notes: null },
    ]);
    prisma.category.findMany.mockResolvedValue([]);
    prisma.categoryLearningExample.findMany.mockResolvedValue([]);

    const result = await startBatchAutoCategorize(prisma as any, 'household-1');

    expect(result.total).toBe(0);
    expect(prisma.transactionJournal.update).toHaveBeenCalledWith({
      where: { id: 'txn-1' },
      data: { categoryId: 'income-cat', needsReview: false },
    });
    expect(getBatchJobState(result.jobId)).toMatchObject({
      total: 0,
      processed: 0,
      skipped: 1,
      done: true,
      notConfigured: false,
    });
  });

  it('waits for async batch work in the backwards-compatible wrapper', async () => {
    const prisma = makePrisma();
    vi.mocked(getAiClientForHousehold).mockResolvedValue({
      complete: vi.fn().mockResolvedValue({
        content: '{"t0":{"category":"Groceries","confidence":0.9,"noMatch":false}}',
      }),
    } as any);
    prisma.rule.findMany.mockResolvedValue([]);
    prisma.transactionJournal.findMany.mockResolvedValue([
      { id: 'txn-1', description: 'Market ABC123', amountDecimal: -25, notes: null },
      { id: 'txn-2', description: 'Market XYZ999', amountDecimal: -31, notes: null },
    ]);
    prisma.category.findMany.mockResolvedValue([{ id: 'cat-1', name: 'Groceries', type: 'expense' }]);
    prisma.categoryLearningExample.findMany.mockResolvedValue([]);
    prisma.transactionJournal.updateMany.mockResolvedValue({ count: 1 });

    const result = await batchAutoCategorize(prisma as any, 'household-1');

    expect(result).toEqual({ queued: 2, skipped: 0, notConfigured: false });
    expect(prisma.transactionJournal.updateMany).toHaveBeenCalledWith({
      where: { id: 'txn-1', categoryId: null },
      data: {
        needsReview: true,
        aiSuggestedCategoryId: 'cat-1',
        aiSuggestedCategoryName: null,
        aiSuggestionConfidence: 0.9,
      },
    });
    expect(prisma.transactionJournal.updateMany).toHaveBeenCalledWith({
      where: { id: 'txn-2', categoryId: null },
      data: {
        needsReview: true,
        aiSuggestedCategoryId: 'cat-1',
        aiSuggestedCategoryName: null,
        aiSuggestionConfidence: 0.9,
      },
    });
  });

  it('suggests new rules from repeated review queue descriptions', async () => {
    const prisma = makePrisma();
    prisma.rule.findMany.mockResolvedValue([
      { conditions: [{ field: 'description', operator: 'contains', value: 'known' }] },
    ]);
    prisma.transactionJournal.findMany.mockResolvedValue([
      { description: 'Metro grocery', category: { name: 'Groceries' } },
      { description: 'Metro market', category: { name: 'Groceries' } },
      { description: 'Metro foods', category: { name: 'Groceries' } },
      { description: 'Known shop', category: { name: 'Shopping' } },
      { description: 'Known store', category: { name: 'Shopping' } },
      { description: 'Known outlet', category: { name: 'Shopping' } },
    ]);

    const suggestions = await detectRuleSuggestions(prisma as any, 'household-1');

    expect(suggestions).toEqual([
      {
        pattern: 'description contains "metro"',
        value: 'metro',
        suggestedCategoryId: null,
        suggestedCategoryName: 'Groceries',
        matchCount: 3,
      },
    ]);
  });
});


