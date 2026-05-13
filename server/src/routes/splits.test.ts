import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma', () => ({
  prisma: {
    transaction: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    category: {
      findMany: vi.fn(),
    },
    transactionSplit: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
      findMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import {
  validateSplitAmounts,
  validateSplitCategories,
} from './splits';

describe('validateSplitAmounts', () => {
  it('passes when split amounts sum to parent amount', () => {
    expect(() =>
      validateSplitAmounts(100, [
        { amountDecimal: 60, categoryId: 'c1', notes: null },
        { amountDecimal: 40, categoryId: 'c2', notes: null },
      ])
    ).not.toThrow();
  });

  it('throws when split amounts do not sum to parent amount', () => {
    expect(() =>
      validateSplitAmounts(100, [
        { amountDecimal: 60, categoryId: 'c1', notes: null },
        { amountDecimal: 30, categoryId: 'c2', notes: null },
      ])
    ).toThrow('Split amounts must sum to 100.00 (got 90.00)');
  });

  it('throws when fewer than 2 splits provided', () => {
    expect(() =>
      validateSplitAmounts(100, [{ amountDecimal: 100, categoryId: 'c1', notes: null }])
    ).toThrow('At least 2 splits required');
  });

  it('uses integer-cent comparison to avoid floating-point drift', () => {
    expect(() =>
      validateSplitAmounts(100, [
        { amountDecimal: 33.33, categoryId: 'c1', notes: null },
        { amountDecimal: 33.33, categoryId: 'c2', notes: null },
        { amountDecimal: 33.34, categoryId: 'c3', notes: null },
      ])
    ).not.toThrow();
  });

  it('throws when any split amount is zero or negative', () => {
    expect(() =>
      validateSplitAmounts(100, [
        { amountDecimal: 0,   categoryId: 'c1', notes: null },
        { amountDecimal: 100, categoryId: 'c2', notes: null },
      ])
    ).toThrow('Split amounts must be greater than zero');
  });
});

describe('validateSplitCategories (unit)', () => {
  it('returns invalid categoryIds not in the valid set', () => {
    const result = validateSplitCategories(
      ['c1', 'c2', 'MISSING'],
      new Set(['c1', 'c2'])
    );
    expect(result).toBe('MISSING');
  });

  it('returns undefined when all categoryIds are valid', () => {
    const result = validateSplitCategories(
      ['c1', 'c2'],
      new Set(['c1', 'c2', 'c3'])
    );
    expect(result).toBeUndefined();
  });
});
