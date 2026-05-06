import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from './prisma';
import { runRuleExecutionJob } from './ruleExecutionJob';

vi.mock('./prisma', () => ({
  prisma: {
    transactionJournal: {
      findMany: vi.fn(),
    },
    ruleGroup: {
      findMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

describe('runRuleExecutionJob', () => {
  beforeEach(() => vi.clearAllMocks());

  it('processes recent transaction journals instead of legacy flat transactions', async () => {
    vi.mocked(prisma.transactionJournal.findMany).mockResolvedValue([
      {
        id: 'journal-1',
        householdId: 'hh-1',
        transactionType: 'withdrawal',
        description: 'Morning coffee',
        amountDecimal: 5,
        categoryId: null,
        notes: null,
        entries: [{ accountId: 'checking-1', amountDecimal: -5 }],
      },
    ] as any);
    vi.mocked(prisma.ruleGroup.findMany).mockResolvedValue([
      {
        id: 'group-1',
        stopProcessing: false,
        rules: [
          {
            id: 'rule-1',
            strict: true,
            stopProcessing: false,
            conditions: [],
            actions: [],
            triggers: [{ field: 'description', operator: 'contains', value: 'coffee', sortOrder: 1 }],
            ruleActions: [{ type: 'setNotes', value: 'auto', sortOrder: 1, stopProcessing: false }],
          },
        ],
      },
    ] as any);
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => fn({
      transactionJournal: { updateMany: vi.fn() },
      transactionEntry: { updateMany: vi.fn() },
      journalTag: { upsert: vi.fn(), deleteMany: vi.fn() },
      ruleExecutionLog: { create: vi.fn() },
    }));

    await expect(runRuleExecutionJob()).resolves.toEqual({ processed: 1, matched: 1 });

    expect(prisma.transactionJournal.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { createdAt: { gte: expect.any(Date) } },
      include: expect.objectContaining({ entries: true }),
    }));
  });
});
