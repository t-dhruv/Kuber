import { describe, expect, it } from 'vitest';
import { buildReportingOverview, buildCashFlowSummary, summarizeNetWorth, summarizePortfolio } from './reporting';

describe('reporting', () => {
  it('summarizes net worth using account type and exclusion flags', () => {
    const summary = summarizeNetWorth([
      { balance: 12500, type: 'bank' },
      { balance: 8000, type: 'investment' },
      { balance: -2400, type: 'loan' },
      { balance: -600, type: 'credit_card' },
      { balance: 3000, type: 'bank', excludeFromNetWorth: true },
    ]);

    expect(summary.assets).toBe(20500);
    expect(summary.liabilities).toBe(3000);
    expect(summary.netWorth).toBe(17500);
  });

  it('summarizes portfolio and missing price counts', () => {
    const summary = summarizePortfolio([
      { currentPrice: 12.5, shares: 10 },
      { currentPrice: null, shares: 2 },
    ]);

    expect(summary.portfolioValue).toBe(125);
    expect(summary.missingPrices).toBe(1);
  });

  it('builds a canonical reporting overview', () => {
    const overview = buildReportingOverview({
      accounts: [
        { balance: 1000, type: 'bank' },
        { balance: -250, type: 'loan' },
      ],
      holdings: [{ currentPrice: 20, shares: 4 }],
      cashFlowEvents: [
        { amount: 200, type: 'income' },
        { amount: -50, type: 'expense' },
        { amount: -25, type: 'transfer', isTransfer: true },
      ],
      diagnostics: {
        unmatchedTransferGroupIds: ['x'],
        holdingsWithMissingPrices: 2,
        duplicateTransactions: 3,
      },
    });

    expect(overview.currentNetWorth).toBe(750);
    expect(overview.portfolioValue).toBe(80);
    expect(overview.currentMonthSavingsRate).toBeCloseTo(0.75, 5);
    expect(overview.income).toBe(200);
    expect(overview.expense).toBe(50);
    expect(overview.transferTotal).toBe(25);
    expect(overview.unmatchedTransfers).toBe(1);
    expect(overview.missingPrices).toBe(2);
    expect(overview.duplicateTransactions).toBe(3);
  });

  it('tracks transfer-like cash flow separately', () => {
    const summary = buildCashFlowSummary([
      { amount: 100, type: 'income' },
      { amount: -40, type: 'expense' },
      { amount: -60, type: 'transfer', isTransfer: true },
      { amount: -80, type: 'investment_buy' },
    ]);

    expect(summary.income).toBe(100);
    expect(summary.expense).toBe(40);
    expect(summary.transferTotal).toBe(60);
  });
});
