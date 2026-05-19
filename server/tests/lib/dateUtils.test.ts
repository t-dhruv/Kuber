import { describe, expect, it, vi } from 'vitest';
import { detectDateFormat, parseDate } from '../../src/lib/dateUtils';

describe('parseDate', () => {
  it('keeps ISO dates and strips ISO timestamps to YYYY-MM-DD', () => {
    expect(parseDate('2026-01-15')).toBe('2026-01-15');
    expect(parseDate('2026-01-15T12:34:56.000Z')).toBe('2026-01-15');
  });

  it('parses common numeric bank date formats', () => {
    expect(parseDate('1/5/2026')).toBe('2026-01-05');
    expect(parseDate('01/05/26')).toBe('2026-01-05');
    expect(parseDate('1-5-2026')).toBe('2026-01-05');
  });

  it('parses month-name date formats', () => {
    expect(parseDate('Jan 5 2026')).toBe('2026-01-05');
    expect(parseDate('5-Jan-2026')).toBe('2026-01-05');
  });

  it('uses the current year for month-name dates without a year', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-14T12:00:00.000Z'));

    expect(parseDate('Jan 5')).toBe('2026-01-05');

    vi.useRealTimers();
  });

  it('returns null for blank, unknown, or impossible calendar dates', () => {
    expect(parseDate('')).toBeNull();
    expect(parseDate('not a date')).toBeNull();
    expect(parseDate('2026-02-31')).toBeNull();
  });
});

describe('detectDateFormat', () => {
  it('detects and parses YYYY-MM-DD samples', () => {
    const format = detectDateFormat(['2026-01-05', '2026-12-31']);

    expect(format?.label).toBe('YYYY-MM-DD');
    expect(format?.parse('2026-03-09')).toBe('2026-03-09');
  });

  it('prefers MM/DD/YYYY for ambiguous slash samples', () => {
    const format = detectDateFormat(['01/05/2026', '02/06/2026']);

    expect(format?.label).toBe('MM/DD/YYYY');
    expect(format?.parse('03/09/2026')).toBe('2026-03-09');
  });

  it('detects DD/MM/YYYY only when the day is unambiguous', () => {
    const format = detectDateFormat(['13/01/2026', '14/02/2026']);

    expect(format?.label).toBe('DD/MM/YYYY');
    expect(format?.parse('15/03/2026')).toBe('2026-03-15');
  });

  it('rejects invalid sample dates', () => {
    expect(detectDateFormat(['2026-02-31'])).toBeNull();
  });

  it('returns null when no non-empty samples are provided', () => {
    expect(detectDateFormat(['', '   '])).toBeNull();
  });
});

