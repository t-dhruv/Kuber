import { describe, expect, it } from 'vitest';
import { detectColumnMapping } from './csvColumnDetector';

describe('detectColumnMapping', () => {
  it('maps exact transaction headers to standard fields', () => {
    const result = detectColumnMapping(['Date', 'Description', 'Amount', 'Balance']);

    expect(result.amountStrategy).toBe('single');
    expect(result.unmapped).toEqual([]);
    expect(result.mappings).toEqual(
      expect.arrayContaining([
        { field: 'date', csvHeader: 'Date', confidence: 1 },
        { field: 'description', csvHeader: 'Description', confidence: 1 },
        { field: 'amount', csvHeader: 'Amount', confidence: 1 },
        { field: 'balance', csvHeader: 'Balance', confidence: 1 },
      ]),
    );
  });

  it('detects debit-credit strategy when separate amount columns are present', () => {
    const result = detectColumnMapping(['Transaction Date', 'Merchant', 'Withdrawal', 'Deposit']);

    expect(result.amountStrategy).toBe('debit-credit');
    expect(result.mappings.map((mapping) => mapping.field)).toEqual(
      expect.arrayContaining(['date', 'description', 'debit', 'credit']),
    );
  });

  it('keeps a single amount strategy when amount exists alongside debit and credit', () => {
    const result = detectColumnMapping(['Date', 'Description', 'Amount', 'Debit', 'Credit']);

    expect(result.amountStrategy).toBe('single');
  });

  it('keeps the first mapping when duplicate standard fields have equal confidence', () => {
    const result = detectColumnMapping(['Trans Date', 'Date', 'Random Column']);

    expect(result.mappings).toContainEqual({ field: 'date', csvHeader: 'Trans Date', confidence: 1 });
    expect(result.mappings.filter((mapping) => mapping.field === 'date')).toHaveLength(1);
    expect(result.unmapped).toEqual(expect.arrayContaining(['Date', 'Random Column']));
  });

  it('uses fuzzy matching for minor header typos', () => {
    const result = detectColumnMapping(['Descriptin', 'Amunt']);

    expect(result.mappings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'description', csvHeader: 'Descriptin' }),
        expect.objectContaining({ field: 'amount', csvHeader: 'Amunt' }),
      ]),
    );
  });

  it('leaves unrelated low-confidence headers unmapped', () => {
    const result = detectColumnMapping(['Completely Unknown', 'Another Mystery']);

    expect(result.mappings).toEqual([]);
    expect(result.unmapped).toEqual(['Completely Unknown', 'Another Mystery']);
  });
});
