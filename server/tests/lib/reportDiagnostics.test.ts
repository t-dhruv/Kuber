import { describe, expect, it } from 'vitest';
import { buildDiagnosticsSummary } from '../../src/lib/reportDiagnostics';

describe('buildDiagnosticsSummary', () => {
  it('counts unmatched transfer groups and missing prices', () => {
    const summary = buildDiagnosticsSummary({
      unmatchedTransferGroupIds: ['g1'],
      holdingsWithMissingPrices: 2,
      duplicateTransactions: 1,
    });

    expect(summary.unmatchedTransfers).toBe(1);
    expect(summary.missingPrices).toBe(2);
    expect(summary.duplicateTransactions).toBe(1);
  });
});

