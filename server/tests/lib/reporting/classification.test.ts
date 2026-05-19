import { describe, expect, it } from 'vitest';
import { classifyCashFlowEvent, isExcludedInvestmentFlow, isTransferLike } from '../../../src/lib/reporting/classification';

describe('isTransferLike', () => {
  it('identifies transfer-like events from explicit flags and types', () => {
    expect(isTransferLike({ amount: 100, type: 'transfer' })).toBe(true);
    expect(isTransferLike({ amount: 100, type: 'income', isTransfer: true })).toBe(true);
    expect(isTransferLike({ amount: 100, type: 'income' })).toBe(false);
  });
});

describe('isExcludedInvestmentFlow', () => {
  it('excludes investment principal movement from reporting totals', () => {
    expect(isExcludedInvestmentFlow({ amount: -100, type: 'investment_buy' })).toBe(true);
    expect(isExcludedInvestmentFlow({ amount: 100, type: 'investment_sell' })).toBe(false);
  });
});

describe('classifyCashFlowEvent', () => {
  it('classifies transfers before other rules', () => {
    expect(classifyCashFlowEvent({ amount: -250, type: 'transfer', isTransfer: true })).toBe('transfer');
  });

  it('classifies excluded investment buys as ignored', () => {
    expect(classifyCashFlowEvent({ amount: -500, type: 'investment_buy' })).toBe('ignored');
  });

  it('classifies positive values as income and negative values as expense', () => {
    expect(classifyCashFlowEvent({ amount: 250, type: 'cashback' })).toBe('income');
    expect(classifyCashFlowEvent({ amount: -75, type: 'expense' })).toBe('expense');
  });
});



