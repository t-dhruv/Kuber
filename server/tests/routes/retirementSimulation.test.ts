import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import investmentsRouter from '../../src/routes/investments';
import { prisma } from '../../src/lib/prisma';
import { makeRouteTestApp } from '../integration/integrationHarness';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    investmentHolding: {
      findMany: vi.fn(),
    },
  },
}));

function makeApp() {
  return makeRouteTestApp(investmentsRouter, { householdId: 'household-1', userId: 'user-1' });
}

// shares * currentPrice = 10000, so the projection arithmetic is easy to state.
const holdings = [{ shares: 100, currentPrice: 100, costBasis: 90 }];

describe('GET /retirement-simulation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reports no success probability for any scenario', async () => {
    vi.mocked(prisma.investmentHolding.findMany).mockResolvedValue(holdings as any);

    const res = await request(makeApp()).get('/retirement-simulation');

    expect(res.status).toBe(200);
    expect(res.body.scenarios).toHaveLength(3);
    for (const scenario of res.body.scenarios) {
      expect(scenario).not.toHaveProperty('success');
    }
  });

  it('returns identical scenarios across two calls with an unchanged portfolio', async () => {
    vi.mocked(prisma.investmentHolding.findMany).mockResolvedValue(holdings as any);

    const first = await request(makeApp()).get('/retirement-simulation');
    const second = await request(makeApp()).get('/retirement-simulation');

    expect(first.body.scenarios).toEqual(second.body.scenarios);
  });

  it('compounds the portfolio at the scenario return rate over the projection horizon', async () => {
    vi.mocked(prisma.investmentHolding.findMany).mockResolvedValue(holdings as any);

    const res = await request(makeApp()).get('/retirement-simulation');

    expect(res.body.portfolioValue).toBe(10000);
    expect(res.body.projectionYears).toBe(30);

    const baseCase = res.body.scenarios.find((s: { label: string }) => s.label === 'Base case');
    expect(baseCase.returnRate).toBe(0.07);
    expect(baseCase.endingBalance).toBe(Math.round(10000 * 1.07 ** 30));
  });

  it('projects zero for an empty portfolio', async () => {
    vi.mocked(prisma.investmentHolding.findMany).mockResolvedValue([] as any);

    const res = await request(makeApp()).get('/retirement-simulation');

    expect(res.body.portfolioValue).toBe(0);
    for (const scenario of res.body.scenarios) {
      expect(scenario.endingBalance).toBe(0);
    }
  });
});
