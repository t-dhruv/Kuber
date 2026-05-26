import { describe, expect, it } from 'vitest';
import { buildTransactionJournalWhere } from '../../src/services/transactionService';

describe('buildTransactionJournalWhere', () => {
  it('keeps search filters when cursor pagination adds cursor conditions', () => {
    const cursorDate = new Date('2026-01-15T00:00:00.000Z');
    const where = buildTransactionJournalWhere({
      householdId: 'household-1',
      search: 'costco',
      cursor: { date: cursorDate, id: 'txn-10' },
      sortOrder: 'desc',
    });

    expect(where.AND).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          OR: expect.arrayContaining([
            { description: { contains: 'costco', mode: 'insensitive' } },
            { notes: { contains: 'costco', mode: 'insensitive' } },
          ]),
        }),
        {
          OR: [
            { date: { lt: cursorDate } },
            { date: cursorDate, id: { lt: 'txn-10' } },
          ],
        },
      ]),
    );
  });

  it('supports multiple categories and uncategorized filtering', () => {
    expect(
      buildTransactionJournalWhere({
        householdId: 'household-1',
        categoryIds: ['cat-1', 'cat-2'],
      }).categoryId,
    ).toEqual({ in: ['cat-1', 'cat-2'] });

    expect(
      buildTransactionJournalWhere({
        householdId: 'household-1',
        uncategorized: 'true',
        categoryIds: ['cat-1'],
      }).categoryId,
    ).toBeNull();
  });
});
