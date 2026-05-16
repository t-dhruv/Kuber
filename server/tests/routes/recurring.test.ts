import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import recurringRouter from '../../src/routes/recurring';
import { prisma } from '../../src/lib/prisma';
import { makeRouteTestApp } from '../../src/test/integrationHarness';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    transactionJournal: { findMany: vi.fn() },
    recurringItem: {
      findMany: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    account: { findFirst: vi.fn() },
  },
}));

const recurringItem = {
  id: 'recurring-1',
  householdId: 'household-1',
  name: 'Internet',
  amount: -75,
  frequency: 'monthly',
  nextDate: new Date('2026-05-20T00:00:00.000Z'),
  accountId: 'account-1',
  categoryId: 'category-1',
  isActive: true,
  isDeleted: false,
  category: { id: 'category-1', name: 'Utilities', icon: 'wifi' },
  account: { id: 'account-1', name: 'Checking' },
};

function makeApp() {
  return makeRouteTestApp(recurringRouter, { householdId: 'household-1', userId: 'user-1' });
}

describe('recurring route integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-13T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('detects recurring withdrawal suggestions and ignores deleted recurring items', async () => {
    vi.mocked(prisma.transactionJournal.findMany).mockResolvedValue([
      { description: 'Streaming Service', amountDecimal: '-25.00', date: new Date('2026-03-01T00:00:00.000Z') },
      { description: 'Streaming Service', amountDecimal: '-25.00', date: new Date('2026-04-01T00:00:00.000Z') },
      { description: 'Streaming Service', amountDecimal: '-25.00', date: new Date('2026-05-01T00:00:00.000Z') },
    ] as any);
    vi.mocked(prisma.recurringItem.findMany).mockResolvedValue([] as any);

    const res = await request(makeApp()).post('/detect');

    expect(res.status).toBe(200);
    expect(prisma.recurringItem.findMany).toHaveBeenCalledWith({
      where: { householdId: 'household-1', isDeleted: false },
      select: { name: true, amount: true },
    });
    expect(res.body).toEqual([
      {
        name: 'Streaming Service',
        amount: -25,
        frequency: 'monthly',
        detectedCount: 3,
        nextDate: '2026-06-01',
      },
    ]);
  });

  it('lists active non-deleted household items in the requested month', async () => {
    vi.mocked(prisma.recurringItem.findMany).mockResolvedValue([recurringItem] as any);

    const res = await request(makeApp()).get('/?month=5&year=2026');

    expect(res.status).toBe(200);
    expect(prisma.recurringItem.findMany).toHaveBeenCalledWith({
      where: {
        householdId: 'household-1',
        isActive: true,
        isDeleted: false,
        nextDate: { gte: new Date(2026, 4, 1), lt: new Date(2026, 5, 1) },
      },
      include: {
        category: { select: { id: true, name: true, icon: true } },
        account: { select: { id: true, name: true } },
      },
      orderBy: { nextDate: 'asc' },
    });
    expect(res.body[0]).toMatchObject({
      id: 'recurring-1',
      name: 'Internet',
      accountName: 'Checking',
      categoryName: 'Utilities',
      daysUntilNext: 7,
    });
  });

  it('summarizes only non-deleted recurring items and marks paid expenses', async () => {
    vi.mocked(prisma.recurringItem.findMany).mockResolvedValue([
      recurringItem,
      { ...recurringItem, id: 'paycheck-1', name: 'Paycheck', amount: 3000 },
    ] as any);
    vi.mocked(prisma.transactionJournal.findMany).mockResolvedValue([
      { description: 'Internet bill autopay', amountDecimal: '-75.00' },
    ] as any);

    const res = await request(makeApp()).get('/monthly-summary?month=5&year=2026');

    expect(res.status).toBe(200);
    expect(prisma.recurringItem.findMany).toHaveBeenCalledWith({
      where: { householdId: 'household-1', isDeleted: false },
      include: {
        category: { select: { id: true, name: true, icon: true } },
        account: { select: { id: true, name: true } },
      },
    });
    expect(res.body.totalIncome).toBe(3000);
    expect(res.body.totalExpenses).toBe(75);
    expect(res.body.expenses[0]).toMatchObject({ id: 'recurring-1', isPaid: true });
  });

  it('creates recurring items only for non-deleted household accounts', async () => {
    vi.mocked(prisma.account.findFirst).mockResolvedValue({ id: 'account-1' } as any);
    vi.mocked(prisma.recurringItem.create).mockResolvedValue(recurringItem as any);

    const res = await request(makeApp())
      .post('/')
      .send({
        name: 'Internet',
        amount: -75,
        frequency: ' Monthly ',
        nextDate: '2026-05-20T00:00:00.000Z',
        accountId: 'account-1',
        categoryId: 'category-1',
      });

    expect(res.status).toBe(201);
    expect(prisma.account.findFirst).toHaveBeenCalledWith({
      where: { id: 'account-1', householdId: 'household-1', isDeleted: false },
    });
    expect(prisma.recurringItem.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        householdId: 'household-1',
        frequency: 'monthly',
        nextDate: new Date('2026-05-20T00:00:00.000Z'),
      }),
    }));
  });

  it('rejects invalid create payloads before writing', async () => {
    const res = await request(makeApp()).post('/').send({ name: '', amount: -75 });

    expect(res.status).toBe(400);
    expect(prisma.account.findFirst).not.toHaveBeenCalled();
    expect(prisma.recurringItem.create).not.toHaveBeenCalled();
  });

  it('updates only live household recurring items and validates replacement accounts', async () => {
    vi.mocked(prisma.recurringItem.findUnique).mockResolvedValue(recurringItem as any);
    vi.mocked(prisma.account.findFirst).mockResolvedValue({ id: 'account-2' } as any);
    vi.mocked(prisma.recurringItem.update).mockResolvedValue({
      ...recurringItem,
      accountId: 'account-2',
      account: { id: 'account-2', name: 'Bills Account' },
    } as any);

    const res = await request(makeApp()).put('/recurring-1').send({ accountId: 'account-2' });

    expect(res.status).toBe(200);
    expect(prisma.account.findFirst).toHaveBeenCalledWith({
      where: { id: 'account-2', householdId: 'household-1', isDeleted: false },
    });
    expect(res.body.accountName).toBe('Bills Account');
  });

  it('soft-deletes recurring items instead of hard-deleting them', async () => {
    vi.mocked(prisma.recurringItem.findUnique).mockResolvedValue(recurringItem as any);
    vi.mocked(prisma.recurringItem.update).mockResolvedValue({
      ...recurringItem,
      isActive: false,
      isDeleted: true,
    } as any);

    const res = await request(makeApp()).delete('/recurring-1');

    expect(res.status).toBe(200);
    expect(prisma.recurringItem.update).toHaveBeenCalledWith({
      where: { id: 'recurring-1' },
      data: { isDeleted: true, isActive: false },
    });
    expect(prisma.recurringItem.delete).not.toHaveBeenCalled();
  });

  it('returns 404 when toggling a deleted recurring item', async () => {
    vi.mocked(prisma.recurringItem.findUnique).mockResolvedValue({
      ...recurringItem,
      isDeleted: true,
    } as any);

    const res = await request(makeApp()).post('/recurring-1/toggle').send({ isActive: false });

    expect(res.status).toBe(404);
    expect(prisma.recurringItem.update).not.toHaveBeenCalled();
  });
});


