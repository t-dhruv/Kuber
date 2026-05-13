/**
 * Pure computation helpers for the 50/30/20 wealth analysis.
 * Extracted here so they can be unit-tested without an HTTP layer.
 */

export type BucketKey = 'needs' | 'wants' | 'savings' | 'uncategorized';

export interface CategoryTotal {
  id: string;
  name: string;
  icon: string | null;
  amount: number;
  bucketType: string;
}

export interface BucketData {
  total: number;
  target: number;
  /** delta = total - target (positive = overspent, negative = underspent) */
  delta: number;
  /** pct = (total / target) * 100 — 0 when target is 0 */
  pct: number;
  categories: CategoryTotal[];
}

export interface TransactionInput {
  amount: number;
  categoryId?: string | null;
  category?: {
    id: string;
    name: string;
    icon?: string | null;
    bucketType?: string | null;
  } | null;
}

export type AlertSeverity = 'danger' | 'warning' | 'info';

export interface BudgetAlert {
  bucket: string;
  message: string;
  severity: AlertSeverity;
}

// ─── computeTargets ───────────────────────────────────────────────────────────

/** Returns 50/30/20 targets for the given monthly net income. */
export function computeTargets(income: number | null): {
  needs: number;
  wants: number;
  savings: number;
} {
  if (income == null || income <= 0) {
    return { needs: 0, wants: 0, savings: 0 };
  }
  return {
    needs: income * 0.5,
    wants: income * 0.3,
    savings: income * 0.2,
  };
}

// ─── bucketTransactions ───────────────────────────────────────────────────────

/**
 * Groups spending transactions into bucket totals and a per-category map.
 * Only negative-amount transactions are considered (spending).
 * Positive amounts are ignored.
 */
export function bucketTransactions(transactions: TransactionInput[]): {
  bucketTotals: Record<BucketKey, number>;
  catMap: Map<string, CategoryTotal>;
} {
  const bucketTotals: Record<BucketKey, number> = {
    needs: 0,
    wants: 0,
    savings: 0,
    uncategorized: 0,
  };
  const catMap = new Map<string, CategoryTotal>();

  for (const tx of transactions) {
    // Only spending (negative amounts) contribute
    if (tx.amount >= 0) continue;

    const bucket = (tx.category?.bucketType ?? 'uncategorized') as BucketKey;
    const absAmount = Math.abs(tx.amount);

    bucketTotals[bucket] += absAmount;

    const catKey = tx.categoryId ?? '__uncategorized__';
    const existing = catMap.get(catKey);
    if (existing) {
      existing.amount += absAmount;
    } else {
      catMap.set(catKey, {
        id: catKey,
        name: tx.category?.name ?? 'Uncategorized',
        icon: tx.category?.icon ?? null,
        amount: absAmount,
        bucketType: bucket,
      });
    }
  }

  return { bucketTotals, catMap };
}

// ─── buildBucket ─────────────────────────────────────────────────────────────

/** Produces the BucketData object for a single bucket key. */
export function buildBucket(
  key: BucketKey,
  target: number,
  bucketTotals: Record<BucketKey, number>,
  catMap: Map<string, CategoryTotal>,
): BucketData {
  const cats = [...catMap.values()]
    .filter((c) => c.bucketType === key)
    .sort((a, b) => b.amount - a.amount);
  const total = bucketTotals[key];
  const delta = total - target;
  const pct = target > 0 ? (total / target) * 100 : 0;
  return { total, target, delta, pct, categories: cats };
}

// ─── buildAlerts ─────────────────────────────────────────────────────────────

/**
 * Generates alerts for buckets that exceed their target.
 * Only fires when income is known (non-null).
 */
export function buildAlerts(
  income: number | null,
  buckets: Record<'needs' | 'wants' | 'savings', BucketData>,
): BudgetAlert[] {
  const alerts: BudgetAlert[] = [];
  if (income == null) return alerts;

  for (const key of ['needs', 'wants', 'savings'] as const) {
    const { total, target } = buckets[key];
    if (total > target && target > 0) {
      const overage = (total - target) / target;
      const severity: AlertSeverity = overage > 0.2 ? 'danger' : 'warning';
      const pctOver = Math.round(overage * 100);
      alerts.push({
        bucket: key,
        message: `Your ${key} spending is ${pctOver}% over budget ($${(total - target).toFixed(2)} excess)`,
        severity,
      });
    }
  }
  return alerts;
}

// ─── computeSavingsCapacity ───────────────────────────────────────────────────

/** Returns how much income remains unspent this month. */
export function computeSavingsCapacity(
  income: number | null,
  bucketTotals: Record<BucketKey, number>,
): number {
  if (income == null) return 0;
  const totalSpent =
    bucketTotals.needs +
    bucketTotals.wants +
    bucketTotals.savings +
    bucketTotals.uncategorized;
  return Math.max(0, income - totalSpent);
}
