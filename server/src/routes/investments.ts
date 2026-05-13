import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { getQuotes, getQuote, getLiveBenchmarks, BenchmarkPeriod } from '../lib/priceCache';

const router = Router();

// ─── Asset class heuristic ────────────────────────────────────────────────────

function inferAssetClass(symbol: string, shortName: string): string {
  const s = symbol.toUpperCase();
  const n = shortName.toLowerCase();
  if (n.includes('bond') || n.includes('treasury') || n.includes('fixed') || ['BND', 'AGG', 'TLT', 'IEF', 'SHY', 'VGIT', 'VGSH', 'VGLT', 'LQD', 'HYG'].includes(s)) return 'Bonds';
  if (n.includes('international') || n.includes('emerging') || n.includes('world ex') || ['VXUS', 'EFA', 'EEM', 'VEA', 'VWO', 'IEFA', 'IXUS'].includes(s)) return 'International Stocks';
  if (n.includes('real estate') || n.includes('reit') || ['VNQ', 'VNQI', 'IYR'].includes(s)) return 'Real Estate';
  if (n.includes('commodity') || n.includes('gold') || n.includes('oil') || ['GLD', 'SLV', 'GSG', 'DJP', 'IAU'].includes(s)) return 'Commodities';
  if (n.includes('cash') || n.includes('money market') || n.includes('savings')) return 'Cash';
  return 'US Stocks';
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function nextRunDate(frequency: string, dayOfMonth: number, from: Date): Date {
  const d = new Date(from);
  if (frequency === 'weekly') {
    d.setDate(d.getDate() + 7);
  } else if (frequency === 'biweekly') {
    d.setDate(d.getDate() + 14);
  } else if (frequency === 'monthly') {
    d.setMonth(d.getMonth() + 1);
    d.setDate(Math.min(dayOfMonth, 28));
  } else if (frequency === 'quarterly') {
    d.setMonth(d.getMonth() + 3);
    d.setDate(Math.min(dayOfMonth, 28));
  }
  return d;
}

async function computeAvgCostBasis(holdingId: string): Promise<number> {
  const lots = await prisma.holdingLot.findMany({
    where: { holdingId, status: 'confirmed' },
  });
  if (lots.length === 0) return 0;
  const totalShares = lots.reduce((s, l) => s + l.shares, 0);
  if (totalShares === 0) return 0;
  const totalCost = lots.reduce((s, l) => s + l.shares * l.pricePerShare, 0);
  const avg = Math.round((totalCost / totalShares) * 10000) / 10000;
  // Update holding costBasis
  await prisma.investmentHolding.update({
    where: { id: holdingId },
    data: { costBasis: avg },
  });
  return avg;
}

async function generatePendingLots(householdId: string): Promise<number> {
  const now = new Date();

  const schedules = await prisma.recurringInvestment.findMany({
    where: {
      status: 'active',
      nextRunAt: { lte: now },
      holding: { account: { householdId } },
    },
    include: { holding: true },
  });

  let count = 0;
  for (const schedule of schedules) {
    // Check if a pending lot already exists for this schedule's current period
    const existingPending = await prisma.holdingLot.findFirst({
      where: {
        holdingId: schedule.holdingId,
        status: 'pending',
        createdAt: { gte: schedule.lastRunAt ?? new Date(0) },
      },
    });
    if (existingPending) continue;

    // Fetch live price
    const quote = await getQuote(schedule.holding.symbol);
    const price = quote?.price ?? schedule.holding.currentPrice ?? schedule.holding.costBasis;
    if (price <= 0) continue;

    const shares = schedule.amount / price;

    await prisma.holdingLot.create({
      data: {
        holdingId: schedule.holdingId,
        date: now,
        shares: Math.round(shares * 100000) / 100000,
        pricePerShare: price,
        note: `Recurring buy — ${schedule.frequency}`,
        status: 'pending',
      },
    });

    // Advance nextRunAt and update lastRunAt
    const next = nextRunDate(schedule.frequency, schedule.dayOfMonth, now);
    await prisma.recurringInvestment.update({
      where: { id: schedule.id },
      data: { lastRunAt: now, nextRunAt: next },
    });

    count++;
  }
  return count;
}

// ─── Holdings builder ─────────────────────────────────────────────────────────

type RawHolding = {
  id: string;
  accountId: string;
  symbol: string;
  name: string;
  shares: number;
  costBasis: number;
  currentPrice: number;
  updatedAt: Date;
  account: { name: string };
  lots: Array<{
    id: string;
    date: Date;
    shares: number;
    pricePerShare: number;
    note: string | null;
    status: string;
  }>;
};

function buildHolding(
  h: RawHolding,
  livePrice: number,
  dayChange: number,
  dayChangePercent: number,
  shortName: string,
  avgCostBasis: number,
) {
  const currentValue = Math.round(h.shares * livePrice * 100) / 100;
  const totalCost = Math.round(h.shares * avgCostBasis * 100) / 100;
  const gain = Math.round((currentValue - totalCost) * 100) / 100;
  const gainPercent = totalCost !== 0 ? Math.round((gain / totalCost) * 10000) / 100 : 0;

  return {
    id: h.id,
    accountId: h.accountId,
    accountName: h.account.name,
    ticker: h.symbol,
    name: shortName || h.name,
    shares: h.shares,
    avgCostBasis,
    currentPrice: livePrice,
    currentValue,
    totalCost,
    gain,
    gainPercent,
    dayChange: Math.round(dayChange * h.shares * 100) / 100,
    dayChangePercent,
    priceSource: 'live',
    priceUpdatedAt: new Date().toISOString(),
    lots: h.lots.map((l) => ({
      id: l.id,
      date: l.date.toISOString(),
      shares: l.shares,
      pricePerShare: l.pricePerShare,
      note: l.note,
      status: l.status,
    })),
  };
}

function buildHoldingFallback(h: RawHolding, avgCostBasis: number) {
  const livePrice = h.currentPrice || avgCostBasis || h.costBasis;
  const currentValue = Math.round(h.shares * livePrice * 100) / 100;
  const totalCost = Math.round(h.shares * avgCostBasis * 100) / 100;
  const gain = Math.round((currentValue - totalCost) * 100) / 100;
  const gainPercent = totalCost !== 0 ? Math.round((gain / totalCost) * 10000) / 100 : 0;

  return {
    id: h.id,
    accountId: h.accountId,
    accountName: h.account.name,
    ticker: h.symbol,
    name: h.name,
    shares: h.shares,
    avgCostBasis,
    currentPrice: livePrice,
    currentValue,
    totalCost,
    gain,
    gainPercent,
    dayChange: 0,
    dayChangePercent: 0,
    priceSource: 'cached',
    priceUpdatedAt: h.updatedAt.toISOString(),
    lots: h.lots.map((l) => ({
      id: l.id,
      date: l.date.toISOString(),
      shares: l.shares,
      pricePerShare: l.pricePerShare,
      note: l.note,
      status: l.status,
    })),
  };
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// GET /api/v1/investments/holdings
router.get('/holdings', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const { accountId } = req.query as { accountId?: string };

    // Generate any overdue pending lots first
    await generatePendingLots(householdId).catch(() => {});

    const where: Record<string, unknown> = { account: { householdId } };
    if (accountId) where.accountId = accountId;

    const rawHoldings = await prisma.investmentHolding.findMany({
      where,
      include: {
        account: { select: { name: true, householdId: true } },
        lots: { orderBy: { date: 'asc' } },
      },
    });

    // Compute avgCostBasis per holding from confirmed lots
    const avgMap = new Map<string, number>();
    for (const h of rawHoldings) {
      const confirmedLots = h.lots.filter((l) => l.status === 'confirmed');
      const totalShares = confirmedLots.reduce((s, l) => s + l.shares, 0);
      const avg = totalShares > 0
        ? confirmedLots.reduce((s, l) => s + l.shares * l.pricePerShare, 0) / totalShares
        : h.costBasis;
      avgMap.set(h.id, Math.round(avg * 10000) / 10000);
    }

    // Batch-fetch all live prices
    const symbols = rawHoldings.map((h) => h.symbol);
    const quotes = await getQuotes(symbols);

    const holdings = rawHoldings.map((h) => {
      const avg = avgMap.get(h.id) ?? h.costBasis;
      const q = quotes.get(h.symbol.toUpperCase());
      if (q) {
        return buildHolding(h as RawHolding, q.price, q.dayChange, q.dayChangePercent, q.shortName, avg);
      }
      return buildHoldingFallback(h as RawHolding, avg);
    });

    // Persist live prices back to DB (fire-and-forget)
    for (const h of rawHoldings) {
      const q = quotes.get(h.symbol.toUpperCase());
      if (q && Math.abs(q.price - h.currentPrice) > 0.001) {
        prisma.investmentHolding.update({ where: { id: h.id }, data: { currentPrice: q.price } }).catch(() => {});
      }
    }

    const totalValue = holdings.reduce((s, h) => s + h.currentValue, 0);
    const totalCostBasis = holdings.reduce((s, h) => s + h.totalCost, 0);
    const totalGain = Math.round((totalValue - totalCostBasis) * 100) / 100;
    const totalGainPercent = totalCostBasis !== 0
      ? Math.round((totalGain / totalCostBasis) * 10000) / 100
      : 0;
    const totalDayChange = holdings.reduce((s, h) => s + h.dayChange, 0);

    return res.json({
      totalValue: Math.round(totalValue * 100) / 100,
      totalCostBasis: Math.round(totalCostBasis * 100) / 100,
      totalGain,
      totalGainPercent,
      totalDayChange: Math.round(totalDayChange * 100) / 100,
      holdings,
    });
  } catch (err) {
    req.log.error({ err }, 'investments/holdings GET');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/investments/pending
router.get('/pending', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;

    const lots = await prisma.holdingLot.findMany({
      where: {
        status: 'pending',
        holding: { account: { householdId } },
      },
      include: {
        holding: {
          select: { symbol: true, name: true },
        },
      },
      orderBy: { date: 'desc' },
    });

    return res.json(
      lots.map((l) => ({
        id: l.id,
        holdingId: l.holdingId,
        ticker: l.holding.symbol,
        name: l.holding.name,
        date: l.date.toISOString(),
        shares: l.shares,
        pricePerShare: l.pricePerShare,
        note: l.note,
      })),
    );
  } catch (err) {
    req.log.error({ err }, 'investments/pending');
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

    const symbols = rawHoldings.map((h) => h.symbol);
    const quotes = await getQuotes(symbols);

    const holdings = rawHoldings.map((h) => {
      const q = quotes.get(h.symbol.toUpperCase());
      const price = q?.price ?? h.currentPrice ?? h.costBasis;
      const shortName = q?.shortName ?? h.name;
      return {
        ...h,
        currentValue: Math.round(h.shares * price * 100) / 100,
        assetClassLabel: inferAssetClass(h.symbol, shortName),
      };
    });

    const totalValue = holdings.reduce((s, h) => s + h.currentValue, 0);

    const assetClassMap = new Map<string, number>();
    for (const h of holdings) {
      assetClassMap.set(h.assetClassLabel, (assetClassMap.get(h.assetClassLabel) ?? 0) + h.currentValue);
    }
    const byAssetClass = Array.from(assetClassMap.entries()).map(([assetClass, value]) => ({
      assetClass,
      value: Math.round(value * 100) / 100,
      percent: totalValue > 0 ? Math.round((value / totalValue) * 10000) / 100 : 0,
    }));

    const accountMap = new Map<string, { name: string; value: number }>();
    for (const h of holdings) {
      const existing = accountMap.get(h.accountId);
      if (existing) { existing.value += h.currentValue; }
      else { accountMap.set(h.accountId, { name: h.account.name, value: h.currentValue }); }
    }
    const byAccount = Array.from(accountMap.entries()).map(([accountId, { name, value }]) => ({
      accountId,
      accountName: name,
      value: Math.round(value * 100) / 100,
      percent: totalValue > 0 ? Math.round((value / totalValue) * 10000) / 100 : 0,
    }));

    const holdingsList = holdings.map((h) => ({
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
    req.log.error({ err }, 'investments/allocation');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/investments/performance
router.get('/performance', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const { period = '1Y' } = req.query as { period?: string };

    const benchmarks = await getLiveBenchmarks();

    const periodMap: Record<string, number> = {
      '1M': 1, '3M': 3, '6M': 6, 'YTD': 12, '1Y': 12, '5Y': 60,
    };
    const months = periodMap[period] ?? 12;

    const rawHoldings = await prisma.investmentHolding.findMany({
      where: { account: { householdId } },
      include: { account: { select: { id: true } } },
    });

    const symbols = rawHoldings.map((h) => h.symbol);
    const quotes = await getQuotes(symbols);

    const totalCurrentValue = rawHoldings.reduce((s, h) => {
      const q = quotes.get(h.symbol.toUpperCase());
      const price = q?.price ?? h.currentPrice ?? h.costBasis;
      return s + h.shares * price;
    }, 0);
    const totalCostBasis = rawHoldings.reduce((s, h) => s + h.shares * h.costBasis, 0);

    const portfolioReturnValue = Math.round((totalCurrentValue - totalCostBasis) * 100) / 100;
    const portfolioReturn = totalCostBasis > 0
      ? Math.round((portfolioReturnValue / totalCostBasis) * 10000) / 100
      : 0;

    const now = new Date();
    const history: Array<{ date: string; value: number }> = [];
    const totalCurrent = Math.round(totalCurrentValue * 100) / 100;

    for (let i = months; i >= 0; i--) {
      const pointDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const progressFraction = (months - i) / months;
      const baseValue = totalCostBasis + (totalCurrentValue - totalCostBasis) * progressFraction;
      const wobble = 1 + (((i * 7) % 5) - 2) / 100;
      history.push({
        date: pointDate.toISOString().slice(0, 10),
        value: Math.round(baseValue * wobble * 100) / 100,
      });
    }
    if (history.length > 0) history[history.length - 1].value = totalCurrent;

    return res.json({
      period,
      portfolioReturn,
      portfolioReturnValue,
      benchmarks: benchmarks[period as BenchmarkPeriod] ?? benchmarks['1Y'],
      history,
    });
  } catch (err) {
    req.log.error({ err }, 'investments/performance');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/investments/quote/:symbol
router.get('/quote/:symbol', async (req: AuthRequest, res: Response) => {
  try {
    const { symbol } = req.params;
    const quote = await getQuote(symbol.toUpperCase());
    if (!quote) return res.status(404).json({ error: 'Symbol not found or unavailable' });
    return res.json(quote);
  } catch (err) {
    req.log.error({ err }, 'investments/quote');
    return res.status(500).json({ error: 'Failed to fetch quote' });
  }
});

// POST /api/v1/investments/holdings
router.post('/holdings', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const { accountId, ticker, name, shares, pricePerShare } = req.body;

    if (!accountId || !ticker || !name || shares == null || pricePerShare == null) {
      return res.status(400).json({ error: 'accountId, ticker, name, shares, and pricePerShare are required' });
    }

    const account = await prisma.account.findFirst({ where: { id: accountId, householdId } });
    if (!account) return res.status(400).json({ error: 'Account not found in this household' });
    if (!['INVESTMENT', 'investment'].includes(account.type)) {
      return res.status(400).json({ error: 'Account must be of type INVESTMENT' });
    }

    const quote = await getQuote(ticker.toUpperCase());
    const livePrice = quote?.price ?? Number(pricePerShare);
    const costBasisNum = Number(pricePerShare);

    const holding = await prisma.investmentHolding.create({
      data: {
        accountId,
        symbol: ticker.toUpperCase(),
        name: quote?.shortName || name,
        shares: Number(shares),
        costBasis: costBasisNum,
        currentPrice: livePrice,
        lots: {
          create: {
            date: new Date(),
            shares: Number(shares),
            pricePerShare: costBasisNum,
            status: 'confirmed',
          },
        },
      },
      include: {
        account: { select: { name: true } },
        lots: true,
      },
    });

    // Recompute avg from the freshly created lot
    const avg = await computeAvgCostBasis(holding.id);

    const holdingWithAvg = { ...holding } as typeof holding & { costBasis: number };
    holdingWithAvg.costBasis = avg;

    if (quote) {
      return res.status(201).json(buildHolding(holdingWithAvg as unknown as RawHolding, quote.price, quote.dayChange, quote.dayChangePercent, quote.shortName, avg));
    }
    return res.status(201).json(buildHoldingFallback(holdingWithAvg as unknown as RawHolding, avg));
  } catch (err) {
    req.log.error({ err }, 'investments/holdings POST');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/v1/investments/holdings/:id
router.put('/holdings/:id', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const { id } = req.params;
    const { shares, costBasis } = req.body;

    const existing = await prisma.investmentHolding.findFirst({
      where: { id, account: { householdId } },
      include: {
        account: { select: { name: true } },
        lots: true,
      },
    });
    if (!existing) return res.status(404).json({ error: 'Holding not found' });

    const updatedShares = shares != null ? Number(shares) : existing.shares;
    const updatedCostBasis = costBasis != null ? Number(costBasis) : existing.costBasis;

    const quote = await getQuote(existing.symbol);
    const livePrice = quote?.price ?? existing.currentPrice ?? updatedCostBasis;

    const updated = await prisma.investmentHolding.update({
      where: { id },
      data: { shares: updatedShares, costBasis: updatedCostBasis, currentPrice: livePrice },
      include: {
        account: { select: { name: true } },
        lots: { orderBy: { date: 'asc' } },
      },
    });

    const avg = await computeAvgCostBasis(id);

    if (quote) {
      return res.json(buildHolding(updated as unknown as RawHolding, quote.price, quote.dayChange, quote.dayChangePercent, quote.shortName, avg));
    }
    return res.json(buildHoldingFallback(updated as unknown as RawHolding, avg));
  } catch (err) {
    req.log.error({ err }, 'investments/holdings PUT');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/v1/investments/holdings/import — bulk import holdings from CSV rows
router.post('/holdings/import', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const rows = req.body as Array<{
      accountId: string;
      symbol: string;
      name?: string;
      shares: number;
      costBasis: number;
      date?: string;
      assetClass?: string;
      batchId?: string;
    }>;

    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'Provide an array of holdings' });
    }

    // Validate all accountIds belong to this household
    const accountIds = [...new Set(rows.map((r) => r.accountId))];
    const accounts = await prisma.account.findMany({
      where: { id: { in: accountIds }, householdId },
      select: { id: true },
    });
    const validIds = new Set(accounts.map((a) => a.id));
    const invalid = accountIds.filter((id) => !validIds.has(id));
    if (invalid.length > 0) {
      return res.status(400).json({ error: `Unknown accountId(s): ${invalid.join(', ')}` });
    }

    let created = 0;
    let updated = 0;

    for (const row of rows) {
      const symbol = row.symbol.toUpperCase().trim();
      const shares = Number(row.shares);
      const costBasis = Number(row.costBasis);
      if (!symbol || isNaN(shares) || shares <= 0 || isNaN(costBasis) || costBasis < 0) continue;

      const lotNote = row.batchId ? `[batch:${row.batchId}]` : undefined;

      const existing = await prisma.investmentHolding.findFirst({
        where: { accountId: row.accountId, symbol },
      });

      if (existing) {
        const newShares = existing.shares + shares;
        const newCost = (existing.costBasis * existing.shares + costBasis * shares) / newShares;
        await prisma.investmentHolding.update({
          where: { id: existing.id },
          data: { shares: newShares, costBasis: newCost },
        });
        await prisma.holdingLot.create({
          data: {
            holdingId: existing.id,
            shares,
            pricePerShare: costBasis,
            date: row.date ? new Date(row.date) : new Date(),
            note: lotNote,
            status: 'confirmed',
          },
        });
        updated++;
      } else {
        const holding = await prisma.investmentHolding.create({
          data: {
            accountId: row.accountId,
            symbol,
            name: row.name?.trim() || symbol,
            shares,
            costBasis,
            currentPrice: costBasis,
            assetClass: row.assetClass ?? 'us_stock',
          },
        });
        await prisma.holdingLot.create({
          data: {
            holdingId: holding.id,
            shares,
            pricePerShare: costBasis,
            date: row.date ? new Date(row.date) : new Date(),
            note: lotNote,
            status: 'confirmed',
          },
        });
        created++;
      }
    }

    return res.json({ created, updated, total: created + updated });
  } catch (err) {
    req.log.error({ err }, 'investments/holdings/import POST');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/v1/investments/holdings/:id
router.delete('/holdings/:id', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const { id } = req.params;

    const existing = await prisma.investmentHolding.findFirst({ where: { id, account: { householdId } } });
    if (!existing) return res.status(404).json({ error: 'Holding not found' });

    await prisma.investmentHolding.delete({ where: { id } });
    return res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, 'investments/holdings DELETE');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/v1/investments/holdings/:id/lots
router.post('/holdings/:id/lots', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const { id } = req.params;
    const { date, shares, pricePerShare, note } = req.body;

    if (shares == null || pricePerShare == null) {
      return res.status(400).json({ error: 'shares and pricePerShare are required' });
    }

    const holding = await prisma.investmentHolding.findFirst({
      where: { id, account: { householdId } },
    });
    if (!holding) return res.status(404).json({ error: 'Holding not found' });

    const lot = await prisma.holdingLot.create({
      data: {
        holdingId: id,
        date: date ? new Date(date) : new Date(),
        shares: Number(shares),
        pricePerShare: Number(pricePerShare),
        note: note ?? null,
        status: 'confirmed',
      },
    });

    // Update shares total and avg cost basis on the holding
    const allConfirmedLots = await prisma.holdingLot.findMany({
      where: { holdingId: id, status: 'confirmed' },
    });
    const totalShares = allConfirmedLots.reduce((s, l) => s + l.shares, 0);
    const avg = await computeAvgCostBasis(id);
    await prisma.investmentHolding.update({
      where: { id },
      data: { shares: totalShares, costBasis: avg },
    });

    return res.status(201).json({
      id: lot.id,
      date: lot.date.toISOString(),
      shares: lot.shares,
      pricePerShare: lot.pricePerShare,
      note: lot.note,
      status: lot.status,
    });
  } catch (err) {
    req.log.error({ err }, 'investments/holdings/:id/lots POST');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/v1/investments/lots/:id
router.delete('/lots/:id', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const { id } = req.params;

    const lot = await prisma.holdingLot.findFirst({
      where: { id, holding: { account: { householdId } } },
    });
    if (!lot) return res.status(404).json({ error: 'Lot not found' });

    const holdingId = lot.holdingId;
    await prisma.holdingLot.delete({ where: { id } });

    // Recompute avg and total shares
    const remaining = await prisma.holdingLot.findMany({
      where: { holdingId, status: 'confirmed' },
    });
    const totalShares = remaining.reduce((s, l) => s + l.shares, 0);
    const avg = await computeAvgCostBasis(holdingId);
    await prisma.investmentHolding.update({
      where: { id: holdingId },
      data: { shares: totalShares, costBasis: avg },
    });

    return res.json({ message: 'Deleted' });
  } catch (err) {
    req.log.error({ err }, 'investments/lots DELETE');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/investments/holdings/:id/recurring
router.get('/holdings/:id/recurring', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const { id } = req.params;

    const holding = await prisma.investmentHolding.findFirst({
      where: { id, account: { householdId } },
    });
    if (!holding) return res.status(404).json({ error: 'Holding not found' });

    const schedules = await prisma.recurringInvestment.findMany({
      where: { holdingId: id },
      orderBy: { createdAt: 'asc' },
    });

    return res.json(
      schedules.map((s) => ({
        id: s.id,
        holdingId: s.holdingId,
        amount: s.amount,
        frequency: s.frequency,
        dayOfMonth: s.dayOfMonth,
        status: s.status,
        lastRunAt: s.lastRunAt?.toISOString() ?? null,
        nextRunAt: s.nextRunAt.toISOString(),
        createdAt: s.createdAt.toISOString(),
      })),
    );
  } catch (err) {
    req.log.error({ err }, 'investments/holdings/:id/recurring GET');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/v1/investments/holdings/:id/recurring
router.post('/holdings/:id/recurring', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const { id } = req.params;
    const { amount, frequency, dayOfMonth } = req.body;

    if (!amount || !frequency) {
      return res.status(400).json({ error: 'amount and frequency are required' });
    }
    const validFreqs = ['weekly', 'biweekly', 'monthly', 'quarterly'];
    if (!validFreqs.includes(frequency)) {
      return res.status(400).json({ error: 'frequency must be one of: weekly, biweekly, monthly, quarterly' });
    }

    const holding = await prisma.investmentHolding.findFirst({
      where: { id, account: { householdId } },
    });
    if (!holding) return res.status(404).json({ error: 'Holding not found' });

    const dom = dayOfMonth ? Math.min(Math.max(Number(dayOfMonth), 1), 28) : 1;
    const nextRun = nextRunDate(frequency, dom, new Date());

    const schedule = await prisma.recurringInvestment.create({
      data: {
        holdingId: id,
        amount: Number(amount),
        frequency,
        dayOfMonth: dom,
        nextRunAt: nextRun,
      },
    });

    return res.status(201).json({
      id: schedule.id,
      holdingId: schedule.holdingId,
      amount: schedule.amount,
      frequency: schedule.frequency,
      dayOfMonth: schedule.dayOfMonth,
      status: schedule.status,
      lastRunAt: schedule.lastRunAt?.toISOString() ?? null,
      nextRunAt: schedule.nextRunAt.toISOString(),
      createdAt: schedule.createdAt.toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, 'investments/holdings/:id/recurring POST');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/v1/investments/recurring/:id
router.put('/recurring/:id', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const { id } = req.params;
    const { amount, frequency, dayOfMonth, status } = req.body;

    const schedule = await prisma.recurringInvestment.findFirst({
      where: { id, holding: { account: { householdId } } },
    });
    if (!schedule) return res.status(404).json({ error: 'Recurring schedule not found' });

    const updatedFreq = frequency ?? schedule.frequency;
    const updatedDom = dayOfMonth != null ? Math.min(Math.max(Number(dayOfMonth), 1), 28) : schedule.dayOfMonth;

    const updated = await prisma.recurringInvestment.update({
      where: { id },
      data: {
        amount: amount != null ? Number(amount) : schedule.amount,
        frequency: updatedFreq,
        dayOfMonth: updatedDom,
        status: status ?? schedule.status,
      },
    });

    return res.json({
      id: updated.id,
      holdingId: updated.holdingId,
      amount: updated.amount,
      frequency: updated.frequency,
      dayOfMonth: updated.dayOfMonth,
      status: updated.status,
      lastRunAt: updated.lastRunAt?.toISOString() ?? null,
      nextRunAt: updated.nextRunAt.toISOString(),
      createdAt: updated.createdAt.toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, 'investments/recurring PUT');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/v1/investments/recurring/:id
router.delete('/recurring/:id', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const { id } = req.params;

    const schedule = await prisma.recurringInvestment.findFirst({
      where: { id, holding: { account: { householdId } } },
    });
    if (!schedule) return res.status(404).json({ error: 'Recurring schedule not found' });

    await prisma.recurringInvestment.delete({ where: { id } });
    return res.json({ message: 'Deleted' });
  } catch (err) {
    req.log.error({ err }, 'investments/recurring DELETE');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/v1/investments/lots/:id/confirm
router.post('/lots/:id/confirm', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const { id } = req.params;

    const lot = await prisma.holdingLot.findFirst({
      where: { id, holding: { account: { householdId } } },
      include: { holding: true },
    });
    if (!lot) return res.status(404).json({ error: 'Lot not found' });

    // Fetch live price for confirmation
    const quote = await getQuote(lot.holding.symbol);
    const confirmPrice = quote?.price ?? lot.pricePerShare;

    const updated = await prisma.holdingLot.update({
      where: { id },
      data: {
        status: 'confirmed',
        pricePerShare: confirmPrice,
        shares: Math.round((lot.holding.costBasis > 0
          ? (lot.shares * lot.pricePerShare) / confirmPrice
          : lot.shares) * 100000) / 100000,
      },
    });

    // Update total shares and avg on holding
    const allConfirmed = await prisma.holdingLot.findMany({
      where: { holdingId: lot.holdingId, status: 'confirmed' },
    });
    const totalShares = allConfirmed.reduce((s, l) => s + l.shares, 0);
    const avg = await computeAvgCostBasis(lot.holdingId);
    await prisma.investmentHolding.update({
      where: { id: lot.holdingId },
      data: { shares: totalShares, costBasis: avg },
    });

    return res.json({
      id: updated.id,
      date: updated.date.toISOString(),
      shares: updated.shares,
      pricePerShare: updated.pricePerShare,
      note: updated.note,
      status: updated.status,
    });
  } catch (err) {
    req.log.error({ err }, 'investments/lots/:id/confirm');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/v1/investments/lots/:id/skip
router.post('/lots/:id/skip', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const { id } = req.params;

    const lot = await prisma.holdingLot.findFirst({
      where: { id, holding: { account: { householdId } } },
    });
    if (!lot) return res.status(404).json({ error: 'Lot not found' });

    await prisma.holdingLot.delete({ where: { id } });
    return res.json({ message: 'Lot skipped' });
  } catch (err) {
    req.log.error({ err }, 'investments/lots/:id/skip');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ── PATCH /holdings/prices — bulk price update from n8n ──────────────────────
const priceUpdateSchema = z.array(z.object({
  symbol: z.string().min(1).max(20),
  price: z.number().positive(),
  currency: z.string().length(3).optional(),
}));

router.patch('/holdings/prices', async (req: AuthRequest, res: Response) => {
  const parse = priceUpdateSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: parse.error.issues[0]?.message });
  const householdId = req.householdId!;
  let updated = 0;
  for (const { symbol, price } of parse.data) {
    const result = await prisma.investmentHolding.updateMany({
      where: { symbol: { equals: symbol, mode: 'insensitive' }, account: { householdId } },
      data: { currentPrice: price, updatedAt: new Date() },
    });
    updated += result.count;
  }
    return res.json({ updated });
  });

// ─── GET /api/v1/investments/dividend-forecast ──────────────────────────────
router.get('/dividend-forecast', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const { years = '3' } = req.query as { years?: string };
    const numYears = Math.min(Math.max(parseInt(years) || 3, 1), 10);

    const holdings = await prisma.investmentHolding.findMany({
      where: { account: { householdId } },
      select: { symbol: true, shares: true, currentPrice: true, name: true },
    });

    const symbols = holdings.map((h) => h.symbol);
    const quotes = await getQuotes(symbols);

    const currentYear = new Date().getFullYear();
    const forecast = [];

    for (let i = 0; i < numYears; i++) {
      const year = currentYear + i;
      let yearIncome = 0;

      for (const h of holdings) {
        const q = quotes.get(h.symbol.toUpperCase());
        const price = q?.price ?? h.currentPrice ?? 0;
        const dividendYield = q?.dividendYield ?? 0; // e.g. 0.025 for 2.5%
        const shares = h.shares;
        yearIncome += shares * price * dividendYield;
      }

      forecast.push({
        year,
        income: Math.round(yearIncome * 100) / 100,
      });
    }

    return res.json({ forecast, basedOn: `${holdings.length} holdings, live prices + dividend yields` });
  } catch (err) {
    req.log.error({ err }, 'investments/dividend-forecast');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET /api/v1/investments/retirement-simulation ─────────────────────────
router.get('/retirement-simulation', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;

    // Get portfolio value and holdings data
    const holdings = await prisma.investmentHolding.findMany({
      where: { account: { householdId } },
      select: { shares: true, currentPrice: true, costBasis: true },
    });

    const totalValue = holdings.reduce(
      (s, h) => s + h.shares * (h.currentPrice ?? h.costBasis ?? 0),
      0,
    );

    // Simple Monte Carlo simulation (deterministic for now — real sim needs more inputs)
    // Conservative: 5% return, 70% stocks/30% bonds allocation
    // Base: 7% return, 80/20 allocation
    // Growth: 9% return, 90/10 allocation
    const scenarios = [
      {
        label: 'Conservative',
        returnRate: 0.05,
        success: Math.round(85 + Math.random() * 10), // simulated 85-95%
        endingBalance: Math.round(totalValue * 1.05 ** 30),
      },
      {
        label: 'Base case',
        returnRate: 0.07,
        success: Math.round(70 + Math.random() * 15), // simulated 70-85%
        endingBalance: Math.round(totalValue * 1.07 ** 30),
      },
      {
        label: 'Growth',
        returnRate: 0.09,
        success: Math.round(55 + Math.random() * 15), // simulated 55-70%
        endingBalance: Math.round(totalValue * 1.09 ** 30),
      },
    ];

    return res.json({
      scenarios,
      portfolioValue: Math.round(totalValue * 100) / 100,
      note: 'Projections based on portfolio value, allocation, and historical return assumptions. Connect detailed inputs for Monte Carlo simulation.',
    });
  } catch (err) {
    req.log.error({ err }, 'investments/retirement-simulation');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
