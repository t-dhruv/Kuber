/**
 * Unit tests for the pure 50/30/20 analysis helpers in wealthAnalysis.ts.
 * No database, no HTTP — fast and deterministic.
 */
import { describe, it, expect } from 'vitest';
import {
  computeTargets,
  bucketTransactions,
  buildBucket,
  buildAlerts,
  computeSavingsCapacity,
  type TransactionInput,
  type BucketKey,
} from '../../src/lib/wealthAnalysis';

// ─── computeTargets ───────────────────────────────────────────────────────────

describe('computeTargets', () => {
  it('returns 50/30/20 split for income of 5000', () => {
    const t = computeTargets(5000);
    expect(t.needs).toBe(2500);   // 50%
    expect(t.wants).toBe(1500);   // 30%
    expect(t.savings).toBe(1000); // 20%
  });

  it('returns zeros when income is null', () => {
    const t = computeTargets(null);
    expect(t).toEqual({ needs: 0, wants: 0, savings: 0 });
  });

  it('returns zeros when income is 0', () => {
    const t = computeTargets(0);
    expect(t).toEqual({ needs: 0, wants: 0, savings: 0 });
  });

  it('returns zeros when income is negative', () => {
    const t = computeTargets(-100);
    expect(t).toEqual({ needs: 0, wants: 0, savings: 0 });
  });

  it('sums to exactly 100% of income', () => {
    const income = 7_777;
    const { needs, wants, savings } = computeTargets(income);
    expect(needs + wants + savings).toBeCloseTo(income, 5);
  });
});

// ─── bucketTransactions ───────────────────────────────────────────────────────

describe('bucketTransactions', () => {
  function tx(
    amount: number,
    bucketType: string,
    categoryId = 'cat-1',
    catName = 'Groceries',
  ): TransactionInput {
    return {
      amount,
      categoryId,
      category: { id: categoryId, name: catName, icon: null, bucketType },
    };
  }

  it('ignores positive-amount (income) transactions', () => {
    const { bucketTotals } = bucketTransactions([tx(500, 'needs')]);
    expect(bucketTotals.needs).toBe(0);
  });

  it('counts positive withdrawal journal amounts as spending', () => {
    const { bucketTotals } = bucketTransactions([{
      ...tx(500, 'needs'),
      transactionType: 'withdrawal',
    }]);
    expect(bucketTotals.needs).toBe(500);
  });

  it('accumulates absolute values of negative transactions into the correct bucket', () => {
    const txns: TransactionInput[] = [
      tx(-100, 'needs', 'cat-1', 'Groceries'),
      tx(-200, 'needs', 'cat-2', 'Utilities'),
      tx(-50, 'wants', 'cat-3', 'Dining'),
    ];
    const { bucketTotals } = bucketTransactions(txns);
    expect(bucketTotals.needs).toBe(300);
    expect(bucketTotals.wants).toBe(50);
    expect(bucketTotals.savings).toBe(0);
    expect(bucketTotals.uncategorized).toBe(0);
  });

  it('falls back to "uncategorized" bucket when category is null', () => {
    const txns: TransactionInput[] = [
      { amount: -75, categoryId: null, category: null },
    ];
    const { bucketTotals } = bucketTransactions(txns);
    expect(bucketTotals.uncategorized).toBe(75);
  });

  it('builds a catMap entry per unique categoryId', () => {
    const txns: TransactionInput[] = [
      tx(-100, 'needs', 'cat-1', 'Groceries'),
      tx(-50, 'needs', 'cat-1', 'Groceries'), // same category
      tx(-200, 'wants', 'cat-2', 'Dining'),
    ];
    const { catMap } = bucketTransactions(txns);
    expect(catMap.size).toBe(2);
    expect(catMap.get('cat-1')?.amount).toBe(150);
    expect(catMap.get('cat-2')?.amount).toBe(200);
  });

  it('groups uncategorised transactions under the __uncategorized__ key', () => {
    const txns: TransactionInput[] = [
      { amount: -30, categoryId: null, category: null },
      { amount: -20, categoryId: undefined, category: undefined },
    ];
    const { catMap } = bucketTransactions(txns);
    expect(catMap.get('__uncategorized__')?.amount).toBe(50);
  });

  it('returns all-zero buckets for an empty array', () => {
    const { bucketTotals, catMap } = bucketTransactions([]);
    expect(bucketTotals).toEqual({ needs: 0, wants: 0, savings: 0, uncategorized: 0 });
    expect(catMap.size).toBe(0);
  });
});

// ─── buildBucket ─────────────────────────────────────────────────────────────

describe('buildBucket', () => {
  it('computes delta as total minus target', () => {
    const totals = { needs: 600, wants: 0, savings: 0, uncategorized: 0 };
    const bucket = buildBucket('needs', 500, totals, new Map());
    expect(bucket.delta).toBe(100); // overspent
  });

  it('computes pct as (total / target) * 100', () => {
    const totals = { needs: 250, wants: 0, savings: 0, uncategorized: 0 };
    const bucket = buildBucket('needs', 500, totals, new Map());
    expect(bucket.pct).toBe(50);
  });

  it('returns pct of 0 when target is 0', () => {
    const totals = { needs: 0, wants: 0, savings: 0, uncategorized: 100 };
    const bucket = buildBucket('uncategorized', 0, totals, new Map());
    expect(bucket.pct).toBe(0);
  });

  it('sorts categories descending by amount', () => {
    const catMap = new Map([
      ['cat-a', { id: 'cat-a', name: 'A', icon: null, amount: 50, bucketType: 'needs' }],
      ['cat-b', { id: 'cat-b', name: 'B', icon: null, amount: 200, bucketType: 'needs' }],
      ['cat-c', { id: 'cat-c', name: 'C', icon: null, amount: 10, bucketType: 'needs' }],
    ]);
    const totals = { needs: 260, wants: 0, savings: 0, uncategorized: 0 };
    const bucket = buildBucket('needs', 500, totals, catMap);
    expect(bucket.categories.map(c => c.name)).toEqual(['B', 'A', 'C']);
  });

  it('only includes categories that match the requested bucket', () => {
    const catMap = new Map([
      ['cat-n', { id: 'cat-n', name: 'Needs Cat', icon: null, amount: 100, bucketType: 'needs' }],
      ['cat-w', { id: 'cat-w', name: 'Wants Cat', icon: null, amount: 50, bucketType: 'wants' }],
    ]);
    const totals = { needs: 100, wants: 50, savings: 0, uncategorized: 0 };
    const needsBucket = buildBucket('needs', 500, totals, catMap);
    expect(needsBucket.categories).toHaveLength(1);
    expect(needsBucket.categories[0].name).toBe('Needs Cat');
  });

  it('sets total from bucketTotals correctly', () => {
    const totals = { needs: 123, wants: 0, savings: 0, uncategorized: 0 };
    const bucket = buildBucket('needs', 200, totals, new Map());
    expect(bucket.total).toBe(123);
    expect(bucket.target).toBe(200);
  });
});

// ─── buildAlerts ─────────────────────────────────────────────────────────────

describe('buildAlerts', () => {
  function makeBuckets(overrides: Partial<Record<'needs' | 'wants' | 'savings', { total: number; target: number }>>) {
    function bd(total: number, target: number) {
      return { total, target, delta: total - target, pct: target > 0 ? (total / target) * 100 : 0, categories: [] };
    }
    return {
      needs:   bd(overrides.needs?.total ?? 0,   overrides.needs?.target ?? 2500),
      wants:   bd(overrides.wants?.total ?? 0,   overrides.wants?.target ?? 1500),
      savings: bd(overrides.savings?.total ?? 0, overrides.savings?.target ?? 1000),
    };
  }

  it('returns no alerts when income is null', () => {
    const buckets = makeBuckets({ needs: { total: 9999, target: 2500 } });
    expect(buildAlerts(null, buckets)).toHaveLength(0);
  });

  it('returns no alerts when all buckets are under target', () => {
    const buckets = makeBuckets({
      needs:   { total: 2000, target: 2500 },
      wants:   { total: 1000, target: 1500 },
      savings: { total: 800,  target: 1000 },
    });
    expect(buildAlerts(5000, buckets)).toHaveLength(0);
  });

  it('generates a "warning" alert when needs is over target by 5%', () => {
    // 5% over: 2500 * 1.05 = 2625
    const buckets = makeBuckets({ needs: { total: 2625, target: 2500 } });
    const alerts = buildAlerts(5000, buckets);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].bucket).toBe('needs');
    expect(alerts[0].severity).toBe('warning');
    expect(alerts[0].message).toContain('needs');
  });

  it('generates a "danger" alert when needs is over target by more than 20%', () => {
    // 25% over: 2500 * 1.25 = 3125
    const buckets = makeBuckets({ needs: { total: 3125, target: 2500 } });
    const alerts = buildAlerts(5000, buckets);
    expect(alerts[0].severity).toBe('danger');
  });

  it('generates alerts for multiple buckets simultaneously', () => {
    const buckets = makeBuckets({
      needs: { total: 3000, target: 2500 }, // over
      wants: { total: 2000, target: 1500 }, // over
    });
    const alerts = buildAlerts(5000, buckets);
    expect(alerts).toHaveLength(2);
    expect(alerts.map(a => a.bucket).sort()).toEqual(['needs', 'wants']);
  });

  it('alert message includes the percentage over and the dollar excess', () => {
    // 10% over: total=2750, target=2500, excess=$250, pctOver=10
    const buckets = makeBuckets({ needs: { total: 2750, target: 2500 } });
    const [alert] = buildAlerts(5000, buckets);
    expect(alert.message).toContain('10%');
    expect(alert.message).toContain('250.00');
  });

  it('does not alert when total exactly equals target', () => {
    const buckets = makeBuckets({ needs: { total: 2500, target: 2500 } });
    expect(buildAlerts(5000, buckets)).toHaveLength(0);
  });
});

// ─── computeSavingsCapacity ───────────────────────────────────────────────────

describe('computeSavingsCapacity', () => {
  const totals = (needs: number, wants: number, savings: number, uncategorized = 0) =>
    ({ needs, wants, savings, uncategorized } as Record<BucketKey, number>);

  it('returns income minus total spending', () => {
    const capacity = computeSavingsCapacity(5000, totals(2000, 1000, 500));
    expect(capacity).toBe(1500); // 5000 - 3500
  });

  it('returns 0 when spending equals income', () => {
    const capacity = computeSavingsCapacity(5000, totals(2500, 1500, 1000));
    expect(capacity).toBe(0);
  });

  it('clamps to 0 (never negative) when spending exceeds income', () => {
    const capacity = computeSavingsCapacity(5000, totals(3000, 2000, 1000));
    expect(capacity).toBe(0);
  });

  it('returns 0 when income is null', () => {
    const capacity = computeSavingsCapacity(null, totals(1000, 500, 200));
    expect(capacity).toBe(0);
  });

  it('includes uncategorized spending in total', () => {
    const capacity = computeSavingsCapacity(5000, totals(1000, 500, 200, 800));
    expect(capacity).toBe(2500); // 5000 - 2500
  });
});


