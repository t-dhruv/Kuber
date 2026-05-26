import { describe, expect, it } from 'vitest';
import { buildTransactionRulePrefill } from '../src/pages/transactions/review/rulePrefill';

describe('buildTransactionRulePrefill', () => {
  it('prefills a rule from the transaction description and suggested category', () => {
    const prefill = buildTransactionRulePrefill({
      description: 'STARBUCKS STORE 123',
      aiSuggestedCategoryId: 'cat-coffee',
      aiSuggestedCategoryName: 'Coffee',
    });

    expect(prefill).toEqual({
      name: 'Coffee (starbucks*)',
      field: 'description',
      operator: 'startsWith',
      value: 'starbucks',
      categoryId: 'cat-coffee',
      categoryName: 'Coffee',
    });
  });

  it('falls back to a generic rule name without a suggested category', () => {
    expect(buildTransactionRulePrefill({
      description: 'UTILITY-BILL MAY',
      aiSuggestedCategoryId: null,
      aiSuggestedCategoryName: null,
    })).toMatchObject({
      name: 'Rule (utility*)',
      value: 'utility',
    });
  });
});
