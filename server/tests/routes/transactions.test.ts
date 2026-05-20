import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import transactionsRouter from '../../src/routes/transactions';
import { prisma } from '../../src/lib/prisma';
import { makeRouteTestApp } from '../integration/integrationHarness';
import {
  formatJournalAsTransaction,
  queryJournalsWithRelations,
} from '../../src/lib/transactionJournalService';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    $transaction: vi.fn(),
    transactionJournal: {
      count: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
    },
    account: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    category: {
      findFirst: vi.fn(),
    },
    tag: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock('../../src/lib/audit', () => ({
  logAudit: vi.fn(),
}));

vi.mock('../../src/lib/webhookFire', () => ({
  fireWebhooks: vi.fn(() => Promise.resolve()),
}));

vi.mock('../../src/lib/ruleEngine', () => ({
  applyActiveRulesToJournal: vi.fn(),
  applyActiveRulesToTransaction: vi.fn(),
}));

vi.mock('../../src/lib/transactionJournalService', () => ({
  buildJournalInputFromLegacyTransaction: vi.fn(),
  buildRuleMatchInputFromJournal: vi.fn(() => ({ description: 'Coffee' })),
  createTransactionJournal: vi.fn(),
  createTransactionJournalInTransaction: vi.fn(),
  deleteLegacyTransactionJournal: vi.fn(),
  formatJournalAsTransaction: vi.fn((journal) => ({
    id: journal.id,
    description: journal.description,
    amount: Number(journal.amountDecimal),
  })),
  getTransactionJournalGroup: vi.fn(),
  listTransactionJournalGroups: vi.fn(),
  queryJournalsWithRelations: vi.fn(),
  syncLegacyTransactionJournal: vi.fn(),
}));

vi.mock('../../src/lib/legacyToJournalMigration', () => ({
  createJournalFromLegacyTransaction: vi.fn(),
  getVirtualAccountsByType: vi.fn(),
}));

vi.mock('../../src/lib/billMatcher', () => ({
  matchBillsForTransaction: vi.fn(),
}));

const journal = {
  id: 'journal-1',
  householdId: 'household-1',
  description: 'Coffee',
  amountDecimal: -4.25,
  date: new Date('2026-05-01T12:00:00.000Z'),
  categoryId: 'cat-1',
  notes: null,
  isDeleted: false,
  entries: [],
  tags: [],
};

function makeApp(householdId = 'household-1') {
  return makeRouteTestApp(transactionsRouter, { householdId, userId: 'user-1' });
}

describe('transactions route integration', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists active household journals with pagination metadata', async () => {
    vi.mocked(prisma.transactionJournal.findMany).mockResolvedValue([journal] as any);
    vi.mocked(prisma.transactionJournal.count).mockResolvedValue(1);

    const res = await request(makeApp()).get('/?limit=10&page=1&type=expense');

    expect(res.status).toBe(200);
    expect(prisma.transactionJournal.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        householdId: 'household-1',
        isDeleted: false,
        isHidden: false,
        amountDecimal: { lt: 0 },
      }),
      skip: 0,
      take: 10,
    }));
    expect(prisma.transactionJournal.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        householdId: 'household-1',
        isDeleted: false,
        isHidden: false,
        amountDecimal: { lt: 0 },
      }),
    });
    expect(formatJournalAsTransaction).toHaveBeenCalledWith(journal);
    expect(res.body).toMatchObject({
      transactions: [{ id: 'journal-1', description: 'Coffee', amount: -4.25 }],
      total: 1,
      page: 1,
      totalPages: 1,
    });
  });

  it('rejects invalid cursors before querying journals', async () => {
    const res = await request(makeApp()).get('/?cursor=not-base64-json');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Invalid cursor' });
    expect(queryJournalsWithRelations).not.toHaveBeenCalled();
  });

  it('rejects invalid create payloads before writing', async () => {
    const res = await request(makeApp())
      .post('/')
      .send({
        date: '2026-05-01',
        description: 'Coffee',
        amount: 0,
        accountId: 'account-1',
      });

    expect(res.status).toBe(400);
    expect(prisma.account.findFirst).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('validates create accounts against active household accounts', async () => {
    vi.mocked(prisma.account.findFirst).mockResolvedValue(null);

    const res = await request(makeApp())
      .post('/')
      .send({
        date: '2026-05-01',
        description: 'Coffee',
        amount: -4.25,
        accountId: 'account-other',
      });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Account not found' });
    expect(prisma.account.findFirst).toHaveBeenCalledWith({
      where: { id: 'account-other', householdId: 'household-1', isDeleted: false },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('validates update categories against active household categories', async () => {
    vi.mocked(prisma.transactionJournal.findFirst).mockResolvedValue({
      ...journal,
      entries: [{ accountId: 'account-1', amountDecimal: -4.25 }],
    } as any);
    vi.mocked(prisma.category.findFirst).mockResolvedValue(null);

    const res = await request(makeApp())
      .put('/journal-1')
      .send({ categoryId: 'cat-deleted' });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Category not found' });
    expect(prisma.category.findFirst).toHaveBeenCalledWith({
      where: { id: 'cat-deleted', householdId: 'household-1', isDeleted: false },
    });
    expect(prisma.transactionJournal.update).not.toHaveBeenCalled();
  });

  it('allows clearing nullable update fields from the transaction drawer', async () => {
    vi.mocked(prisma.transactionJournal.findFirst).mockResolvedValue({
      ...journal,
      entries: [{ accountId: 'account-1', amountDecimal: -4.25 }],
    } as any);
    vi.mocked(prisma.transactionJournal.update).mockResolvedValue({
      ...journal,
      categoryId: null,
      notes: null,
    } as any);

    const res = await request(makeApp())
      .put('/journal-1')
      .send({
        merchantName: 'Coffee',
        date: '2026-05-01T12:00:00.000Z',
        categoryId: null,
        notes: null,
        needsReview: false,
        isRecurring: false,
        isHidden: false,
      });

    expect(res.status).toBe(200);
    expect(prisma.category.findFirst).not.toHaveBeenCalled();
    expect(prisma.transactionJournal.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'journal-1' },
      data: expect.objectContaining({
        categoryId: null,
        notes: null,
      }),
    }));
  });

  it('soft-deletes household transactions', async () => {
    vi.mocked(prisma.transactionJournal.findFirst).mockResolvedValue(journal as any);
    vi.mocked(prisma.transactionJournal.update).mockResolvedValue({
      ...journal,
      isDeleted: true,
    } as any);

    const res = await request(makeApp()).delete('/journal-1');

    expect(res.status).toBe(200);
    expect(prisma.transactionJournal.findFirst).toHaveBeenCalledWith({
      where: { id: 'journal-1', householdId: 'household-1', isDeleted: false },
      select: { description: true, amountDecimal: true },
    });
    expect(prisma.transactionJournal.update).toHaveBeenCalledWith({
      where: { id: 'journal-1' },
      data: { isDeleted: true, updatedAt: expect.any(Date) },
    });
  });
});
