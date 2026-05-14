import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import {
  buildSplitCreateManyData,
  getTransactionSplitDetails,
  mapDbSplitsToLegacyDetails,
  normalizeLegacySplitDetails,
} from './transactionSplits';

describe('transactionSplits', () => {
  it('builds createMany payloads with decimal amounts and normalized notes', () => {
    const rows = buildSplitCreateManyData([
      { categoryId: 'cat-food', amount: 12.3456, note: ' Lunch ' },
      { categoryId: 'cat-tip', amount: 3.1 },
    ]);

    expect(rows).toEqual([
      {
        amountDecimal: new Prisma.Decimal('12.3456'),
        categoryId: 'cat-food',
        notes: 'Lunch',
      },
      {
        amountDecimal: new Prisma.Decimal('3.1'),
        categoryId: 'cat-tip',
        notes: null,
      },
    ]);
  });

  it('maps normalized database splits into the legacy API shape used by the UI', () => {
    const mapped = mapDbSplitsToLegacyDetails([
      {
        id: 'split-1',
        categoryId: 'cat-food',
        amountDecimal: new Prisma.Decimal('12.3400'),
        notes: 'Lunch',
        category: { id: 'cat-food', name: 'Food' },
      },
    ]);

    expect(mapped).toEqual([
      {
        id: 'split-1',
        categoryId: 'cat-food',
        categoryName: 'Food',
        amount: 12.34,
        note: 'Lunch',
        notes: 'Lunch',
      },
    ]);
  });

  it('normalizes legacy splitDetails payloads that use note or notes', () => {
    expect(
      normalizeLegacySplitDetails([
        { id: 'legacy-a', categoryId: 'cat-a', categoryName: 'A', amount: 10, note: 'one' },
        { id: 'legacy-b', categoryId: 'cat-b', categoryName: 'B', amount: 5.129, notes: 'two' },
      ]),
    ).toEqual([
      {
        id: 'legacy-a',
        categoryId: 'cat-a',
        categoryName: 'A',
        amount: 10,
        note: 'one',
        notes: 'one',
      },
      {
        id: 'legacy-b',
        categoryId: 'cat-b',
        categoryName: 'B',
        amount: 5.13,
        note: 'two',
        notes: 'two',
      },
    ]);
  });

  it('prefers normalized transaction_splits rows over legacy splitDetails when both exist', () => {
    const result = getTransactionSplitDetails({
      splits: [
        {
          id: 'split-db',
          categoryId: 'cat-db',
          amountDecimal: new Prisma.Decimal('7.5000'),
          notes: 'db',
          category: { id: 'cat-db', name: 'Database' },
        },
      ],
      splitDetails: [{ id: 'legacy', categoryId: 'cat-old', amount: 99 }],
    });

    expect(result).toEqual([
      {
        id: 'split-db',
        categoryId: 'cat-db',
        categoryName: 'Database',
        amount: 7.5,
        note: 'db',
        notes: 'db',
      },
    ]);
  });
});
