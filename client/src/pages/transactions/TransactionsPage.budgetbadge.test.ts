import { describe, it, expect } from 'vitest';
import { getBudgetStatus } from './TransactionsPage';

describe('getBudgetStatus', () => {
  const map = new Map([
    ['cat-groceries', { budgeted: 500, actual: 300 }],
    ['cat-dining',    { budgeted: 200, actual: 180 }],
    ['cat-gas',       { budgeted: 100, actual: 120 }],
    ['cat-zero',      { budgeted: 0,   actual: 50  }],
  ]);

  it('returns "under" when actual < 80% of budget', () => {
    expect(getBudgetStatus('cat-groceries', map)).toBe('under');
  });

  it('returns "warning" when actual is 80–99% of budget', () => {
    expect(getBudgetStatus('cat-dining', map)).toBe('warning');
  });

  it('returns "over" when actual >= 100% of budget', () => {
    expect(getBudgetStatus('cat-gas', map)).toBe('over');
  });

  it('returns null when budgeted is 0', () => {
    expect(getBudgetStatus('cat-zero', map)).toBe(null);
  });

  it('returns null for unknown categoryId', () => {
    expect(getBudgetStatus('cat-unknown', map)).toBe(null);
  });
});
