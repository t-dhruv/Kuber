import { describe, expect, it } from 'vitest';
import { buildCashFlowSummary } from './reportCashFlow';

describe('buildCashFlowSummary', () => {
  it('excludes internal transfers from income and expense totals', () => {
    const summary = buildCashFlowSummary([
      { amount: -100, type: 'transfer', isTransfer: true },
      { amount: 100, type: 'transfer', isTransfer: true },
      { amount: -50, type: 'expense' },
    ]);

    expect(summary.income).toBe(0);
    expect(summary.expense).toBe(50);
    expect(summary.transferTotal).toBe(200);
  });

  it('excludes investment buys from expense totals', () => {
    const summary = buildCashFlowSummary([
      { amount: -500, type: 'investment_buy' },
      { amount: 250, type: 'income' },
    ]);

    expect(summary.income).toBe(250);
    expect(summary.expense).toBe(0);
    expect(summary.transferTotal).toBe(0);
  });

  it('counts ordinary income and expenses normally', () => {
    const summary = buildCashFlowSummary([
      { amount: 200, type: 'income' },
      { amount: -75, type: 'expense' },
    ]);

    expect(summary.income).toBe(200);
    expect(summary.expense).toBe(75);
    expect(summary.transferTotal).toBe(0);
  });
});
