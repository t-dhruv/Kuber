import { describe, expect, it } from 'vitest';
import { detectLocaleFormat, mergeDebitCredit, parseAmount } from '../../src/lib/amountParser';

describe('detectLocaleFormat', () => {
  it('detects US thousands and decimal separators', () => {
    expect(detectLocaleFormat(['1,234.56', '22.10'])).toBe('us');
  });

  it('detects EU thousands and decimal separators', () => {
    expect(detectLocaleFormat(['1.234,56', '2.345.678,90'])).toBe('eu');
  });

  it('treats comma-only cents as EU decimal format', () => {
    expect(detectLocaleFormat(['1234,56', '42,10'])).toBe('eu');
  });
});

describe('parseAmount', () => {
  it('parses currency symbols and US thousands separators', () => {
    expect(parseAmount('$1,234.56')).toBe(1234.56);
  });

  it('parses EU formatted amounts', () => {
    expect(parseAmount('1.234,56', 'eu')).toBe(1234.56);
  });

  it('treats accounting parentheses and DR markers as negative', () => {
    expect(parseAmount('(123.45)')).toBe(-123.45);
    expect(parseAmount('123.45 DR')).toBe(-123.45);
  });

  it('treats CR markers and plus signs as positive', () => {
    expect(parseAmount('-123.45 CR')).toBe(123.45);
    expect(parseAmount('+123.45')).toBe(123.45);
  });

  it('returns null for blank or non-numeric values', () => {
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('not money')).toBeNull();
  });
});

describe('mergeDebitCredit', () => {
  it('returns negative debit values before credits', () => {
    expect(mergeDebitCredit('12.34', '99.99')).toBe(-12.34);
  });

  it('returns positive credit when debit is empty', () => {
    expect(mergeDebitCredit('', '12.34')).toBe(12.34);
  });

  it('returns null when both columns are empty or zero', () => {
    expect(mergeDebitCredit('', '')).toBeNull();
    expect(mergeDebitCredit('0.00', '0.00')).toBeNull();
  });
});

