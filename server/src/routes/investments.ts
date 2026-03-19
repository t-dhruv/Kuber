import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';

const router = Router();

// --- Simulation helpers (deterministic by ticker) ---

function tickerHash(ticker: string): number {
  return ticker.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
}

function simulatePrice(ticker: string, costBasis: number): number {
  const hash = tickerHash(ticker);
  const gainFactor = 1 + (hash % 40) / 100; // 0% to 39% gain
  return Math.round(costBasis * gainFactor * 100) / 100;
}

function simulateDayChange(ticker: string, currentPrice: number): number {
  const hash = tickerHash(ticker);
  const changePct = ((hash % 5) - 2) / 100; // -2% to +2%
  return Math.round(currentPrice * changePct * 100) / 100;
}

// Asset class mapping
const US_STOCK_TICKERS = new Set(['VTI', 'AAPL', 'MSFT', 'GOOGL']);
const INTL_TICKERS = new Set(['VXUS']);
const BOND_TICKERS = new Set(['BND']);

function getAssetClass(ticker: string): string {
  if (US_STOCK_TICKERS.has(ticker.toUpperCase())) return 'US Stocks';
  if (INTL_TICKERS.has(ticker.toUpperCase())) return 'International Stocks';
  if (BOND_TICKERS.has(ticker.toUpperCase())) return 'Bonds';
  return 'Other';
}

function buildHoldingWithSimulatedPrices(h: {
  id: string;
  accountId: string;
  symbol: string;
  name: string;
  shares: number;
  costBasis: number;
  account: { name: string };
}) {
  const currentPrice = simulatePrice(h.symbol, h.costBasis);
  const currentValue = Math.round(h.shares * currentPrice * 100) / 100;
  const totalCost = Math.round(h.shares * h.costBasis * 100) / 100;
  const gain = Math.round((currentValue - totalCost) * 100) / 100;
  const gainPercent = totalCost !== 0
    ? Math.round((gain / totalCost) * 10000) / 100
    : 0;
  const dayChange = simulateDayChange(h.symbol, currentPrice);
  const dayChangePercent = currentPrice !== 0
    ? Math.round((dayChange / currentPrice) * 10000) / 100
    : 0;

  return {
    id: h.id,
    accountId: h.accountId,
    accountName: h.account.name,
    ticker: h.symbol,
    name: h.name,
    shares: h.shares,
    costBasis: h.costBasis,
    currentPrice,
    currentValue,
    totalCost,
    gain,
    gainPercent,
    dayChange,
    dayChangePercent,
  };
}

// GET /api/v1/investments/holdings
router.get('/holdings', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const { accountId } = req.query as { accountId?: string };

    // Build where clause — always scope to household via account
    const where: any = {
      account: { householdId },
    };
    if (accountId) {
      where.accountId = accountId;
    }

    const rawHoldings = await prisma.investmentHolding.findMany({
      where,
      include: { account: { select: { name: true, householdId: true } } },
    });

    const holdings = rawHoldings.map(buildHoldingWithSimulatedPrices);

    const totalValue = holdings.reduce((s, h) => s + h.currentValue, 0);
    const totalCostBasis = holdings.reduce((s, h) => s + h.totalCost, 0);
    const totalGain = Math.round((totalValue - totalCostBasis) * 100) / 100;
    const totalGainPercent = totalCostBasis !== 0
      ? Math.round((totalGain / totalCostBasis) * 10000) / 100
      : 0;

    return res.json({
      totalValue: Math.round(totalValue * 100) / 100,
      totalCostBasis: Math.round(totalCostBasis * 100) / 100,
      totalGain,
      totalGainPercent,
      holdings,
    });
  } catch (err) {
    console.error('[investments/holdings GET]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/investments/allocation
router.get('/allocation', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;

    const rawHoldings = await prisma.investmentHolding.findMany({
      where: { account: { householdId } },
      include: { account: { select: { id: true, name: true } } },
    });

    const holdings = rawHoldings.map(h => {
      const currentPrice = simulatePrice(h.symbol, h.costBasis);
      const currentValue = Math.round(h.shares * currentPrice * 100) / 100;
      return { ...h, currentValue, assetClassLabel: getAssetClass(h.symbol) };
    });

    const totalValue = holdings.reduce((s, h) => s + h.currentValue, 0);

    // By asset class
    const assetClassMap = new Map<string, number>();
    for (const h of holdings) {
      assetClassMap.set(
        h.assetClassLabel,
        (assetClassMap.get(h.assetClassLabel) ?? 0) + h.currentValue,
      );
    }
    const byAssetClass = Array.from(assetClassMap.entries()).map(([assetClass, value]) => ({
      assetClass,
      value: Math.round(value * 100) / 100,
      percent: totalValue > 0 ? Math.round((value / totalValue) * 10000) / 100 : 0,
    }));

    // By account
    const accountMap = new Map<string, { name: string; value: number }>();
    for (const h of holdings) {
      const existing = accountMap.get(h.accountId);
      if (existing) {
        existing.value += h.currentValue;
      } else {
        accountMap.set(h.accountId, { name: h.account.name, value: h.currentValue });
      }
    }
    const byAccount = Array.from(accountMap.entries()).map(([accountId, { name, value }]) => ({
      accountId,
      accountName: name,
      value: Math.round(value * 100) / 100,
      percent: totalValue > 0 ? Math.round((value / totalValue) * 10000) / 100 : 0,
    }));

    // Holdings breakdown
    const holdingsList = holdings.map(h => ({
      ticker: h.symbol,
      name: h.name,
      value: h.currentValue,
      percent: totalValue > 0 ? Math.round((h.currentValue / totalValue) * 10000) / 100 : 0,
      type: h.assetClassLabel,
    }));

    return res.json({
      totalValue: Math.round(totalValue * 100) / 100,
      byAssetClass,
      byAccount,
      holdings: holdingsList,
    });
  } catch (err) {
    console.error('[investments/allocation]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/investments/performance
router.get('/performance', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const { period = '1Y' } = req.query as { period?: string };

    // Benchmark returns by period (hardcoded typical values)
    const benchmarks: Record<string, { sp500: number; usBonds: number; usStocks: number }> = {
      '1M':  { sp500: 1.8,  usBonds: 0.3,  usStocks: 1.9  },
      '3M':  { sp500: 5.1,  usBonds: 0.8,  usStocks: 5.4  },
      '6M':  { sp500: 9.3,  usBonds: 1.5,  usStocks: 9.8  },
      'YTD': { sp500: 12.0, usBonds: 2.1,  usStocks: 12.5 },
      '1Y':  { sp500: 18.5, usBonds: 3.2,  usStocks: 19.2 },
      '5Y':  { sp500: 82.0, usBonds: 10.5, usStocks: 87.0 },
    };

    const periodMap: Record<string, number> = {
      '1M': 1, '3M': 3, '6M': 6, 'YTD': 12, '1Y': 12, '5Y': 60,
    };
    const months = periodMap[period] ?? 12;

    const rawHoldings = await prisma.investmentHolding.findMany({
      where: { account: { householdId } },
      include: { account: { select: { id: true } } },
    });

    const totalCurrentValue = rawHoldings.reduce((s, h) => {
      const currentPrice = simulatePrice(h.symbol, h.costBasis);
      return s + h.shares * currentPrice;
    }, 0);
    const totalCostBasis = rawHoldings.reduce((s, h) => s + h.shares * h.costBasis, 0);

    const portfolioReturnValue = Math.round((totalCurrentValue - totalCostBasis) * 100) / 100;
    const portfolioReturn = totalCostBasis > 0
      ? Math.round((portfolioReturnValue / totalCostBasis) * 10000) / 100
      : 0;

    // Simulate historical values by back-projecting from current total
    const now = new Date();
    const history: Array<{ date: string; value: number }> = [];
    const totalCurrent = Math.round(totalCurrentValue * 100) / 100;

    for (let i = months; i >= 0; i--) {
      const pointDate = new Date(now.getFullYear(), now.getMonth() - i, 1);

      // Use ticker-hash-based variance to keep it deterministic but slightly varied
      const progressFraction = (months - i) / months;
      // Start from costBasis and grow toward current value
      const baseValue = totalCostBasis + (totalCurrentValue - totalCostBasis) * progressFraction;
      // Add small deterministic wobble using month index
      const wobble = 1 + (((i * 7) % 5) - 2) / 100; // -2% to +2%
      const pointValue = Math.round(baseValue * wobble * 100) / 100;

      history.push({
        date: pointDate.toISOString().slice(0, 10),
        value: pointValue,
      });
    }
    // Ensure last point is current value
    if (history.length > 0) {
      history[history.length - 1].value = totalCurrent;
    }

    return res.json({
      period,
      portfolioReturn,
      portfolioReturnValue,
      benchmarks: benchmarks[period] ?? benchmarks['1Y'],
      history,
    });
  } catch (err) {
    console.error('[investments/performance]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/v1/investments/holdings
router.post('/holdings', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const { accountId, ticker, name, shares, costBasis } = req.body;

    if (!accountId || !ticker || !name || shares == null || costBasis == null) {
      return res.status(400).json({ error: 'accountId, ticker, name, shares, and costBasis are required' });
    }

    // Validate account belongs to household and is INVESTMENT type
    const account = await prisma.account.findFirst({
      where: { id: accountId, householdId },
    });
    if (!account) {
      return res.status(400).json({ error: 'Account not found in this household' });
    }
    if (account.type !== 'INVESTMENT' && account.type !== 'investment') {
      return res.status(400).json({ error: 'Account must be of type INVESTMENT' });
    }

    const simulatedPrice = simulatePrice(ticker, costBasis);

    const holding = await prisma.investmentHolding.create({
      data: {
        accountId,
        symbol: ticker.toUpperCase(),
        name,
        shares: Number(shares),
        costBasis: Number(costBasis),
        currentPrice: simulatedPrice,
      },
      include: { account: { select: { name: true } } },
    });

    return res.status(201).json(buildHoldingWithSimulatedPrices(holding));
  } catch (err) {
    console.error('[investments/holdings POST]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/v1/investments/holdings/:id
router.put('/holdings/:id', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const { id } = req.params;
    const { shares, costBasis } = req.body;

    // IDOR check — ensure holding belongs to this household via account
    const existing = await prisma.investmentHolding.findFirst({
      where: { id, account: { householdId } },
      include: { account: { select: { name: true } } },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Holding not found' });
    }

    const updatedShares = shares != null ? Number(shares) : existing.shares;
    const updatedCostBasis = costBasis != null ? Number(costBasis) : existing.costBasis;
    const simulatedPrice = simulatePrice(existing.symbol, updatedCostBasis);

    const updated = await prisma.investmentHolding.update({
      where: { id },
      data: {
        shares: updatedShares,
        costBasis: updatedCostBasis,
        currentPrice: simulatedPrice,
      },
      include: { account: { select: { name: true } } },
    });

    return res.json(buildHoldingWithSimulatedPrices(updated));
  } catch (err) {
    console.error('[investments/holdings PUT]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/v1/investments/holdings/:id
router.delete('/holdings/:id', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const { id } = req.params;

    // IDOR check
    const existing = await prisma.investmentHolding.findFirst({
      where: { id, account: { householdId } },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Holding not found' });
    }

    await prisma.investmentHolding.delete({ where: { id } });

    return res.json({ success: true });
  } catch (err) {
    console.error('[investments/holdings DELETE]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
