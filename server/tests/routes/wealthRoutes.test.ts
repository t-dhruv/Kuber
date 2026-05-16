import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import wealthRouter from '../../src/routes/wealth';
import { prisma } from '../../src/lib/prisma';
import { getAiClientForHousehold } from '../../src/lib/ai';
import { makeRouteTestApp } from '../../src/test/integrationHarness';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    userPreference: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    transactionJournal: {
      findMany: vi.fn(),
    },
    category: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    goal: {
      findMany: vi.fn(),
    },
    wealthAiCache: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

vi.mock('../../src/lib/ai', () => ({
  getAiClientForHousehold: vi.fn(),
}));

function makeApp() {
  return makeRouteTestApp(wealthRouter, { householdId: 'household-1', userId: 'user-1' });
}

describe('wealth route integration', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns manually configured monthly income before auto-detection', async () => {
    vi.mocked(prisma.userPreference.findUnique)
      .mockResolvedValueOnce({ value: '6200' } as any)
      .mockResolvedValueOnce({ value: '2026-05-10T12:00:00.000Z' } as any);

    const res = await request(makeApp()).get('/income');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      monthlyNetIncome: 6200,
      updatedAt: '2026-05-10T12:00:00.000Z',
      autoDetected: false,
    });
    expect(prisma.transactionJournal.findMany).not.toHaveBeenCalled();
  });

  it('auto-detects income from previous-month deposits when no preference exists', async () => {
    vi.mocked(prisma.userPreference.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.transactionJournal.findMany).mockResolvedValue([
      { amountDecimal: 3000 },
      { amountDecimal: 1250.5 },
    ] as any);

    const res = await request(makeApp()).get('/income');

    expect(res.status).toBe(200);
    expect(prisma.transactionJournal.findMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        householdId: 'household-1',
        transactionType: 'deposit',
        isHidden: false,
        isDeleted: false,
      }),
      select: { amountDecimal: true },
    });
    expect(res.body).toEqual({ monthlyNetIncome: 4250.5, updatedAt: null, autoDetected: true });
  });

  it('persists monthly income and update timestamp for the user', async () => {
    vi.mocked(prisma.userPreference.upsert).mockResolvedValue({} as any);

    const res = await request(makeApp()).put('/income').send({ monthlyNetIncome: 7000 });

    expect(res.status).toBe(200);
    expect(prisma.userPreference.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.userPreference.upsert).toHaveBeenCalledWith({
      where: { userId_key: { userId: 'user-1', key: 'wealth_monthly_income' } },
      update: { value: '7000' },
      create: { userId: 'user-1', key: 'wealth_monthly_income', value: '7000' },
    });
    expect(res.body.monthlyNetIncome).toBe(7000);
    expect(res.body.updatedAt).toBeTruthy();
  });

  it('rejects invalid monthly income before writing', async () => {
    const res = await request(makeApp()).put('/income').send({ monthlyNetIncome: -1 });

    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
    expect(prisma.userPreference.upsert).not.toHaveBeenCalled();
  });

  it('lists and updates category buckets within the household', async () => {
    vi.mocked(prisma.category.findMany).mockResolvedValue([
      { id: 'cat-1', name: 'Groceries', icon: 'cart', bucketType: 'needs' },
    ] as any);

    const listRes = await request(makeApp()).get('/category-buckets');

    expect(listRes.status).toBe(200);
    expect(prisma.category.findMany).toHaveBeenCalledWith({
      where: { householdId: 'household-1' },
      select: { id: true, name: true, icon: true, bucketType: true },
      orderBy: [{ bucketType: 'asc' }, { name: 'asc' }],
    });

    vi.mocked(prisma.category.findFirst).mockResolvedValue({ id: 'cat-1' } as any);
    vi.mocked(prisma.category.update).mockResolvedValue({
      id: 'cat-1',
      name: 'Groceries',
      icon: 'cart',
      bucketType: 'wants',
    } as any);

    const updateRes = await request(makeApp())
      .put('/category-buckets')
      .send({ categoryId: 'cat-1', bucketType: 'wants' });

    expect(updateRes.status).toBe(200);
    expect(prisma.category.findFirst).toHaveBeenCalledWith({
      where: { id: 'cat-1', householdId: 'household-1' },
    });
    expect(updateRes.body).toMatchObject({ id: 'cat-1', bucketType: 'wants' });
  });

  it('resets category buckets to defaults for this household only', async () => {
    vi.mocked(prisma.category.findMany).mockResolvedValue([
      { id: 'cat-1', name: 'Groceries' },
      { id: 'cat-2', name: 'Mystery' },
    ] as any);
    vi.mocked(prisma.category.update).mockResolvedValue({} as any);

    const res = await request(makeApp()).post('/category-buckets/reset');

    expect(res.status).toBe(200);
    expect(prisma.category.update).toHaveBeenCalledWith({
      where: { id: 'cat-1' },
      data: { bucketType: 'needs' },
    });
    expect(prisma.category.update).toHaveBeenCalledWith({
      where: { id: 'cat-2' },
      data: { bucketType: 'uncategorized' },
    });
  });

  it('builds wealth analysis from income, spending buckets, and goals', async () => {
    vi.mocked(prisma.userPreference.findUnique).mockResolvedValue({ value: '5000' } as any);
    vi.mocked(prisma.transactionJournal.findMany).mockResolvedValue([
      {
        amountDecimal: -1200,
        categoryId: 'rent',
        category: { id: 'rent', name: 'Rent', icon: 'home', bucketType: 'needs' },
      },
      {
        amountDecimal: -350,
        categoryId: 'dining',
        category: { id: 'dining', name: 'Dining', icon: 'fork', bucketType: 'wants' },
      },
    ] as any);
    vi.mocked(prisma.goal.findMany).mockResolvedValue([
      { id: 'goal-1', name: 'Emergency Fund', type: 'emergency', targetAmount: 10000, currentAmount: 2500 },
    ] as any);

    const res = await request(makeApp()).get('/analysis?month=2026-05');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      income: 5000,
      month: '2026-05',
      actuals: { needs: 1200, wants: 350, savings: 0 },
    });
    expect(res.body.investmentLadder[0]).toMatchObject({
      label: 'Emergency Fund',
      status: 'inprogress',
      amount: 2500,
    });
  });

  it('returns cached AI analysis when it is fresh', async () => {
    vi.mocked(prisma.wealthAiCache.findUnique).mockResolvedValue({
      analysis: 'Keep going.',
      generatedAt: new Date(),
    } as any);

    const res = await request(makeApp()).post('/ai-analysis').send({});

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ configured: true, analysis: 'Keep going.', cached: true });
    expect(getAiClientForHousehold).not.toHaveBeenCalled();
  });

  it('returns a safe unconfigured response when no AI provider is available', async () => {
    vi.mocked(prisma.wealthAiCache.findUnique).mockResolvedValue(null);
    vi.mocked(getAiClientForHousehold).mockRejectedValue(new Error('not configured'));

    const res = await request(makeApp()).post('/ai-analysis').send({ refresh: true });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      configured: false,
      message: 'Configure an AI provider in Settings to get personalized wealth coaching.',
    });
  });
});


