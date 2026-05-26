import { describe, expect, it } from 'vitest';
import { buildTransactionRulePrefill } from '../src/pages/transactions/rulePrefill';

describe('buildTransactionRulePrefill', () => {
  it('prefills a merchant-name rule from a categorized transaction', () => {
    expect(buildTransactionRulePrefill({
      merchantName: 'Costco Wholesale #123',
      categoryId: 'cat-groceries',
      categoryName: 'Groceries',
    })).toEqual({
      name: 'Groceries (Costco Wholesale #123)',
      field: 'merchantName',
      operator: 'equals',
      value: 'Costco Wholesale #123',
      categoryId: 'cat-groceries',
      categoryName: 'Groceries',
    });
  });

  it('omits category action prefill when the transaction is uncategorized', () => {
    expect(buildTransactionRulePrefill({
      merchantName: 'Unknown Merchant',
      categoryId: '',
      categoryName: '',
    })).toEqual({
      name: 'Rule (Unknown Merchant)',
      field: 'merchantName',
      operator: 'equals',
      value: 'Unknown Merchant',
    });
  });
});
