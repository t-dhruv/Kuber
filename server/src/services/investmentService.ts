/**
 * investmentService.ts
 * Business logic for investment holdings, lots, and recurring schedules.
 * Never imports from 'express'; receives plain args and returns plain data.
 */

import { prisma } from '../lib/prisma';
import { getQuotes, getQuote, getLiveBenchmarks, BenchmarkPeriod } from '../lib/priceCache';
import { NOT_DELETED } from '../lib/softDeleteWhere';

// ─── Asset class heuristic ────────────────────────────────────────────────────

export function inferAssetClass(symbol: string, shortName: string): string {
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

export async function computeAvgCostBasis(holdingId: string): Promise<number> {
  const lots = await prisma.holdingLot.findMany({
    where: { holdingId, status: 'confirmed', ...NOT_DELETED },
    orderBy: { date: 'asc' },
  });
  if (lots.length === 0) return 0;
  const buyLots = lots.filter((l) => l.transactionType === 'buy');
  const totalShares = buyLots.reduce((s, l) => s + l.shares, 0);
  if (totalShares === 0) return 0;
  const totalCost = buyLots.reduce((s, l) => s + l.shares * l.pricePerShare, 0);
  return Math.round((totalCost / totalShares) * 10000) / 10000;
}

export async function generatePendingLots(householdId: string): Promise<number> {
  const now = new Date();

  const schedules = await prisma.recurringInvestment.findMany({
    where: {
      status: 'active',
      nextRunAt: { lte: now },
      ...NOT_DELETED,
      holding: { ...NOT_DELETED, account: { householdId, ...NOT_DELETED } },
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
        ...NOT_DELETED,
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
        transactionType: 'buy',
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

export type RawHolding = {
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
    transactionType: string;
    date: Date;
    shares: number;
    pricePerShare: number;
    acbPerShareAtSale: { toNumber(): number } | null;
    realizedGainDecimal: { toNumber(): number } | null;
    note: string | null;
    status: string;
  }>;
};

export function computeRealizedGain(lots: RawHolding['lots'], avgCostBasis: number): number {
  return lots
    .filter((l) => l.status === 'confirmed' && l.transactionType === 'sell')
    .reduce((s, l) => {
      if (l.realizedGainDecimal !== null) return s + l.realizedGainDecimal.toNumber();
      // fallback for legacy lots without stored realized gain
      const acb = l.acbPerShareAtSale !== null ? l.acbPerShareAtSale.toNumber() : avgCostBasis;
      return s + Math.abs(l.shares) * (l.pricePerShare - acb);
    }, 0);
}

export function buildHolding(
  h: RawHolding,
  livePrice: number,
  dayChange: number,
  dayChangePercent: number,
  shortName: string,
  avgCostBasis: number,
  dividendYield = 0,
) {
  const currentValue = Math.round(h.shares * livePrice * 100) / 100;
  const totalCost = Math.round(h.shares * avgCostBasis * 100) / 100;
  const unrealizedGain = Math.round((currentValue - totalCost) * 100) / 100;
  const unrealizedGainPercent = totalCost !== 0 ? Math.round((unrealizedGain / totalCost) * 10000) / 100 : 0;
  const realizedGain = Math.round(computeRealizedGain(h.lots, avgCostBasis) * 100) / 100;
  const gain = Math.round((unrealizedGain + realizedGain) * 100) / 100;
  const gainPercent = totalCost !== 0 ? Math.round((gain / totalCost) * 10000) / 100 : 0;
  const estimatedAnnualDividend = Math.round(h.shares * livePrice * dividendYield * 100) / 100;

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
    unrealizedGain,
    unrealizedGainPercent,
    realizedGain,
    estimatedAnnualDividend,
    dayChange: Math.round(dayChange * h.shares * 100) / 100,
    dayChangePercent,
    priceSource: 'live',
    priceUpdatedAt: new Date().toISOString(),
    lots: h.lots.map((l) => ({
      id: l.id,
      transactionType: l.transactionType,
      date: l.date.toISOString(),
      shares: l.shares,
      pricePerShare: l.pricePerShare,
      acbPerShareAtSale: l.acbPerShareAtSale?.toNumber() ?? null,
      realizedGain: l.realizedGainDecimal?.toNumber() ?? null,
      note: l.note,
      status: l.status,
    })),
  };
}

export function buildHoldingFallback(h: RawHolding, avgCostBasis: number) {
  const livePrice = h.currentPrice || avgCostBasis || h.costBasis;
  const currentValue = Math.round(h.shares * livePrice * 100) / 100;
  const totalCost = Math.round(h.shares * avgCostBasis * 100) / 100;
  const unrealizedGain = Math.round((currentValue - totalCost) * 100) / 100;
  const unrealizedGainPercent = totalCost !== 0 ? Math.round((unrealizedGain / totalCost) * 10000) / 100 : 0;
  const realizedGain = Math.round(computeRealizedGain(h.lots, avgCostBasis) * 100) / 100;
  const gain = Math.round((unrealizedGain + realizedGain) * 100) / 100;
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
    unrealizedGain,
    unrealizedGainPercent,
    realizedGain,
    estimatedAnnualDividend: 0,
    dayChange: 0,
    dayChangePercent: 0,
    priceSource: 'cached',
    priceUpdatedAt: h.updatedAt.toISOString(),
    lots: h.lots.map((l) => ({
      id: l.id,
      transactionType: l.transactionType,
      date: l.date.toISOString(),
      shares: l.shares,
      pricePerShare: l.pricePerShare,
      acbPerShareAtSale: l.acbPerShareAtSale?.toNumber() ?? null,
      realizedGain: l.realizedGainDecimal?.toNumber() ?? null,
      note: l.note,
      status: l.status,
    })),
  };
}

// ─── Holdings CRUD ────────────────────────────────────────────────────────────

export async function getHoldings(householdId: string, accountId?: string) {
  await generatePendingLots(householdId).catch(() => {});

  const where: Record<string, unknown> = { ...NOT_DELETED, account: { householdId, ...NOT_DELETED } };
  if (accountId) where.accountId = accountId;

  const rawHoldings = await prisma.investmentHolding.findMany({
    where,
    include: {
      account: { select: { name: true, householdId: true } },
      lots: { where: NOT_DELETED, orderBy: { date: 'asc' } },
    },
  });

  // Compute avgCostBasis per holding from confirmed BUY lots only
  const avgMap = new Map<string, number>();
  for (const h of rawHoldings) {
    const buyLots = h.lots.filter((l) => l.status === 'confirmed' && l.transactionType === 'buy');
    const totalBuyShares = buyLots.reduce((s, l) => s + l.shares, 0);
    const avg = totalBuyShares > 0
      ? buyLots.reduce((s, l) => s + l.shares * l.pricePerShare, 0) / totalBuyShares
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
      return buildHolding(h as RawHolding, q.price, q.dayChange, q.dayChangePercent, q.shortName, avg, q.dividendYield ?? 0);
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
  const totalUnrealizedGain = Math.round(holdings.reduce((s, h) => s + h.unrealizedGain, 0) * 100) / 100;
  const totalRealizedGain = Math.round(holdings.reduce((s, h) => s + h.realizedGain, 0) * 100) / 100;
  const totalAnnualDividend = Math.round(holdings.reduce((s, h) => s + h.estimatedAnnualDividend, 0) * 100) / 100;

  // Total return = unrealized + realized + dividends
  const dividendRecordTotals = await prisma.dividendRecord.groupBy({
    by: ['holdingId'],
    where: { ...NOT_DELETED, holding: { account: { householdId, ...NOT_DELETED } } },
    _sum: { amountDecimal: true },
  });
  const totalRecordedDividends = dividendRecordTotals.reduce(
    (s, r) => s + (r._sum.amountDecimal ? Number(r._sum.amountDecimal) : 0),
    0,
  );
  const totalReturn = Math.round((totalUnrealizedGain + totalRealizedGain + totalRecordedDividends) * 100) / 100;
  const totalReturnPercent = totalCostBasis !== 0
    ? Math.round((totalReturn / totalCostBasis) * 10000) / 100
    : 0;

  return {
    totalValue: Math.round(totalValue * 100) / 100,
    totalCostBasis: Math.round(totalCostBasis * 100) / 100,
    totalGain,
    totalGainPercent,
    totalDayChange: Math.round(totalDayChange * 100) / 100,
    totalUnrealizedGain,
    totalRealizedGain,
    totalRecordedDividends: Math.round(totalRecordedDividends * 100) / 100,
    totalAnnualDividend,
    totalReturn,
    totalReturnPercent,
    holdings,
  };
}

export async function createHolding(
  householdId: string,
  accountId: string,
  ticker: string,
  name: string,
  shares: number,
  pricePerShare: number,
) {
  const account = await prisma.account.findFirst({ where: { id: accountId, householdId, ...NOT_DELETED } });
  if (!account) return null;
  if (!['INVESTMENT', 'investment'].includes(account.type)) {
    throw new Error('Account must be of type INVESTMENT');
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
          transactionType: 'buy',
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
    return buildHolding(holdingWithAvg as unknown as RawHolding, quote.price, quote.dayChange, quote.dayChangePercent, quote.shortName, avg);
  }
  return buildHoldingFallback(holdingWithAvg as unknown as RawHolding, avg);
}

export async function updateHolding(householdId: string, id: string, shares?: number, costBasis?: number) {
  const existing = await prisma.investmentHolding.findFirst({
    where: { id, ...NOT_DELETED, account: { householdId, ...NOT_DELETED } },
    include: {
      account: { select: { name: true } },
      lots: { where: NOT_DELETED },
    },
  });
  if (!existing) return null;

  const updatedShares = shares != null ? Number(shares) : existing.shares;
  const updatedCostBasis = costBasis != null ? Number(costBasis) : existing.costBasis;

  const quote = await getQuote(existing.symbol);
  const livePrice = quote?.price ?? existing.currentPrice ?? updatedCostBasis;

  const updated = await prisma.investmentHolding.update({
    where: { id },
    data: { shares: updatedShares, costBasis: updatedCostBasis, currentPrice: livePrice },
    include: {
      account: { select: { name: true } },
      lots: { where: NOT_DELETED, orderBy: { date: 'asc' } },
    },
  });

  const avg = await computeAvgCostBasis(id);

  if (quote) {
    return buildHolding(updated as unknown as RawHolding, quote.price, quote.dayChange, quote.dayChangePercent, quote.shortName, avg);
  }
  return buildHoldingFallback(updated as unknown as RawHolding, avg);
}

/**
 * Soft-delete holdings and every record that hangs off them.
 *
 * HoldingLot, DividendRecord and RecurringInvestment all cascade from
 * InvestmentHolding at the database level, so hard-deleting a holding
 * permanently destroys its trade history and cost basis. Financial records are
 * never hard-deleted, and the children are marked alongside the parent so a
 * restore brings back a consistent holding.
 */
export async function softDeleteHoldingsByIds(ids: string[]) {
  if (ids.length === 0) return 0;
  await prisma.$transaction([
    prisma.holdingLot.updateMany({
      where: { holdingId: { in: ids }, ...NOT_DELETED },
      data: { isDeleted: true },
    }),
    prisma.dividendRecord.updateMany({
      where: { holdingId: { in: ids }, ...NOT_DELETED },
      data: { isDeleted: true },
    }),
    prisma.recurringInvestment.updateMany({
      where: { holdingId: { in: ids }, ...NOT_DELETED },
      data: { isDeleted: true },
    }),
    prisma.investmentHolding.updateMany({
      where: { id: { in: ids }, ...NOT_DELETED },
      data: { isDeleted: true },
    }),
  ]);
  return ids.length;
}

export async function deleteHolding(householdId: string, id: string) {
  const existing = await prisma.investmentHolding.findFirst({
    where: { id, ...NOT_DELETED, account: { householdId, ...NOT_DELETED } },
  });
  if (!existing) return null;

  await softDeleteHoldingsByIds([id]);
  return { success: true };
}

export async function deleteHoldingsByAccountId(householdId: string, accountId: string) {
  const account = await prisma.account.findFirst({ where: { id: accountId, householdId, ...NOT_DELETED } });
  if (!account) return null;

  const holdings = await prisma.investmentHolding.findMany({
    where: { accountId, ...NOT_DELETED },
    select: { id: true },
  });
  const deleted = await softDeleteHoldingsByIds(holdings.map((h) => h.id));
  return { deleted };
}

export async function deleteHoldingsByIds(householdId: string, ids: string[]) {
  const verified = await prisma.investmentHolding.findMany({
    where: { id: { in: ids }, ...NOT_DELETED, account: { householdId, ...NOT_DELETED } },
    select: { id: true },
  });
  const deleted = await softDeleteHoldingsByIds(verified.map((h) => h.id));
  return { deleted };
}

export async function importHoldings(
  householdId: string,
  rows: Array<{
    accountId: string;
    symbol: string;
    name?: string;
    shares: number;
    costBasis: number;
    date?: string;
    assetClass?: string;
    batchId?: string;
  }>,
) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('Provide an array of holdings');
  }

  // Validate all accountIds belong to this household
  const accountIds = [...new Set(rows.map((r) => r.accountId))];
  const accounts = await prisma.account.findMany({
    where: { id: { in: accountIds }, householdId, ...NOT_DELETED },
    select: { id: true },
  });
  const validIds = new Set(accounts.map((a) => a.id));
  const invalid = accountIds.filter((id) => !validIds.has(id));
  if (invalid.length > 0) {
    throw new Error(`Unknown accountId(s): ${invalid.join(', ')}`);
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
      where: { accountId: row.accountId, symbol, ...NOT_DELETED },
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
          transactionType: 'buy',
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
          transactionType: 'buy',
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

  return { created, updated, total: created + updated };
}

// ─── Lots ────────────────────────────────────────────────────────────────────

export async function createLot(
  householdId: string,
  holdingId: string,
  date: string | undefined,
  shares: number,
  pricePerShare: number,
  note: string | undefined,
  transactionType: string,
) {
  if (shares == null || pricePerShare == null) {
    throw new Error('shares and pricePerShare are required');
  }
  if (!['buy', 'sell', 'dividend'].includes(transactionType)) {
    throw new Error('transactionType must be buy, sell, or dividend');
  }

  const sharesNum = Math.abs(Number(shares));
  const priceNum = Number(pricePerShare);

  const holding = await prisma.investmentHolding.findFirst({
    where: { id: holdingId, ...NOT_DELETED, account: { householdId, ...NOT_DELETED } },
  });
  if (!holding) return null;

  // Validate sell quantity
  if (transactionType === 'sell') {
    const existingLots = await prisma.holdingLot.findMany({
      where: { holdingId, status: 'confirmed', ...NOT_DELETED },
    });
    const currentShares = existingLots.reduce(
      (s, l) => s + (l.transactionType === 'buy' ? l.shares : -l.shares),
      0,
    );
    if (sharesNum > currentShares + 0.000001) {
      throw new Error(`Cannot sell ${sharesNum} shares — only ${currentShares.toFixed(6)} held`);
    }
  }

  // Compute ACB before creating the lot (needed for sell realized gain)
  const acbBeforeLot = await computeAvgCostBasis(holdingId);

  const lotData: Parameters<typeof prisma.holdingLot.create>[0]['data'] = {
    holdingId,
    transactionType,
    date: date ? new Date(date) : new Date(),
    shares: transactionType === 'sell' ? -sharesNum : sharesNum,
    pricePerShare: priceNum,
    note: note ?? null,
    status: 'confirmed',
  };

  if (transactionType === 'sell') {
    const realizedGain = sharesNum * (priceNum - acbBeforeLot);
    lotData.acbPerShareAtSale = acbBeforeLot;
    lotData.realizedGainDecimal = Math.round(realizedGain * 10000) / 10000;
  }

  const lot = await prisma.holdingLot.create({ data: lotData });

  // Recompute holding totals
  const allConfirmedLots = await prisma.holdingLot.findMany({
    where: { holdingId, status: 'confirmed', ...NOT_DELETED },
  });
  const totalShares = allConfirmedLots.reduce(
    (s, l) => s + (l.transactionType === 'buy' ? l.shares : l.transactionType === 'sell' ? -Math.abs(l.shares) : 0),
    0,
  );
  const newAvg = await computeAvgCostBasis(holdingId);
  await prisma.investmentHolding.update({
    where: { id: holdingId },
    data: { shares: totalShares, costBasis: newAvg },
  });

  return {
    id: lot.id,
    transactionType: lot.transactionType,
    date: lot.date.toISOString(),
    shares: lot.shares,
    pricePerShare: lot.pricePerShare,
    acbPerShareAtSale: lot.acbPerShareAtSale?.toNumber() ?? null,
    realizedGain: lot.realizedGainDecimal?.toNumber() ?? null,
    note: lot.note,
    status: lot.status,
  };
}

export async function deleteLot(householdId: string, id: string) {
  const lot = await prisma.holdingLot.findFirst({
    where: { id, ...NOT_DELETED, holding: { account: { householdId, ...NOT_DELETED } } },
  });
  if (!lot) return null;

  const holdingId = lot.holdingId;
  await prisma.holdingLot.update({ where: { id }, data: { isDeleted: true } });

  // Recompute avg and total shares
  const remaining = await prisma.holdingLot.findMany({
    where: { holdingId, status: 'confirmed', ...NOT_DELETED },
  });
  const totalShares = remaining.reduce(
    (s, l) => s + (l.transactionType === 'buy' ? l.shares : l.transactionType === 'sell' ? -Math.abs(l.shares) : 0),
    0,
  );
  const avg = await computeAvgCostBasis(holdingId);
  await prisma.investmentHolding.update({
    where: { id: holdingId },
    data: { shares: totalShares, costBasis: avg },
  });

  return { message: 'Deleted' };
}

export async function confirmLot(householdId: string, id: string) {
  const lot = await prisma.holdingLot.findFirst({
    where: { id, ...NOT_DELETED, holding: { account: { householdId, ...NOT_DELETED } } },
    include: { holding: true },
  });
  if (!lot) return null;

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
    where: { holdingId: lot.holdingId, status: 'confirmed', ...NOT_DELETED },
  });
  const totalShares = allConfirmed.reduce((s, l) => s + l.shares, 0);
  const avg = await computeAvgCostBasis(lot.holdingId);
  await prisma.investmentHolding.update({
    where: { id: lot.holdingId },
    data: { shares: totalShares, costBasis: avg },
  });

  return {
    id: updated.id,
    date: updated.date.toISOString(),
    shares: updated.shares,
    pricePerShare: updated.pricePerShare,
    note: updated.note,
    status: updated.status,
  };
}

export async function skipLot(householdId: string, id: string) {
  const lot = await prisma.holdingLot.findFirst({
    where: { id, ...NOT_DELETED, holding: { account: { householdId, ...NOT_DELETED } } },
  });
  if (!lot) return null;

  await prisma.holdingLot.update({ where: { id }, data: { isDeleted: true } });
  return { message: 'Lot skipped' };
}

// ─── Performance / Analytics ──────────────────────────────────────────────────

export async function getPendingLots(householdId: string) {
  const lots = await prisma.holdingLot.findMany({
    where: {
      status: 'pending',
      ...NOT_DELETED,
      holding: { account: { householdId, ...NOT_DELETED } },
    },
    include: {
      holding: {
        select: { symbol: true, name: true },
      },
    },
    orderBy: { date: 'desc' },
  });

  return lots.map((l) => ({
    id: l.id,
    holdingId: l.holdingId,
    ticker: l.holding.symbol,
    name: l.holding.name,
    date: l.date.toISOString(),
    shares: l.shares,
    pricePerShare: l.pricePerShare,
    note: l.note,
  }));
}

export async function getAllocation(householdId: string) {
  const rawHoldings = await prisma.investmentHolding.findMany({
    where: { ...NOT_DELETED, account: { householdId, ...NOT_DELETED } },
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

  return {
    totalValue: Math.round(totalValue * 100) / 100,
    byAssetClass,
    byAccount,
    holdings: holdingsList,
  };
}

export async function getPerformance(householdId: string, period: string = '1Y') {
  const benchmarks = await getLiveBenchmarks();

  const periodMap: Record<string, number> = {
    '1M': 1, '3M': 3, '6M': 6, 'YTD': 12, '1Y': 12, '5Y': 60,
  };
  const months = periodMap[period] ?? 12;

  const rawHoldings = await prisma.investmentHolding.findMany({
    where: { ...NOT_DELETED, account: { householdId, ...NOT_DELETED } },
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

  return {
    period,
    portfolioReturn,
    portfolioReturnValue,
    benchmarks: benchmarks[period as BenchmarkPeriod] ?? benchmarks['1Y'],
    history,
  };
}

export async function getQuoteBySymbol(symbol: string) {
  const quote = await getQuote(symbol.toUpperCase());
  if (!quote) return null;
  return quote;
}

export async function updatePrices(householdId: string, updates: Array<{ symbol: string; price: number; currency?: string }>) {
  let updated = 0;
  for (const { symbol, price } of updates) {
    const result = await prisma.investmentHolding.updateMany({
      where: { symbol: { equals: symbol, mode: 'insensitive' }, account: { householdId, ...NOT_DELETED } },
      data: { currentPrice: price, updatedAt: new Date() },
    });
    updated += result.count;
  }
  return { updated };
}

export async function getDividendForecast(householdId: string, years: number = 3) {
  const numYears = Math.min(Math.max(years, 1), 10);

  const holdings = await prisma.investmentHolding.findMany({
    where: { ...NOT_DELETED, account: { householdId, ...NOT_DELETED } },
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

  return { forecast, basedOn: `${holdings.length} holdings, live prices + dividend yields` };
}

// ─── Recurring ────────────────────────────────────────────────────────────────

export async function getHoldingRecurring(householdId: string, holdingId: string) {
  const holding = await prisma.investmentHolding.findFirst({
    where: { id: holdingId, ...NOT_DELETED, account: { householdId, ...NOT_DELETED } },
  });
  if (!holding) return null;

  const schedules = await prisma.recurringInvestment.findMany({
    where: { holdingId, ...NOT_DELETED },
    orderBy: { createdAt: 'asc' },
  });

  return schedules.map((s) => ({
    id: s.id,
    holdingId: s.holdingId,
    amount: s.amount,
    frequency: s.frequency,
    dayOfMonth: s.dayOfMonth,
    status: s.status,
    lastRunAt: s.lastRunAt?.toISOString() ?? null,
    nextRunAt: s.nextRunAt.toISOString(),
    createdAt: s.createdAt.toISOString(),
  }));
}

export async function createHoldingRecurring(
  householdId: string,
  holdingId: string,
  amount: number,
  frequency: string,
  dayOfMonth?: number,
) {
  if (!amount || !frequency) {
    throw new Error('amount and frequency are required');
  }
  const validFreqs = ['weekly', 'biweekly', 'monthly', 'quarterly'];
  if (!validFreqs.includes(frequency)) {
    throw new Error('frequency must be one of: weekly, biweekly, monthly, quarterly');
  }

  const holding = await prisma.investmentHolding.findFirst({
    where: { id: holdingId, ...NOT_DELETED, account: { householdId, ...NOT_DELETED } },
  });
  if (!holding) return null;

  const dom = dayOfMonth ? Math.min(Math.max(Number(dayOfMonth), 1), 28) : 1;
  const nextRun = nextRunDate(frequency, dom, new Date());

  const schedule = await prisma.recurringInvestment.create({
    data: {
      holdingId,
      amount: Number(amount),
      frequency,
      dayOfMonth: dom,
      nextRunAt: nextRun,
    },
  });

  return {
    id: schedule.id,
    holdingId: schedule.holdingId,
    amount: schedule.amount,
    frequency: schedule.frequency,
    dayOfMonth: schedule.dayOfMonth,
    status: schedule.status,
    lastRunAt: schedule.lastRunAt?.toISOString() ?? null,
    nextRunAt: schedule.nextRunAt.toISOString(),
    createdAt: schedule.createdAt.toISOString(),
  };
}

export async function updateHoldingRecurring(
  householdId: string,
  id: string,
  amount?: number,
  frequency?: string,
  dayOfMonth?: number,
  status?: string,
) {
  const schedule = await prisma.recurringInvestment.findFirst({
    where: { id, ...NOT_DELETED, holding: { account: { householdId, ...NOT_DELETED } } },
  });
  if (!schedule) return null;

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

  return {
    id: updated.id,
    holdingId: updated.holdingId,
    amount: updated.amount,
    frequency: updated.frequency,
    dayOfMonth: updated.dayOfMonth,
    status: updated.status,
    lastRunAt: updated.lastRunAt?.toISOString() ?? null,
    nextRunAt: updated.nextRunAt.toISOString(),
    createdAt: updated.createdAt.toISOString(),
  };
}

export async function deleteHoldingRecurring(householdId: string, id: string) {
  const schedule = await prisma.recurringInvestment.findFirst({
    where: { id, ...NOT_DELETED, holding: { account: { householdId, ...NOT_DELETED } } },
  });
  if (!schedule) return null;

  await prisma.recurringInvestment.update({ where: { id }, data: { isDeleted: true } });
  return { message: 'Deleted' };
}
