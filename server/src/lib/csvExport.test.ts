import { describe, it, expect, vi, beforeEach } from 'vitest';
import { toCSV, setCsvHeaders, CsvColumn } from './csvExport';

// ─── toCSV ────────────────────────────────────────────────────────────────────

describe('toCSV', () => {
  const columns: CsvColumn[] = [
    { key: 'name', header: 'Name' },
    { key: 'amount', header: 'Amount' },
    { key: 'date', header: 'Date' },
  ];

  it('returns only the header row when rows array is empty', () => {
    const result = toCSV([], columns);
    expect(result).toBe('Name,Amount,Date');
  });

  it('renders a single row with all fields correctly', () => {
    const rows = [{ name: 'Alice', amount: 42, date: '2024-01-15' }];
    const result = toCSV(rows, columns);
    expect(result).toBe('Name,Amount,Date\r\nAlice,42,2024-01-15');
  });

  it('wraps a field containing a comma in double quotes', () => {
    const rows = [{ name: 'Smith, John', amount: 0, date: '' }];
    const result = toCSV(rows, columns);
    const dataLine = result.split('\r\n')[1];
    expect(dataLine).toMatch(/^"Smith, John"/);
  });

  it('escapes internal double quotes by doubling them', () => {
    const rows = [{ name: 'He said "hello"', amount: 0, date: '' }];
    const result = toCSV(rows, columns);
    const dataLine = result.split('\r\n')[1];
    expect(dataLine).toMatch(/^"He said ""hello"""/);
  });

  it('wraps a field containing a newline in double quotes', () => {
    const rows = [{ name: 'line1\nline2', amount: 0, date: '' }];
    const result = toCSV(rows, columns);
    const dataLine = result.split('\r\n')[1];
    expect(dataLine).toMatch(/^"line1\nline2"/);
  });

  it('wraps a field containing a carriage return in double quotes', () => {
    const rows = [{ name: 'line1\rline2', amount: 0, date: '' }];
    const result = toCSV(rows, columns);
    const dataLine = result.split('\r\n')[1];
    expect(dataLine).toMatch(/^"line1\rline2"/);
  });

  it('renders null values as empty strings', () => {
    const rows = [{ name: null, amount: null, date: null }];
    const result = toCSV(rows, columns);
    expect(result).toBe('Name,Amount,Date\r\n,,');
  });

  it('renders undefined values as empty strings', () => {
    const rows = [{ name: undefined, amount: undefined, date: undefined }];
    const result = toCSV(rows, columns);
    expect(result).toBe('Name,Amount,Date\r\n,,');
  });

  it('renders numbers and date objects as strings without quoting', () => {
    const date = new Date('2024-06-01T00:00:00.000Z');
    const rows = [{ name: 'Bob', amount: 99.5, date }];
    const result = toCSV(rows, columns);
    const dataLine = result.split('\r\n')[1];
    // Number should appear as-is
    expect(dataLine).toContain('99.5');
    // Date.toString() output should appear (no wrapping quotes unless it contains special chars)
    expect(dataLine).toContain('Bob');
  });

  it('uses \\r\\n line endings between all rows (RFC 4180)', () => {
    const rows = [
      { name: 'A', amount: 1, date: '2024-01-01' },
      { name: 'B', amount: 2, date: '2024-01-02' },
    ];
    const result = toCSV(rows, columns);
    const lines = result.split('\r\n');
    expect(lines).toHaveLength(3);
  });

  it('handles multiple rows correctly', () => {
    const rows = [
      { name: 'Alice', amount: 10, date: '2024-01-01' },
      { name: 'Bob', amount: 20, date: '2024-01-02' },
    ];
    const result = toCSV(rows, columns);
    expect(result).toBe(
      'Name,Amount,Date\r\nAlice,10,2024-01-01\r\nBob,20,2024-01-02',
    );
  });

  it('quotes a header that contains a comma', () => {
    const specialColumns: CsvColumn[] = [{ key: 'v', header: 'A,B' }];
    const result = toCSV([], specialColumns);
    expect(result).toBe('"A,B"');
  });
});

// ─── setCsvHeaders ────────────────────────────────────────────────────────────

describe('setCsvHeaders', () => {
  function makeMockRes() {
    const headers: Record<string, string> = {};
    return {
      setHeader: vi.fn((name: string, value: string) => {
        headers[name] = value;
      }),
      _headers: headers,
    } as unknown as import('express').Response & { _headers: Record<string, string> };
  }

  it('sets Content-Type to text/csv with utf-8 charset', () => {
    const res = makeMockRes();
    setCsvHeaders(res, 'export.csv');
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'text/csv; charset=utf-8',
    );
  });

  it('sets Content-Disposition as attachment with the provided filename', () => {
    const res = makeMockRes();
    setCsvHeaders(res, 'transactions.csv');
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'attachment; filename="transactions.csv"',
    );
  });

  it('sets Cache-Control to no-store', () => {
    const res = makeMockRes();
    setCsvHeaders(res, 'report.csv');
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
  });

  it('uses the exact filename provided, including spaces', () => {
    const res = makeMockRes();
    setCsvHeaders(res, 'my report 2024.csv');
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'attachment; filename="my report 2024.csv"',
    );
  });
});
