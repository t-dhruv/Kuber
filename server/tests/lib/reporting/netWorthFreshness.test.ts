import { describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { fetchStandardWealthContext, fetchStandardInvestmentContext } from '../../../src/lib/reporting/standard';

/**
 * Kuber's schema still carries Decimal "shadow" columns beside the original
 * Float money columns from an incomplete Float->Decimal migration. Those
 * Decimal columns were backfilled once and no runtime code writes them, so
 * reads must prefer the Float — the column reconciles, imports, transfers and
 * the nightly balance job actually maintain.
 *
 * Each fixture below sets the Decimal to a stale migration-day value and the
 * Float to the current one, so a regression to `xDecimal ?? x` fails loudly.
 */

const STALE = 1; // what the shadow Decimal was backfilled to
const RANGE = { householdId: 'household-1', startDate: '2026-01-01', endDate: '2026-01-31' };

function wealthPrisma(): Pick<PrismaClient, 'netWorthSnapshot' | 'account' | 'manualAsset' | 'manualLiability' | 'investmentHolding'> {
  return {
    netWorthSnapshot: { findMany: async () => [] },
    account: {
      findMany: async () => [
        { id: 'acct-1', name: 'Chequing', type: 'chequing', balance: 250, balanceDecimal: STALE },
      ],
    },
    manualAsset: { findMany: async () => [{ currentValue: 500, currentValueDecimal: STALE }] },
    manualLiability: { findMany: async () => [{ currentBalance: 100, currentBalanceDecimal: STALE }] },
    investmentHolding: {
      findMany: async () => [
        { shares: 10, sharesDecimal: STALE, currentPrice: 20, currentPriceDecimal: STALE },
      ],
    },
  } as never;
}

describe('net worth reads the column the app actually writes', () => {
  it('uses the Float balance, not the stale balanceDecimal', async () => {
    const ctx = await fetchStandardWealthContext(RANGE, wealthPrisma());

    expect(ctx.cashValue.toString()).toBe('250');
    expect(ctx.accountContributions[0].value.toString()).toBe('250');
  });

  it('uses Float shares and price for investment value', async () => {
    const ctx = await fetchStandardWealthContext(RANGE, wealthPrisma());

    // 10 shares * $20 = 200, not the stale 1 * 1 = 1
    expect(ctx.investmentValue.toString()).toBe('200');
  });

  it('uses Float values for manual assets and liabilities', async () => {
    const ctx = await fetchStandardWealthContext(RANGE, wealthPrisma());

    expect(ctx.manualAssetValue.toString()).toBe('500');
    expect(ctx.manualLiabilityValue.toString()).toBe('100');
  });

  it('still prefers the Decimal on NetWorthSnapshot, which is immutable history', async () => {
    const prisma = {
      ...wealthPrisma(),
      netWorthSnapshot: {
        findMany: async () => [
          {
            date: new Date('2026-01-15T00:00:00.000Z'),
            assets: 0,
            assetsDecimal: 900,
            liabilities: 0,
            liabilitiesDecimal: 100,
            netWorth: 0,
            netWorthDecimal: 800,
          },
        ],
      },
    } as never;

    const ctx = await fetchStandardWealthContext(RANGE, prisma);

    expect(ctx.snapshots[0].assets.toString()).toBe('900');
    expect(ctx.snapshots[0].netWorth.toString()).toBe('800');
  });
});

describe('investment summary reads the column the app actually writes', () => {
  it('uses Float shares, price and cost basis', async () => {
    const prisma = {
      investmentHolding: {
        findMany: async () => [
          {
            id: 'holding-1',
            symbol: 'AAPL',
            name: 'Apple',
            account: { id: 'acct-1', name: 'Investing' },
            shares: 10,
            sharesDecimal: STALE,
            currentPrice: 20,
            currentPriceDecimal: STALE,
            costBasis: 150,
            costBasisDecimal: STALE,
            lots: [],
            dividends: [],
            recurringInvestments: [],
          },
        ],
      },
    } as never;

    const ctx = await fetchStandardInvestmentContext(RANGE, prisma);

    expect(ctx.holdings[0].shares.toString()).toBe('10');
    expect(ctx.holdings[0].currentValue.toString()).toBe('200');
    expect(ctx.holdings[0].costBasis.toString()).toBe('150');
  });
});
