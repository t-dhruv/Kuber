import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import investmentsRouter from '../../src/routes/investments';
import { prisma } from '../../src/lib/prisma';
import { makeRouteTestApp } from '../integration/integrationHarness';
import { getQuote, getQuotes, getLiveBenchmarks } from '../../src/lib/priceCache';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    investmentHolding: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(() => Promise.resolve()),
      delete: vi.fn(),
    },
    recurringInvestment: {
      findMany: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      delete: vi.fn(),
    },
    holdingLot: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      update: vi.fn(),
    },
    dividendRecord: {
      groupBy: vi.fn(),
    },
    account: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock('../../src/lib/priceCache', () => ({
  getQuotes: vi.fn(),
  getQuote: vi.fn(),
  getLiveBenchmarks: vi.fn(),
}));

const holding = {
  id: 'holding-1',
  accountId: 'account-1',
  symbol: 'AAPL',
  name: 'Apple Inc.',
  shares: 10,
  costBasis: 100,
  currentPrice: 110,
  updatedAt: new Date('2026-05-01T00:00:00.000Z'),
  account: { name: 'Brokerage', householdId: 'household-1' },
  lots: [
    {
      id: 'lot-1',
      transactionType: 'buy',
      date: new Date('2026-01-01T00:00:00.000Z'),
      shares: 10,
      pricePerShare: 100,
      acbPerShareAtSale: null,
      realizedGainDecimal: null,
      note: null,
      status: 'confirmed',
    },
  ],
};

const quote = {
  symbol: 'AAPL',
  price: 120,
  dayChange: 2,
  dayChangePercent: 1.7,
  shortName: 'Apple',
};

function makeApp() {
  return makeRouteTestApp(investmentsRouter, { householdId: 'household-1', userId: 'user-1' });
}

describe('investments route integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.recurringInvestment.findMany).mockResolvedValue([] as any);
    vi.mocked(prisma.dividendRecord.groupBy).mockResolvedValue([] as any);
  });

  it('lists holdings with live prices and account scoping', async () => {
    vi.mocked(prisma.investmentHolding.findMany).mockResolvedValue([holding] as any);
    vi.mocked(getQuotes).mockResolvedValue(new Map([['AAPL', quote]]) as any);

    const res = await request(makeApp()).get('/holdings');

    expect(res.status).toBe(200);
    expect(prisma.recurringInvestment.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        status: 'active',
        holding: { account: { householdId: 'household-1', isDeleted: false } },
      }),
    }));
    expect(prisma.investmentHolding.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { account: { householdId: 'household-1', isDeleted: false } },
    }));
    expect(getQuotes).toHaveBeenCalledWith(['AAPL']);
    expect(res.body).toMatchObject({
      totalValue: 1200,
      totalCostBasis: 1000,
      totalGain: 200,
      holdings: [{ id: 'holding-1', ticker: 'AAPL', currentPrice: 120, gainPercent: 20 }],
    });
  });

  it('lists pending lots scoped to household investment accounts', async () => {
    vi.mocked(prisma.holdingLot.findMany).mockResolvedValue([
      {
        id: 'lot-pending',
        holdingId: 'holding-1',
        date: new Date('2026-05-01T00:00:00.000Z'),
        shares: 1.5,
        pricePerShare: 120,
        note: 'Recurring buy',
        holding: { symbol: 'AAPL', name: 'Apple' },
      },
    ] as any);

    const res = await request(makeApp()).get('/pending');

    expect(res.status).toBe(200);
    expect(prisma.holdingLot.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        status: 'pending',
        holding: { account: { householdId: 'household-1', isDeleted: false } },
      },
    }));
    expect(res.body).toEqual([
      expect.objectContaining({ id: 'lot-pending', ticker: 'AAPL', shares: 1.5 }),
    ]);
  });

  it('returns allocation by asset class and account', async () => {
    vi.mocked(prisma.investmentHolding.findMany).mockResolvedValue([holding] as any);
    vi.mocked(getQuotes).mockResolvedValue(new Map([['AAPL', quote]]) as any);

    const res = await request(makeApp()).get('/allocation');

    expect(res.status).toBe(200);
    expect(prisma.investmentHolding.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { account: { householdId: 'household-1', isDeleted: false } },
    }));
    expect(res.body).toMatchObject({
      totalValue: 1200,
      byAssetClass: [{ assetClass: 'US Stocks', value: 1200, percent: 100 }],
      byAccount: [{ accountId: 'account-1', accountName: 'Brokerage', value: 1200, percent: 100 }],
    });
  });

  it('returns performance history with live benchmarks', async () => {
    vi.mocked(prisma.investmentHolding.findMany).mockResolvedValue([holding] as any);
    vi.mocked(getQuotes).mockResolvedValue(new Map([['AAPL', quote]]) as any);
    vi.mocked(getLiveBenchmarks).mockResolvedValue({
      '1Y': { sp500: 10, nasdaq: 12, bonds: 4 },
    } as any);

    const res = await request(makeApp()).get('/performance?period=1M');

    expect(res.status).toBe(200);
    expect(prisma.investmentHolding.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { account: { householdId: 'household-1', isDeleted: false } },
    }));
    expect(res.body).toMatchObject({
      period: '1M',
      portfolioReturn: 20,
      portfolioReturnValue: 200,
    });
    expect(res.body.history).toHaveLength(2);
  });

  it('returns a live quote by symbol', async () => {
    vi.mocked(getQuote).mockResolvedValue(quote as any);

    const res = await request(makeApp()).get('/quote/aapl');

    expect(res.status).toBe(200);
    expect(getQuote).toHaveBeenCalledWith('AAPL');
    expect(res.body).toMatchObject({ symbol: 'AAPL', price: 120 });
  });

  it('rejects holding creation when required fields are missing', async () => {
    const res = await request(makeApp())
      .post('/holdings')
      .send({ ticker: 'AAPL' });

    expect(res.status).toBe(400);
    expect(prisma.account.findFirst).not.toHaveBeenCalled();
  });

  it('validates holding creation against active household investment accounts', async () => {
    vi.mocked(prisma.account.findFirst).mockResolvedValue(null);

    const res = await request(makeApp())
      .post('/holdings')
      .send({
        accountId: 'account-other',
        ticker: 'AAPL',
        name: 'Apple',
        shares: 10,
        pricePerShare: 100,
      });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Account not found in this household' });
    expect(prisma.account.findFirst).toHaveBeenCalledWith({
      where: { id: 'account-other', householdId: 'household-1', isDeleted: false },
    });
    expect(prisma.investmentHolding.create).not.toHaveBeenCalled();
  });

  it('creates a holding with an initial confirmed lot', async () => {
    vi.mocked(prisma.account.findFirst).mockResolvedValue({ id: 'account-1', type: 'INVESTMENT' } as any);
    vi.mocked(getQuote).mockResolvedValue(quote as any);
    vi.mocked(prisma.investmentHolding.create).mockResolvedValue(holding as any);
    vi.mocked(prisma.holdingLot.findMany).mockResolvedValue(holding.lots as any);
    vi.mocked(prisma.investmentHolding.update).mockResolvedValue({ ...holding, costBasis: 100 } as any);

    const res = await request(makeApp())
      .post('/holdings')
      .send({
        accountId: 'account-1',
        ticker: 'aapl',
        name: 'Apple',
        shares: 10,
        pricePerShare: 100,
      });

    expect(res.status).toBe(201);
    expect(prisma.investmentHolding.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        accountId: 'account-1',
        symbol: 'AAPL',
        shares: 10,
        currentPrice: 120,
        lots: { create: expect.objectContaining({ status: 'confirmed' }) },
      }),
    }));
    expect(res.body).toMatchObject({ id: 'holding-1', ticker: 'AAPL', currentPrice: 120 });
  });
});


