import { describe, expect, it, vi } from 'vitest';
import {
  buildJournalInputFromLegacyTransaction,
  buildJournalEntries,
  backfillLegacyTransactionJournals,
  buildCashFlowEventFromJournal,
  createTransactionJournal,
  deleteLegacyTransactionJournal,
  formatTransactionJournalGroup,
  buildRuleMatchInputFromJournal,
  getTransactionJournalGroup,
  listTransactionJournalGroups,
  syncLegacyTransactionJournal,
  type CreateTransactionJournalInput,
} from './transactionJournalService';

function makePrismaMock() {
  const tx = {
    account: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    transaction: {
      findMany: vi.fn(),
    },
    transactionGroup: {
      create: vi.fn().mockResolvedValue({ id: 'group-1' }),
      update: vi.fn(),
      delete: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    transactionJournal: {
      create: vi.fn().mockResolvedValue({
        id: 'journal-1',
        groupId: 'group-1',
        entries: [],
      }),
      update: vi.fn().mockResolvedValue({
        id: 'journal-1',
        groupId: 'group-1',
        entries: [],
      }),
    },
    transactionJournalMeta: {
      findFirst: vi.fn(),
    },
    transactionEntry: {
      deleteMany: vi.fn(),
    },
    journalTag: {
      deleteMany: vi.fn(),
    },
  };

  const prisma = {
    transactionGroup: tx.transactionGroup,
    $transaction: vi.fn(async (fn: (txClient: typeof tx) => Promise<unknown>) => fn(tx)),
  };

  return { prisma, tx };
}

describe('buildJournalEntries', () => {
  it('builds a balanced withdrawal with an expense-side virtual account', () => {
    const entries = buildJournalEntries({
      householdId: 'hh-1',
      type: 'withdrawal',
      amount: 42.15,
      sourceAccountId: 'checking-1',
      description: 'Groceries',
      date: new Date('2026-05-01T00:00:00.000Z'),
      currencyCode: 'USD',
      virtualExpenseAccountId: 'expense-food',
    });

    expect(entries).toEqual([
      { accountId: 'checking-1', amountDecimal: -42.15, role: 'source' },
      { accountId: 'expense-food', amountDecimal: 42.15, role: 'destination' },
    ]);
    expect(entries.reduce((sum, entry) => sum + entry.amountDecimal, 0)).toBe(0);
  });

  it('builds a balanced deposit with a revenue-side virtual account', () => {
    const entries = buildJournalEntries({
      householdId: 'hh-1',
      type: 'deposit',
      amount: 1500,
      destinationAccountId: 'checking-1',
      description: 'Payroll',
      date: new Date('2026-05-01T00:00:00.000Z'),
      currencyCode: 'USD',
      virtualRevenueAccountId: 'revenue-payroll',
    });

    expect(entries).toEqual([
      { accountId: 'revenue-payroll', amountDecimal: -1500, role: 'source' },
      { accountId: 'checking-1', amountDecimal: 1500, role: 'destination' },
    ]);
  });

  it('builds a balanced transfer between real accounts', () => {
    const entries = buildJournalEntries({
      householdId: 'hh-1',
      type: 'transfer',
      amount: 250,
      sourceAccountId: 'checking-1',
      destinationAccountId: 'savings-1',
      description: 'Move to savings',
      date: new Date('2026-05-01T00:00:00.000Z'),
      currencyCode: 'USD',
    });

    expect(entries).toEqual([
      { accountId: 'checking-1', amountDecimal: -250, role: 'source' },
      { accountId: 'savings-1', amountDecimal: 250, role: 'destination' },
    ]);
  });

  it('rejects non-positive transaction amounts', () => {
    const input: CreateTransactionJournalInput = {
      householdId: 'hh-1',
      type: 'withdrawal',
      amount: 0,
      sourceAccountId: 'checking-1',
      description: 'Invalid',
      date: new Date('2026-05-01T00:00:00.000Z'),
      currencyCode: 'USD',
    };

    expect(() => buildJournalEntries(input)).toThrow('Transaction amount must be greater than zero');
  });
});

describe('buildJournalInputFromLegacyTransaction', () => {
  it('maps negative legacy transactions to withdrawals', () => {
    const input = buildJournalInputFromLegacyTransaction({
      id: 'tx-1',
      householdId: 'hh-1',
      accountId: 'checking-1',
      amount: -42.15,
      date: new Date('2026-05-01T00:00:00.000Z'),
      description: 'Groceries',
      currencyCode: 'USD',
      categoryId: 'cat-food',
      notes: 'weekly',
      isPending: false,
      isCleared: true,
      tags: [{ tagId: 'tag-food' }],
    });

    expect(input).toEqual({
      householdId: 'hh-1',
      type: 'withdrawal',
      amount: 42.15,
      sourceAccountId: 'checking-1',
      categoryId: 'cat-food',
      description: 'Groceries',
      date: new Date('2026-05-01T00:00:00.000Z'),
      currencyCode: 'USD',
      notes: 'weekly',
      isPending: false,
      isReconciled: true,
      tags: ['tag-food'],
      groupTitle: 'Groceries',
      meta: { legacyTransactionId: 'tx-1' },
    });
  });

  it('maps positive legacy transactions to deposits', () => {
    const input = buildJournalInputFromLegacyTransaction({
      id: 'tx-2',
      householdId: 'hh-1',
      accountId: 'checking-1',
      amount: 1500,
      date: new Date('2026-05-01T00:00:00.000Z'),
      description: 'Payroll',
      currencyCode: 'USD',
      categoryId: null,
      notes: null,
      isPending: false,
      isCleared: false,
      tags: [],
    });

    expect(input.type).toBe('deposit');
    expect(input.amount).toBe(1500);
    expect(input.destinationAccountId).toBe('checking-1');
    expect(input.sourceAccountId).toBeUndefined();
  });
});

describe('formatTransactionJournalGroup', () => {
  it('formats a Firefly-style transaction group for API responses', () => {
    const group = formatTransactionJournalGroup({
      id: 'group-1',
      householdId: 'hh-1',
      title: 'Transfer',
      createdAt: new Date('2026-05-01T10:00:00.000Z'),
      updatedAt: new Date('2026-05-01T10:05:00.000Z'),
      journals: [
        {
          id: 'journal-1',
          transactionType: 'transfer',
          date: new Date('2026-05-01T00:00:00.000Z'),
          description: 'Move to savings',
          amountDecimal: 250,
          currencyCode: 'USD',
          categoryId: null,
          notes: 'monthly',
          isPending: false,
          isReconciled: true,
          reconciledAt: new Date('2026-05-01T01:00:00.000Z'),
          order: 0,
          category: null,
          entries: [
            { id: 'entry-1', accountId: 'checking-1', amountDecimal: -250, currencyCode: 'USD', account: { id: 'checking-1', name: 'Checking', type: 'asset' } },
            { id: 'entry-2', accountId: 'savings-1', amountDecimal: 250, currencyCode: 'USD', account: { id: 'savings-1', name: 'Savings', type: 'asset' } },
          ],
          tags: [{ tag: { id: 'tag-1', name: 'Move', color: '#123456' } }],
          meta: [{ name: 'legacyTransferId', value: 'transfer-1' }],
        },
      ],
    });

    expect(group).toEqual({
      id: 'group-1',
      householdId: 'hh-1',
      title: 'Transfer',
      createdAt: '2026-05-01T10:00:00.000Z',
      updatedAt: '2026-05-01T10:05:00.000Z',
      journals: [{
        id: 'journal-1',
        transactionType: 'transfer',
        date: '2026-05-01T00:00:00.000Z',
        description: 'Move to savings',
        amount: 250,
        currencyCode: 'USD',
        categoryId: null,
        categoryName: null,
        notes: 'monthly',
        isPending: false,
        isReconciled: true,
        reconciledAt: '2026-05-01T01:00:00.000Z',
        order: 0,
        entries: [
          { id: 'entry-1', accountId: 'checking-1', accountName: 'Checking', accountType: 'asset', amount: -250, currencyCode: 'USD' },
          { id: 'entry-2', accountId: 'savings-1', accountName: 'Savings', accountType: 'asset', amount: 250, currencyCode: 'USD' },
        ],
        tags: [{ id: 'tag-1', name: 'Move', color: '#123456' }],
        meta: { legacyTransferId: 'transfer-1' },
        entryBalance: 0,
      }],
    });
  });
});

describe('journal adapters', () => {
  it('builds legacy-compatible rule input from a withdrawal journal', () => {
    const input = buildRuleMatchInputFromJournal({
      transactionType: 'withdrawal',
      description: 'Coffee',
      amountDecimal: 6.5,
      categoryId: 'cat-food',
      notes: 'morning',
      entries: [{ accountId: 'checking-1', amountDecimal: -6.5 }],
    });

    expect(input).toEqual({
      merchantName: 'Coffee',
      description: 'Coffee',
      amount: -6.5,
      categoryId: 'cat-food',
      accountId: 'checking-1',
      notes: 'morning',
    });
  });

  it('builds reporting cash flow events from journal type', () => {
    expect(buildCashFlowEventFromJournal({
      transactionType: 'deposit',
      amountDecimal: 200,
    })).toEqual({ amount: 200, type: 'income', isTransfer: false });

    expect(buildCashFlowEventFromJournal({
      transactionType: 'withdrawal',
      amountDecimal: 50,
    })).toEqual({ amount: -50, type: 'expense', isTransfer: false });

    expect(buildCashFlowEventFromJournal({
      transactionType: 'transfer',
      amountDecimal: 75,
    })).toEqual({ amount: -75, type: 'transfer', isTransfer: true });
  });
});

describe('createTransactionJournal', () => {
  it('creates a group, journal, and balanced withdrawal entries', async () => {
    const { prisma, tx } = makePrismaMock();
    tx.account.findFirst.mockResolvedValue({ id: 'expense-food' });

    await createTransactionJournal({
      householdId: 'hh-1',
      type: 'withdrawal',
      amount: 42.15,
      sourceAccountId: 'checking-1',
      categoryId: 'cat-food',
      description: 'Groceries',
      date: new Date('2026-05-01T00:00:00.000Z'),
      currencyCode: 'USD',
    }, prisma as any);

    expect(tx.transactionGroup.create).toHaveBeenCalledWith({
      data: { householdId: 'hh-1', title: 'Groceries' },
      select: { id: true },
    });
    expect(tx.transactionJournal.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        householdId: 'hh-1',
        groupId: 'group-1',
        transactionType: 'withdrawal',
        description: 'Groceries',
        amountDecimal: 42.15,
        entries: {
          create: [
            { accountId: 'checking-1', amountDecimal: -42.15, currencyCode: 'USD' },
            { accountId: 'expense-food', amountDecimal: 42.15, currencyCode: 'USD' },
          ],
        },
      }),
      include: {
        entries: true,
        group: true,
        tags: { include: { tag: true } },
        meta: true,
      },
    });
  });
});

describe('syncLegacyTransactionJournal', () => {
  it('updates the existing journal linked by legacyTransactionId', async () => {
    const { prisma, tx } = makePrismaMock();
    tx.transactionJournalMeta.findFirst.mockResolvedValue({
      journalId: 'journal-1',
      journal: { id: 'journal-1', groupId: 'group-1' },
    });
    tx.account.findFirst.mockResolvedValue({ id: 'expense-food' });

    await syncLegacyTransactionJournal({
      id: 'tx-1',
      householdId: 'hh-1',
      accountId: 'checking-1',
      amount: -55,
      date: new Date('2026-05-02T00:00:00.000Z'),
      description: 'Updated groceries',
      currencyCode: 'USD',
      categoryId: 'cat-food',
      notes: null,
      isPending: true,
      isCleared: false,
      tags: [{ tagId: 'tag-food' }],
    }, prisma as any);

    expect(tx.transactionGroup.update).toHaveBeenCalledWith({
      where: { id: 'group-1' },
      data: { title: 'Updated groceries' },
    });
    expect(tx.transactionEntry.deleteMany).toHaveBeenCalledWith({ where: { journalId: 'journal-1' } });
    expect(tx.journalTag.deleteMany).toHaveBeenCalledWith({ where: { journalId: 'journal-1' } });
    expect(tx.transactionJournal.update).toHaveBeenCalledWith({
      where: { id: 'journal-1' },
      data: expect.objectContaining({
        transactionType: 'withdrawal',
        description: 'Updated groceries',
        amountDecimal: 55,
        isPending: true,
        entries: {
          create: [
            { accountId: 'checking-1', amountDecimal: -55, currencyCode: 'USD' },
            { accountId: 'expense-food', amountDecimal: 55, currencyCode: 'USD' },
          ],
        },
        tags: { create: [{ tagId: 'tag-food' }] },
      }),
      include: {
        entries: true,
        group: true,
        tags: { include: { tag: true } },
        meta: true,
      },
    });
  });

  it('creates a journal when the legacy transaction does not have one yet', async () => {
    const { prisma, tx } = makePrismaMock();
    tx.transactionJournalMeta.findFirst.mockResolvedValue(null);
    tx.account.findFirst.mockResolvedValue({ id: 'revenue-payroll' });

    await syncLegacyTransactionJournal({
      id: 'tx-2',
      householdId: 'hh-1',
      accountId: 'checking-1',
      amount: 1500,
      date: new Date('2026-05-02T00:00:00.000Z'),
      description: 'Payroll',
      currencyCode: 'USD',
      categoryId: null,
      notes: null,
      isPending: false,
      isCleared: false,
      tags: [],
    }, prisma as any);

    expect(tx.transactionGroup.create).toHaveBeenCalled();
    expect(tx.transactionJournal.create).toHaveBeenCalled();
  });
});

describe('deleteLegacyTransactionJournal', () => {
  it('deletes the journal group linked by legacyTransactionId', async () => {
    const { prisma, tx } = makePrismaMock();
    tx.transactionJournalMeta.findFirst.mockResolvedValue({
      journal: { id: 'journal-1', groupId: 'group-1' },
    });

    await expect(deleteLegacyTransactionJournal('tx-1', prisma as any)).resolves.toBe(true);

    expect(tx.transactionJournal.update).toHaveBeenCalledWith({
      where: { id: 'journal-1' },
      data: { isDeleted: true, updatedAt: expect.any(Date) },
    });
  });
});

describe('backfillLegacyTransactionJournals', () => {
  it('is a no-op after the legacy transaction model has been removed', async () => {
    const { prisma, tx } = makePrismaMock();

    await expect(backfillLegacyTransactionJournals({ householdId: 'hh-1', limit: 50 }, prisma as any))
      .resolves.toEqual({ scanned: 0, created: 0, skipped: 0 });

    expect(tx.transaction.findMany).not.toHaveBeenCalled();
    expect(tx.transactionJournal.create).not.toHaveBeenCalled();
  });
});

describe('journal group reads', () => {
  it('lists journal groups with stable pagination', async () => {
    const { prisma, tx } = makePrismaMock();
    tx.transactionGroup.findMany.mockResolvedValue([
      { id: 'group-1', householdId: 'hh-1', title: 'A', createdAt: new Date(), updatedAt: new Date(), journals: [] },
      { id: 'group-2', householdId: 'hh-1', title: 'B', createdAt: new Date(), updatedAt: new Date(), journals: [] },
    ]);

    const result = await listTransactionJournalGroups({ householdId: 'hh-1', limit: 1 }, prisma as any);

    expect(tx.transactionGroup.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { householdId: 'hh-1' },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 2,
    }));
    expect(result.items).toHaveLength(1);
    expect(result.nextCursor).toBe('group-2');
  });

  it('gets one journal group by household and id', async () => {
    const { prisma, tx } = makePrismaMock();
    tx.transactionGroup.findFirst.mockResolvedValue({
      id: 'group-1',
      householdId: 'hh-1',
      title: 'A',
      createdAt: new Date(),
      updatedAt: new Date(),
      journals: [],
    });

    const result = await getTransactionJournalGroup({ householdId: 'hh-1', id: 'group-1' }, prisma as any);

    expect(tx.transactionGroup.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'group-1', householdId: 'hh-1' },
    }));
    expect(result?.id).toBe('group-1');
  });
});
