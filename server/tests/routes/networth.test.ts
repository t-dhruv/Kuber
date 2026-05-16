import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import networthRouter from '../../src/routes/networth';
import { prisma } from '../../src/lib/prisma';
import { makeRouteTestApp } from '../../src/test/integrationHarness';
import { takeNetWorthSnapshot } from '../../src/lib/netWorthJob';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    netWorthSnapshot: { findMany: vi.fn() },
    account: { findMany: vi.fn() },
  },
}));

vi.mock('../../src/lib/netWorthJob', () => ({
  takeNetWorthSnapshot: vi.fn(),
}));

vi.mock('../../src/lib/reporting', async () => {
  const actual = await vi.importActual<typeof import('../../src/lib/reporting')>('../../src/lib/reporting');
  return {
    ...actual,
    summarizeNetWorth: vi.fn(() => ({ assets: 1500, liabilities: 500, netWorth: 1000 })),
  };
});

function makeApp() {
  return makeRouteTestApp(networthRouter, { householdId: 'household-1', userId: 'user-1' });
}

describe('networth route integration', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns range-filtered history and live current net worth', async () => {
    vi.mocked(prisma.netWorthSnapshot.findMany).mockResolvedValue([
      {
        date: new Date('2026-04-01T00:00:00.000Z'),
        assets: 1200,
        liabilities: 400,
        netWorth: 800,
      },
    ] as any);
    vi.mocked(prisma.account.findMany).mockResolvedValue([
      { balance: 1500, type: 'CHECKING', excludeFromNetWorth: false },
    ] as any);

    const res = await request(makeApp()).get('/history?range=1M');

    expect(res.status).toBe(200);
    expect(prisma.netWorthSnapshot.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        householdId: 'household-1',
        date: expect.objectContaining({ gte: expect.any(Date) }),
      }),
      orderBy: { date: 'asc' },
    }));
    expect(prisma.account.findMany).toHaveBeenCalledWith({
      where: {
        householdId: 'household-1',
        isHidden: false,
        excludeFromNetWorth: false,
        isDeleted: false,
      },
      select: { balance: true, type: true, excludeFromNetWorth: true },
    });
    expect(res.body).toMatchObject({
      current: { assets: 1500, liabilities: 500, netWorth: 1000 },
      history: [{ date: '2026-04-01', assets: 1200, liabilities: 400, netWorth: 800 }],
      change: { amount: 200, percent: 25, since: '2026-04-01' },
    });
  });

  it('defaults invalid history ranges to one year', async () => {
    vi.mocked(prisma.netWorthSnapshot.findMany).mockResolvedValue([] as any);
    vi.mocked(prisma.account.findMany).mockResolvedValue([] as any);

    const res = await request(makeApp()).get('/history?range=bad');

    expect(res.status).toBe(200);
    expect(prisma.netWorthSnapshot.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        householdId: 'household-1',
        date: expect.objectContaining({ gte: expect.any(Date) }),
      }),
    }));
    expect(res.body.change).toEqual({ amount: 0, percent: 0, since: null });
  });

  it('records a household net worth snapshot', async () => {
    vi.mocked(takeNetWorthSnapshot).mockResolvedValue(undefined as any);

    const res = await request(makeApp()).post('/snapshot');

    expect(res.status).toBe(200);
    expect(takeNetWorthSnapshot).toHaveBeenCalledWith('household-1');
    expect(res.body).toEqual({ message: 'Snapshot recorded' });
  });
});


