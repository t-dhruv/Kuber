import { describe, expect, it } from 'vitest';
import { classifyReportTransaction, shouldExcludeFromCashFlow } from './reportRules';

describe('shouldExcludeFromCashFlow', () => {
  it('excludes internal transfers from cash flow', () => {
    expect(shouldExcludeFromCashFlow({ type: 'transfer', isTransfer: true })).toBe(true);
  });

  it('excludes investment buys from cash flow', () => {
    expect(shouldExcludeFromCashFlow({ type: 'expense', investmentType: 'buy' })).toBe(true);
    expect(shouldExcludeFromCashFlow({ type: 'investment_buy' })).toBe(true);
  });

  it('keeps other events in cash flow', () => {
    expect(shouldExcludeFromCashFlow({ type: 'expense' })).toBe(false);
  });
});

describe('classifyReportTransaction', () => {
  it('keeps transfer legs in net worth while removing them from cash flow', () => {
    const result = classifyReportTransaction({
      type: 'transfer',
      isTransfer: true,
    });

    expect(result.cashFlow).toBe(false);
    expect(result.netWorth).toBe(true);
    expect(result.investmentRelevant).toBe(false);
  });

  it('marks investment buys, sells, and dividends as investment-relevant', () => {
    expect(classifyReportTransaction({ type: 'expense', investmentType: 'buy' }).investmentRelevant).toBe(true);
    expect(classifyReportTransaction({ type: 'income', investmentType: 'sell' }).investmentRelevant).toBe(true);
    expect(classifyReportTransaction({ type: 'income', investmentType: 'dividend' }).investmentRelevant).toBe(true);
  });
});
