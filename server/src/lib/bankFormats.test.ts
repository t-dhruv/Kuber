import { describe, expect, it } from 'vitest';
import { BANK_FORMATS, detectBankFormat, mapRowToTransaction } from './bankFormats';

describe('detectBankFormat', () => {
  it('detects a TD Canada debit-credit export', () => {
    const detected = detectBankFormat(['Date', 'Description', 'Debit', 'Credit', 'Balance']);

    expect(detected.format.id).toBe('td-canada');
    expect(detected.confidence).toBeGreaterThanOrEqual(0.6);
  });

  it('detects a Chase single-amount export with optional fields', () => {
    const detected = detectBankFormat(['Transaction Date', 'Description', 'Amount', 'Category', 'Memo']);

    expect(detected.format.id).toBe('chase-us');
    expect(detected.confidence).toBe(1);
  });

  it('falls back to generic when required fields are incomplete', () => {
    const detected = detectBankFormat(['Date', 'Description']);

    expect(detected.format.id).toBe('generic');
    expect(detected.confidence).toBeLessThan(0.6);
  });

  it('does not classify a plain generic CSV as a branded card format', () => {
    const detected = detectBankFormat(['Date', 'Description', 'Amount']);

    expect(detected.format.id).toBe('generic');
  });
});

describe('mapRowToTransaction', () => {
  it('maps single-amount rows using negative debit sign convention', () => {
    const format = BANK_FORMATS.find((item) => item.id === 'chase-us');

    expect(format).toBeDefined();
    expect(
      mapRowToTransaction(
        {
          'Transaction Date': '2026-01-05',
          Description: 'Coffee Shop',
          Amount: '-4.50',
          Category: 'Food',
          Memo: 'abc-123',
        },
        format!,
      ),
    ).toEqual({
      date: '2026-01-05',
      description: 'Coffee Shop',
      amount: -4.5,
      reference: 'abc-123',
    });
  });

  it('maps debit-credit rows and makes debit transactions negative', () => {
    const format = BANK_FORMATS.find((item) => item.id === 'td-canada');

    expect(format).toBeDefined();
    expect(
      mapRowToTransaction(
        {
          Date: '2026-01-05',
          Description: 'Rent',
          Debit: '1,250.00',
          Credit: '',
          Balance: '2,000.00',
        },
        format!,
      ),
    ).toEqual({
      date: '2026-01-05',
      description: 'Rent',
      amount: -1250,
      reference: undefined,
    });
  });

  it('maps debit-credit rows with positive credits', () => {
    const format = BANK_FORMATS.find((item) => item.id === 'td-canada');

    expect(format).toBeDefined();
    expect(
      mapRowToTransaction(
        {
          Date: '2026-01-05',
          Description: 'Payroll',
          Debit: '',
          Credit: '$2,500.25',
        },
        format!,
      ),
    ).toEqual({
      date: '2026-01-05',
      description: 'Payroll',
      amount: 2500.25,
      reference: undefined,
    });
  });

  it('concatenates multi-column descriptions in mapping order', () => {
    const format = BANK_FORMATS.find((item) => item.id === 'rbc-canada');

    expect(format).toBeDefined();
    expect(
      mapRowToTransaction(
        {
          'Transaction Date': '2026-01-05',
          'Description 1': 'Point of Sale',
          'Description 2': 'Coffee Shop',
          'CAD$': '4.50',
        },
        format!,
      ),
    ).toEqual({
      date: '2026-01-05',
      description: 'Point of Sale Coffee Shop',
      amount: -4.5,
      reference: undefined,
    });
  });

  it('returns null when required fields or amounts are missing', () => {
    const format = BANK_FORMATS.find((item) => item.id === 'chase-us');

    expect(format).toBeDefined();
    expect(mapRowToTransaction({ Description: 'Coffee Shop', Amount: '-4.50' }, format!)).toBeNull();
    expect(mapRowToTransaction({ 'Transaction Date': '2026-01-05', Amount: '-4.50' }, format!)).toBeNull();
    expect(
      mapRowToTransaction(
        { 'Transaction Date': '2026-01-05', Description: 'Coffee Shop', Amount: 'not money' },
        format!,
      ),
    ).toBeNull();
  });
});
