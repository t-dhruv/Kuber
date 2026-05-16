import { afterEach, describe, expect, it, vi } from 'vitest';
import { normalizeReportingPeriod, resolveComparisonPeriod } from './periods';

describe('normalizeReportingPeriod', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('maps monthly presets to canonical monthly periods', () => {
    expect(normalizeReportingPeriod({ preset: 'last3months' })).toEqual({
      grain: 'month',
      range: 'rolling',
      months: 3,
    });
    expect(normalizeReportingPeriod({ preset: 'last6months' })).toEqual({
      grain: 'month',
      range: 'rolling',
      months: 6,
    });
  });

  it('prefers explicit custom date ranges', () => {
    expect(
      normalizeReportingPeriod({
        preset: 'last3months',
        startDate: '2026-01-01',
        endDate: '2026-03-31',
      }),
    ).toEqual({
      grain: 'day',
      range: 'custom',
      startDate: '2026-01-01',
      endDate: '2026-03-31',
    });
  });

  it('resolves current and previous month presets from the current UTC date', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-15T12:00:00.000Z'));

    expect(normalizeReportingPeriod({ preset: 'thisMonth' })).toEqual({
      grain: 'month',
      range: 'single',
      month: '2026-01',
    });
    expect(normalizeReportingPeriod({ preset: 'lastMonth' })).toEqual({
      grain: 'month',
      range: 'single',
      month: '2025-12',
    });
  });

  it('resolves current and previous year presets from the current UTC date', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-14T12:00:00.000Z'));

    expect(normalizeReportingPeriod({ preset: 'thisYear' })).toEqual({
      grain: 'month',
      range: 'single',
      year: '2026',
    });
    expect(normalizeReportingPeriod({ preset: 'lastYear' })).toEqual({
      grain: 'month',
      range: 'single',
      year: '2025',
    });
  });

  it('falls back to a three-month rolling period for empty input', () => {
    expect(normalizeReportingPeriod({})).toEqual({
      grain: 'month',
      range: 'rolling',
      months: 3,
    });
  });
});

describe('resolveComparisonPeriod', () => {
  it('supports month-over-month comparison', () => {
    expect(resolveComparisonPeriod({ period: { grain: 'month', range: 'single', month: '2026-04' }, comparison: 'mom' })).toEqual({
      grain: 'month',
      range: 'single',
      month: '2026-03',
    });
  });

  it('supports year-over-year comparison for custom date ranges', () => {
    expect(
      resolveComparisonPeriod({
        period: { grain: 'day', range: 'custom', startDate: '2026-04-01', endDate: '2026-04-30' },
        comparison: 'yoy',
      }),
    ).toEqual({
      grain: 'day',
      range: 'custom',
      startDate: '2025-04-01',
      endDate: '2025-04-30',
    });
  });

  it('returns the original period when comparison is none or unsupported', () => {
    const period = { grain: 'month' as const, range: 'rolling' as const, months: 6 };

    expect(resolveComparisonPeriod({ period, comparison: 'none' })).toBe(period);
    expect(resolveComparisonPeriod({ period, comparison: 'yoy' })).toBe(period);
  });

  it('supports year-over-year comparison across month boundaries', () => {
    expect(
      resolveComparisonPeriod({
        period: { grain: 'month', range: 'single', month: '2026-01' },
        comparison: 'yoy',
      }),
    ).toEqual({
      grain: 'month',
      range: 'single',
      month: '2025-01',
    });
  });

  it('supports month-over-month comparison for custom date ranges', () => {
    expect(
      resolveComparisonPeriod({
        period: { grain: 'day', range: 'custom', startDate: '2026-03-15', endDate: '2026-04-14' },
        comparison: 'mom',
      }),
    ).toEqual({
      grain: 'day',
      range: 'custom',
      startDate: '2026-02-15',
      endDate: '2026-03-14',
    });
  });
});
