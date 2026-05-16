import { describe, it, expect } from 'vitest';

interface MonthlySeriesItem { id: string; name: string; icon: string | null; data: number[] }
interface MonthlyReport { months: string[]; series: MonthlySeriesItem[] }

function shouldShowMonthlyTrend(data: MonthlyReport | undefined): boolean {
  return (data?.months.length ?? 0) > 1 && (data?.series.length ?? 0) > 0;
}

function topMerchants(items: Array<{ id: string; name: string; amount: number; transactionCount: number }>, n: number) {
  return items.slice(0, n);
}

describe('shouldShowMonthlyTrend', () => {
  it('returns true when 2+ months and has series', () => {
    expect(shouldShowMonthlyTrend({
      months: ['Apr 2026', 'May 2026'],
      series: [{ id: '1', name: 'Groceries', icon: null, data: [200, 300] }],
    })).toBe(true);
  });

  it('returns false for single-month range', () => {
    expect(shouldShowMonthlyTrend({
      months: ['May 2026'],
      series: [{ id: '1', name: 'Groceries', icon: null, data: [300] }],
    })).toBe(false);
  });

  it('returns false when data is undefined', () => {
    expect(shouldShowMonthlyTrend(undefined)).toBe(false);
  });
});

describe('topMerchants', () => {
  it('returns top N by array order (already sorted by backend)', () => {
    const items = [
      { id: 'm1', name: 'Amazon', amount: 500, transactionCount: 12 },
      { id: 'm2', name: 'Costco', amount: 300, transactionCount: 4 },
      { id: 'm3', name: 'Tim Hortons', amount: 80, transactionCount: 20 },
    ];
    const result = topMerchants(items, 2);
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('Amazon');
    expect(result[1].name).toBe('Costco');
  });

  it('returns all items when n > items.length', () => {
    const items = [{ id: 'm1', name: 'Amazon', amount: 500, transactionCount: 12 }];
    expect(topMerchants(items, 10)).toHaveLength(1);
  });
});
