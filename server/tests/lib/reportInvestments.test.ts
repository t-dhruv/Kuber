import { describe, expect, it } from 'vitest';
import { summarizeInvestmentPerformance } from '../../src/lib/reportInvestments';

describe('summarizeInvestmentPerformance', () => {
  it('separates contributions from market gains', () => {
    const summary = summarizeInvestmentPerformance({
      contributed: 10000,
      currentValue: 11250,
      dividends: 150,
      realizedGains: 100,
      unrealizedGains: 1000,
      fees: 50,
    });

    expect(summary.contributions).toBe(10000);
    expect(summary.marketGain).toBe(1250);
    expect(summary.income).toBe(150);
    expect(summary.realizedGains).toBe(100);
    expect(summary.unrealizedGains).toBe(1000);
    expect(summary.fees).toBe(50);
  });
});

