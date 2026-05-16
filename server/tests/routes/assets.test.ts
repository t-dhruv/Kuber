import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import assetsRouter from '../../src/routes/assets';
import { prisma } from '../../src/lib/prisma';
import { makeRouteTestApp } from '../integration/integrationHarness';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    manualAsset: {
      findMany: vi.fn(),
      aggregate: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    manualLiability: {
      aggregate: vi.fn(),
    },
    account: {
      aggregate: vi.fn(),
      findMany: vi.fn(),
    },
    investmentHolding: {
      findMany: vi.fn(),
    },
  },
}));

const asset = {
  id: 'asset-1',
  householdId: 'household-1',
  name: 'Cabin',
  type: 'real_estate',
  currentValue: 300000,
  purchaseValue: 250000,
  purchaseDate: new Date('2020-01-01T00:00:00.000Z'),
  notes: null,
  currency: 'CAD',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  _count: { snapshots: 1 },
};

function makeApp() {
  return makeRouteTestApp(assetsRouter, { householdId: 'household-1', userId: 'user-1' });
}

describe('assets route integration', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists household manual assets newest first', async () => {
    vi.mocked(prisma.manualAsset.findMany).mockResolvedValue([asset] as any);

    const res = await request(makeApp()).get('/');

    expect(res.status).toBe(200);
    expect(prisma.manualAsset.findMany).toHaveBeenCalledWith({
      where: { householdId: 'household-1' },
      include: { _count: { select: { snapshots: true } } },
      orderBy: { createdAt: 'desc' },
    });
    expect(res.body[0]).toMatchObject({ id: 'asset-1', name: 'Cabin' });
  });

  it('returns net worth breakdown from active accounts, holdings, assets, and liabilities', async () => {
    vi.mocked(prisma.account.aggregate).mockResolvedValue({ _sum: { balance: 1500 } } as any);
    vi.mocked(prisma.account.findMany).mockResolvedValue([{ id: 'investment-1' }] as any);
    vi.mocked(prisma.investmentHolding.findMany).mockResolvedValue([
      { currentPrice: 25, shares: 10 },
      { currentPrice: 50, shares: 2 },
    ] as any);
    vi.mocked(prisma.manualAsset.aggregate).mockResolvedValue({ _sum: { currentValue: 300000 } } as any);
    vi.mocked(prisma.manualLiability.aggregate).mockResolvedValue({ _sum: { currentBalance: 125000 } } as any);

    const res = await request(makeApp()).get('/net-worth-breakdown');

    expect(res.status).toBe(200);
    expect(prisma.account.aggregate).toHaveBeenCalledWith({
      where: {
        householdId: 'household-1',
        type: { not: 'investment' },
        isHidden: false,
        excludeFromNetWorth: false,
        isDeleted: false,
      },
      _sum: { balance: true },
    });
    expect(prisma.account.findMany).toHaveBeenCalledWith({
      where: { householdId: 'household-1', type: 'investment', isDeleted: false },
      select: { id: true },
    });
    expect(res.body).toEqual({
      bankAccounts: 1500,
      investments: 350,
      manualAssets: 300000,
      manualLiabilities: 125000,
      total: 176850,
    });
  });

  it('creates a manual asset with an initial snapshot', async () => {
    vi.mocked(prisma.manualAsset.create).mockResolvedValue(asset as any);

    const res = await request(makeApp())
      .post('/')
      .send({
        name: 'Cabin',
        type: 'real_estate',
        currentValue: 300000,
        purchaseValue: 250000,
        purchaseDate: '2020-01-01T00:00:00.000Z',
        currency: 'CAD',
      });

    expect(res.status).toBe(201);
    expect(prisma.manualAsset.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        householdId: 'household-1',
        name: 'Cabin',
        snapshots: { create: { value: 300000 } },
      }),
    }));
  });

  it('rejects invalid manual asset payloads before writing', async () => {
    const res = await request(makeApp())
      .post('/')
      .send({ name: '', currentValue: 10 });

    expect(res.status).toBe(400);
    expect(prisma.manualAsset.create).not.toHaveBeenCalled();
  });

  it('updates only household assets and records value-change snapshots', async () => {
    vi.mocked(prisma.manualAsset.findFirst).mockResolvedValue(asset as any);
    vi.mocked(prisma.manualAsset.update).mockResolvedValue({ ...asset, currentValue: 325000 } as any);

    const res = await request(makeApp())
      .put('/asset-1')
      .send({ currentValue: 325000 });

    expect(res.status).toBe(200);
    expect(prisma.manualAsset.findFirst).toHaveBeenCalledWith({
      where: { id: 'asset-1', householdId: 'household-1' },
    });
    expect(prisma.manualAsset.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'asset-1' },
      data: expect.objectContaining({
        currentValue: 325000,
        snapshots: { create: { value: 325000 } },
      }),
    }));
  });

  it('returns 404 when deleting another household asset', async () => {
    vi.mocked(prisma.manualAsset.findFirst).mockResolvedValue(null);

    const res = await request(makeApp()).delete('/asset-other');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Asset not found' });
    expect(prisma.manualAsset.delete).not.toHaveBeenCalled();
  });

  it('deletes a household manual asset', async () => {
    vi.mocked(prisma.manualAsset.findFirst).mockResolvedValue(asset as any);
    vi.mocked(prisma.manualAsset.delete).mockResolvedValue(asset as any);

    const res = await request(makeApp()).delete('/asset-1');

    expect(res.status).toBe(200);
    expect(prisma.manualAsset.delete).toHaveBeenCalledWith({ where: { id: 'asset-1' } });
  });
});


