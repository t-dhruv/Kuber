import { describe, expect, it, vi } from 'vitest';
import { createJournalFromLegacyTransaction } from '../../src/lib/legacyToJournalMigration';

function makeTransactionClient() {
  return {
    account: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'expense-auto-1' }),
    },
    transactionGroup: {
      create: vi.fn().mockResolvedValue({ id: 'group-1' }),
    },
    transactionJournal: {
      create: vi.fn().mockResolvedValue({ id: 'journal-1' }),
    },
  };
}

describe('createJournalFromLegacyTransaction', () => {
  it('allows journal creation to auto-create missing virtual expense accounts', async () => {
    const tx = makeTransactionClient();

    const result = await createJournalFromLegacyTransaction(tx, {
      householdId: 'hh-1',
      accountId: 'checking-1',
      date: new Date('2026-05-01T00:00:00.000Z'),
      description: 'Bulk imported groceries',
      amount: -42.15,
    });

    expect(result).toEqual({
      journalId: 'journal-1',
      type: 'withdrawal',
      meta: {},
    });
    expect(tx.account.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        householdId: 'hh-1',
        name: 'Expenses:uncategorized',
        type: 'expense',
        isHidden: true,
      }),
      select: { id: true },
    });
    expect(tx.transactionJournal.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        householdId: 'hh-1',
        transactionType: 'withdrawal',
        entries: {
          create: [
            { accountId: 'checking-1', amountDecimal: -42.15, currencyCode: 'USD' },
            { accountId: 'expense-auto-1', amountDecimal: 42.15, currencyCode: 'USD' },
          ],
        },
      }),
    }));
  });
});

