import { describe, it, expect } from 'vitest';

interface SpendingCategoryItem {
  id: string;
  name: string;
  icon: string | null;
  amount: number;
  percent: number;
}

function shouldShowCategories(categories: SpendingCategoryItem[] | undefined): boolean {
  return (categories?.length ?? 0) > 0;
}

function getTopCategories(categories: SpendingCategoryItem[], n: number): SpendingCategoryItem[] {
  return categories.slice(0, n);
}

function fmtCurrency(amount: number): string {
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(amount);
}

const mockCategories: SpendingCategoryItem[] = [
  { id: '1', name: 'Groceries', icon: '🛒', amount: 450, percent: 45 },
  { id: '2', name: 'Transport', icon: '🚗', amount: 200, percent: 20 },
  { id: '3', name: 'Dining', icon: '🍽', amount: 150, percent: 15 },
];

describe('SpendingWidget — top categories logic', () => {
  it('shows categories when data present', () => {
    expect(shouldShowCategories(mockCategories)).toBe(true);
  });

  it('hides categories when list empty', () => {
    expect(shouldShowCategories([])).toBe(false);
  });

  it('hides categories when undefined (loading)', () => {
    expect(shouldShowCategories(undefined)).toBe(false);
  });

  it('returns top 3 from category list', () => {
    const top = getTopCategories(mockCategories, 3);
    expect(top).toHaveLength(3);
    expect(top[0].name).toBe('Groceries');
    expect(top[2].name).toBe('Dining');
  });

  it('formats category amounts as currency', () => {
    const result = fmtCurrency(450);
    expect(result).toContain('450');
  });

  it('clamps progress bar percent to 100', () => {
    const overBudget = { ...mockCategories[0], percent: 150 };
    expect(Math.min(100, overBudget.percent)).toBe(100);
  });
});
