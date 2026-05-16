import { describe, expect, it } from 'vitest';
import { buildReportOverview } from '../../src/lib/reportOverview';

describe('buildReportOverview', () => {
  it('combines cash flow, net worth, portfolio and diagnostics', () => {
    const overview = buildReportOverview({
      accounts: [
        { balance: 300000, type: 'bank' },
        { balance: -50000, type: 'loan' },
      ],
      holdings: [
        { currentPrice: 100, shares: 1000 },
        { currentPrice: null, shares: 1 },
      ],
      cashFlowEvents: [
        { amount: 5000, type: 'income' },
        { amount: -1500, type: 'expense' },
        { amount: -2000, type: 'transfer', isTransfer: true },
        { amount: -1000, type: 'investment_buy' },
      ],
      diagnostics: {
        unmatchedTransferGroupIds: ['a', 'b'],
        holdingsWithMissingPrices: 3,
        duplicateTransactions: 1,
      },
    });

    expect(overview.currentNetWorth).toBe(250000);
    expect(overview.portfolioValue).toBe(100000);
    expect(overview.currentMonthSavingsRate).toBeCloseTo(0.7, 5);
    expect(overview.income).toBe(5000);
    expect(overview.expense).toBe(1500);
    expect(overview.transferTotal).toBe(2000);
    expect(overview.unmatchedTransfers).toBe(2);
    expect(overview.missingPrices).toBe(3);
    expect(overview.duplicateTransactions).toBe(1);
  });
});

