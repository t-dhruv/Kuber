import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import cashflowRouter from '../../src/routes/cashflow';
import { prisma } from '../../src/lib/prisma';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    account: { aggregate: vi.fn() },
    transactionJournal: { findMany: vi.fn() },
    recurringItem: { findMany: vi.fn() },
  },
}));

function makeApp(householdId = 'hh-1') {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res: any, next: any) => {
    req.householdId = householdId;
    req.log = { error: vi.fn(), info: vi.fn(), child: () => req.log };
    next();
  });
  app.use('/cashflow', cashflowRouter);
  return app;
}

describe('cashflow routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-07T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('filters reporting-excluded categories from the cash flow screen', async () => {
    vi.mocked(prisma.transactionJournal.findMany).mockResolvedValue([]);

    const res = await request(makeApp()).get('/cashflow?year=2026');

    expect(res.status).toBe(200);
    expect(prisma.transactionJournal.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        OR: [
          { categoryId: null },
          { category: { is: { excludeFromReports: false } } },
        ],
      }),
    }));
  });

  it('does not double-count known recurring items in forecast daily averages', async () => {
    vi.mocked(prisma.account.aggregate).mockResolvedValue({ _sum: { balance: 1000 } } as any);
    vi.mocked(prisma.transactionJournal.findMany).mockResolvedValue([
      { amountDecimal: -30 },
    ] as any);
    vi.mocked(prisma.recurringItem.findMany).mockResolvedValue([
      {
        amount: -90,
        frequency: 'monthly',
        nextDate: new Date('2026-05-08T00:00:00.000Z'),
      },
    ] as any);

    const res = await request(makeApp()).get('/cashflow/forecast?days=30');

    expect(res.status).toBe(200);
    expect(prisma.transactionJournal.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({}),
    }));
    expect(res.body.projections[0]).toMatchObject({
      date: '2026-05-08',
      projected: 909.67,
      dailyNet: -90.33,
    });
    expect(res.body.summary.avgMonthlyExpense).toBe(10);
  });
});


