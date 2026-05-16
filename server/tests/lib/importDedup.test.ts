import { describe, expect, it } from 'vitest';
import { computeDedupHash, markDuplicates, normalizeDescription } from './importDedup';

describe('normalizeDescription', () => {
  it('lowercases descriptions and collapses repeated whitespace', () => {
    expect(normalizeDescription('  COFFEE   SHOP  ')).toBe('coffee shop');
  });

  it('strips common trailing reference markers', () => {
    expect(normalizeDescription('Grocery Store REF ABC-123')).toBe('grocery store');
    expect(normalizeDescription('Payroll #98765')).toBe('payroll');
    expect(normalizeDescription('Transfer ID tx-42')).toBe('transfer');
  });
});

describe('computeDedupHash', () => {
  it('uses normalized description and absolute amount for stable hashes', () => {
    const first = computeDedupHash('2026-01-05', 'Coffee   Shop REF 123', -4.5);
    const second = computeDedupHash(' 2026-01-05 ', 'coffee shop', 4.5);

    expect(first).toBe(second);
  });

  it('changes the hash when the transaction identity changes', () => {
    const original = computeDedupHash('2026-01-05', 'Coffee Shop', 4.5);
    const differentDate = computeDedupHash('2026-01-06', 'Coffee Shop', 4.5);
    const differentDescription = computeDedupHash('2026-01-05', 'Book Shop', 4.5);
    const differentAmount = computeDedupHash('2026-01-05', 'Coffee Shop', 5.5);

    expect(differentDate).not.toBe(original);
    expect(differentDescription).not.toBe(original);
    expect(differentAmount).not.toBe(original);
  });
});

describe('markDuplicates', () => {
  it('marks rows that already exist in storage as duplicates', () => {
    const rows = [{ hash: 'existing', description: 'Coffee' }];

    expect(markDuplicates(rows, new Set(['existing']))).toEqual([
      { hash: 'existing', description: 'Coffee', isDuplicate: true },
    ]);
  });

  it('marks later rows in the same batch as duplicates', () => {
    const rows = [
      { hash: 'new', row: 1 },
      { hash: 'new', row: 2 },
      { hash: 'other', row: 3 },
    ];

    expect(markDuplicates(rows, new Set())).toEqual([
      { hash: 'new', row: 1, isDuplicate: false },
      { hash: 'new', row: 2, isDuplicate: true },
      { hash: 'other', row: 3, isDuplicate: false },
    ]);
  });
});
