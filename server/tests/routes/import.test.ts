import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import importRouter from '../../src/routes/import';
import { prisma } from '../../src/lib/prisma';
import { makeRouteTestApp } from '../integration/integrationHarness';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    account: { findFirst: vi.fn(), update: vi.fn() },
    merchant: { findMany: vi.fn(), create: vi.fn() },
    categoryLearningExample: { findMany: vi.fn() },
    transactionJournal: { findMany: vi.fn() },
    transactionJournalMeta: { findMany: vi.fn(), create: vi.fn() },
    rule: { findMany: vi.fn() },
    category: { findMany: vi.fn() },
    ruleGroup: { findMany: vi.fn() },
    importHistory: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock('../../src/lib/checkpoint', () => ({
  createCheckpoint: vi.fn().mockResolvedValue({ id: 'chk-1' }),
}));

vi.mock('../../src/lib/legacyToJournalMigration', () => ({
  createJournalFromLegacyTransaction: vi.fn().mockResolvedValue({ journalId: 'j-1' }),
  getVirtualAccountsByType: vi.fn().mockResolvedValue({ expenseAccountId: null, revenueAccountId: null }),
}));

vi.mock('../../src/lib/metrics', () => ({
  transactionsImportedTotal: { inc: vi.fn() },
}));

vi.mock('../../src/lib/audit', () => ({
  logAudit: vi.fn(),
}));

function makeApp() {
  return makeRouteTestApp(importRouter, { householdId: 'hh-1', userId: 'u-1' });
}

describe('POST /confirm — merchant learning lookup', () => {
  beforeEach(async () => {
    vi.clearAllMocks();

    vi.mocked(prisma.account.findFirst).mockResolvedValue({
      id: 'acc-1',
      type: 'checking',
      householdId: 'hh-1',
    } as any);

    vi.mocked(prisma.account.update).mockResolvedValue({} as any);

    vi.mocked(prisma.merchant.findMany).mockResolvedValue([]);
    vi.mocked(prisma.merchant.create).mockResolvedValue({ id: 'm-1', name: 'Amazon', displayName: 'Amazon' } as any);

    // Existing dedup hashes (none)
    vi.mocked(prisma.transactionJournalMeta.findMany).mockResolvedValue([]);
    vi.mocked(prisma.transactionJournal.findMany).mockResolvedValue([]);

    // No rules (for suggestCategoriesForRows)
    vi.mocked(prisma.rule.findMany).mockResolvedValue([]);
    vi.mocked(prisma.category.findMany).mockResolvedValue([]);
    vi.mocked(prisma.ruleGroup.findMany).mockResolvedValue([]);

    // Learning example: "AMAZON.CA* B70MA7890" → category "cat-shopping"
    vi.mocked(prisma.categoryLearningExample.findMany).mockResolvedValue([
      {
        id: 'le-1',
        householdId: 'hh-1',
        descriptionPattern: 'AMAZON.CA* B70MA7890',
        correctCategoryId: 'cat-shopping',
      },
    ] as any);

    // Default implementation that passes through the transaction
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => fn(prisma));
    vi.mocked(prisma.transactionJournalMeta.create).mockResolvedValue({} as any);
    vi.mocked(prisma.importHistory.create).mockResolvedValue({ id: 'ih-1' } as any);

    // Default journal creation
    const { createJournalFromLegacyTransaction } = await import('../../src/lib/legacyToJournalMigration');
    vi.mocked(createJournalFromLegacyTransaction).mockResolvedValue({ journalId: 'j-1', type: 'withdrawal', meta: {} });
  });

  it('applies learning example category to uncategorized row with matching merchant', async () => {
    const { createJournalFromLegacyTransaction } = await import('../../src/lib/legacyToJournalMigration');
    let capturedCategoryId: string | null | undefined = undefined;

    vi.mocked(createJournalFromLegacyTransaction).mockImplementation(async (_tx, input) => {
      capturedCategoryId = input.categoryId ?? null;
      return { journalId: 'j-1', type: 'withdrawal', meta: {} };
    });

    await request(makeApp())
      .post('/confirm')
      .send({
        accountId: 'acc-1',
        filename: 'test.csv',
        rows: [
          {
            date: '2026-01-15',
            description: 'AMAZON.CA* XY9012345',
            amount: -49.99,
            hash: 'abc123',
            // categoryId intentionally omitted to test learning map lookup
          },
        ],
      });

    // Row had no categoryId and no rule match, but description normalizes to
    // same merchant as the stored learning example → should resolve to 'cat-shopping'
    expect(capturedCategoryId).toBe('cat-shopping');
  });

  it('does not apply learning example when user override is present', async () => {
    const { createJournalFromLegacyTransaction } = await import('../../src/lib/legacyToJournalMigration');
    let capturedCategoryId: string | null | undefined = undefined;

    vi.mocked(createJournalFromLegacyTransaction).mockImplementation(async (_tx, input) => {
      capturedCategoryId = input.categoryId ?? null;
      return { journalId: 'j-1', type: 'withdrawal', meta: {} };
    });

    await request(makeApp())
      .post('/confirm')
      .send({
        accountId: 'acc-1',
        filename: 'test.csv',
        rows: [
          {
            date: '2026-01-15',
            description: 'AMAZON.CA* XY9012345',
            amount: -49.99,
            hash: 'abc123',
            isDuplicate: false,
            categoryId: 'cat-groceries', // user override
          },
        ],
      });

    expect(capturedCategoryId).toBe('cat-groceries');
  });
});

