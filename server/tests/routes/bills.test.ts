import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import billsRouter from '../../src/routes/bills';
import { prisma } from '../../src/lib/prisma';
import { logAudit } from '../../src/lib/audit';
import { makeRouteTestApp } from '../integration/integrationHarness';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    bill: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('../../src/lib/audit', () => ({
  logAudit: vi.fn(),
}));

const bill = {
  id: 'bill-1',
  householdId: 'household-1',
  name: 'Internet',
  amountMin: 70,
  amountMax: 90,
  currency: 'USD',
  startDate: new Date('2026-01-01T00:00:00.000Z'),
  endDate: null,
  repeatFreq: 'monthly',
  skipPeriods: 0,
  notes: null,
  isActive: true,
  isDeleted: false,
  paidPeriods: [],
};

function makeApp() {
  return makeRouteTestApp(billsRouter, { householdId: 'household-1', userId: 'user-1' });
}

describe('bills route integration', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists active household bills with recent paid periods', async () => {
    vi.mocked(prisma.bill.findMany).mockResolvedValue([
      { ...bill, amountMin: { toString: () => '70.25' }, amountMax: null },
    ] as any);

    const res = await request(makeApp()).get('/');

    expect(res.status).toBe(200);
    expect(prisma.bill.findMany).toHaveBeenCalledWith({
      where: { householdId: 'household-1', isDeleted: false },
      include: { paidPeriods: { orderBy: { periodKey: 'desc' }, take: 3 } },
      orderBy: { name: 'asc' },
    });
    expect(res.body[0]).toMatchObject({ name: 'Internet', amountMin: 70.25, amountMax: null });
  });

  it('returns bill status for the requested month', async () => {
    vi.mocked(prisma.bill.findMany).mockResolvedValue([
      { ...bill, paidPeriods: [{ id: 'paid-1', periodKey: '2026-05' }] },
    ] as any);

    const res = await request(makeApp()).get('/status?year=2026&month=5');

    expect(res.status).toBe(200);
    expect(prisma.bill.findMany).toHaveBeenCalledWith({
      where: { householdId: 'household-1', isActive: true, isDeleted: false },
      include: { paidPeriods: { where: { periodKey: '2026-05' } } },
    });
    expect(res.body[0]).toMatchObject({ paid: true, periodKey: '2026-05' });
  });

  it('creates a bill scoped to the authenticated household', async () => {
    vi.mocked(prisma.bill.create).mockResolvedValue({ ...bill, id: 'created-bill' } as any);

    const res = await request(makeApp())
      .post('/')
      .send({
        name: 'Internet',
        amountMin: 70,
        amountMax: 90,
        startDate: '2026-01-01T00:00:00.000Z',
        repeatFreq: 'monthly',
      });

    expect(res.status).toBe(201);
    expect(prisma.bill.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        householdId: 'household-1',
        name: 'Internet',
        currency: 'USD',
        repeatFreq: 'monthly',
      }),
    });
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({
      householdId: 'household-1',
      userId: 'user-1',
      action: 'CREATE',
      entity: 'BILL',
      entityId: 'created-bill',
    }));
  });

  it('rejects invalid bill creation before writing', async () => {
    const res = await request(makeApp()).post('/').send({ name: '', repeatFreq: 'daily' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
    expect(prisma.bill.create).not.toHaveBeenCalled();
  });

  it('returns 404 when updating a bill outside the household', async () => {
    vi.mocked(prisma.bill.findFirst).mockResolvedValue(null);

    const res = await request(makeApp()).put('/bill-1').send({ name: 'Renamed' });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Bill not found' });
    expect(prisma.bill.update).not.toHaveBeenCalled();
  });

  it('soft-deletes bills instead of hard-deleting them', async () => {
    vi.mocked(prisma.bill.findFirst).mockResolvedValue(bill as any);
    vi.mocked(prisma.bill.update).mockResolvedValue({ ...bill, isDeleted: true, isActive: false } as any);

    const res = await request(makeApp()).delete('/bill-1');

    expect(res.status).toBe(200);
    expect(prisma.bill.update).toHaveBeenCalledWith({
      where: { id: 'bill-1' },
      data: { isDeleted: true, isActive: false },
    });
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'DELETE',
      entity: 'BILL',
      entityId: 'bill-1',
    }));
  });
});


