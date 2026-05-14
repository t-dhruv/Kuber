import { describe, expect, it } from 'vitest';
import { normalizeReportingPeriod, resolveComparisonPeriod } from './periods';

describe('normalizeReportingPeriod', () => {
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
});
