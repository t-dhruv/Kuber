import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import duplicatesRouter from '../../src/routes/duplicates';
import { prisma } from '../../src/lib/prisma';
import { makeRouteTestApp } from '../integration/integrationHarness';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    transactionJournal: {
      findMany: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
    },
    duplicateDismissal: {
      findMany: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

const baseJournal = {
  id: 'txn-a',
  householdId: 'household-1',
  date: new Date('2026-05-10T00:00:00.000Z'),
  description: 'Coffee Shop',
  amountDecimal: '-4.50',
  categoryId: 'category-1',
  isSplit: false,
  isHidden: false,
  isDeleted: false,
  entries: [{ account: { id: 'account-1', name: 'Checking' } }],
  category: { id: 'category-1', name: 'Dining', icon: 'coffee' },
  merchant: { name: 'coffee shop', displayName: 'Coffee Shop' },
};

function makeApp() {
  return makeRouteTestApp(duplicatesRouter, { householdId: 'household-1', userId: 'user-1' });
}

describe('duplicates route integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-13T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('lists duplicate candidates from live household journals and skips dismissed pairs', async () => {
    vi.mocked(prisma.transactionJournal.findMany).mockResolvedValue([
      baseJournal,
      { ...baseJournal, id: 'txn-b', date: new Date('2026-05-11T00:00:00.000Z') },
      { ...baseJournal, id: 'txn-c', amountDecimal: '-10.00' },
    ] as any);
    vi.mocked(prisma.duplicateDismissal.findMany).mockResolvedValue([] as any);

    const res = await request(makeApp()).get('/duplicates');

    const since = new Date('2026-05-13T12:00:00.000Z');
    since.setDate(since.getDate() - 90);
    expect(res.status).toBe(200);
    expect(prisma.transactionJournal.findMany).toHaveBeenCalledWith({
      where: {
        householdId: 'household-1',
        isHidden: false,
        isSplit: false,
        isDeleted: false,
        date: { gte: since },
      },
      include: {
        entries: {
          select: { account: { select: { id: true, name: true } } },
        },
        category: { select: { id: true, name: true, icon: true } },
        merchant: { select: { name: true, displayName: true } },
      },
      orderBy: [{ amountDecimal: 'asc' }, { date: 'asc' }],
      take: 1000,
    });
    expect(res.body).toMatchObject({
      count: 1,
      groups: [
        {
          confidence: 'high',
          transactions: [
            { id: 'txn-a', amount: -4.5, accountName: 'Checking', categoryName: 'Dining' },
            { id: 'txn-b', amount: -4.5 },
          ],
        },
      ],
    });
  });

  it('omits dismissed duplicate pairs from the review queue', async () => {
    vi.mocked(prisma.transactionJournal.findMany).mockResolvedValue([
      baseJournal,
      { ...baseJournal, id: 'txn-b', date: new Date('2026-05-11T00:00:00.000Z') },
    ] as any);
    vi.mocked(prisma.duplicateDismissal.findMany).mockResolvedValue([
      { transactionId1: 'txn-a', transactionId2: 'txn-b' },
    ] as any);

    const res = await request(makeApp()).get('/duplicates');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ count: 0, groups: [] });
  });

  it('dismisses live household transaction pairs in canonical order', async () => {
    vi.mocked(prisma.transactionJournal.findMany).mockResolvedValue([
      { id: 'txn-a' },
      { id: 'txn-b' },
    ] as any);
    vi.mocked(prisma.duplicateDismissal.upsert).mockResolvedValue({} as any);

    const res = await request(makeApp())
      .post('/duplicates/dismiss')
      .send({ transactionId1: 'txn-b', transactionId2: 'txn-a' });

    expect(res.status).toBe(200);
    expect(prisma.transactionJournal.findMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['txn-b', 'txn-a'] },
        householdId: 'household-1',
        isHidden: false,
        isDeleted: false,
      },
      select: { id: true },
    });
    expect(prisma.duplicateDismissal.upsert).toHaveBeenCalledWith({
      where: { transactionId1_transactionId2: { transactionId1: 'txn-a', transactionId2: 'txn-b' } },
      create: { householdId: 'household-1', transactionId1: 'txn-a', transactionId2: 'txn-b' },
      update: {},
    });
    expect(res.body).toEqual({ message: 'Dismissed' });
  });

  it('rejects invalid dismiss payloads before querying', async () => {
    const res = await request(makeApp()).post('/duplicates/dismiss').send({ transactionId1: 'txn-a' });

    expect(res.status).toBe(400);
    expect(prisma.transactionJournal.findMany).not.toHaveBeenCalled();
    expect(prisma.duplicateDismissal.upsert).not.toHaveBeenCalled();
  });

  it('merges duplicates by soft-deleting the removed live household journal', async () => {
    vi.mocked(prisma.transactionJournal.findMany).mockResolvedValue([
      { ...baseJournal, id: 'keep-id' },
      { ...baseJournal, id: 'remove-id' },
    ] as any);
    vi.mocked(prisma.transactionJournal.update).mockResolvedValue({} as any);
    vi.mocked(prisma.duplicateDismissal.upsert).mockResolvedValue({} as any);
    vi.mocked(prisma.transactionJournal.findUnique).mockResolvedValue({ ...baseJournal, id: 'keep-id' } as any);

    const res = await request(makeApp())
      .post('/duplicates/merge')
      .send({ keepId: 'keep-id', removeId: 'remove-id' });

    expect(res.status).toBe(200);
    expect(prisma.transactionJournal.findMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['keep-id', 'remove-id'] },
        householdId: 'household-1',
        isHidden: false,
        isDeleted: false,
      },
    });
    expect(prisma.transactionJournal.update).toHaveBeenCalledWith({
      where: { id: 'remove-id' },
      data: { isHidden: true, isDeleted: true },
    });
    expect(prisma.duplicateDismissal.upsert).toHaveBeenCalledWith({
      where: { transactionId1_transactionId2: { transactionId1: 'keep-id', transactionId2: 'remove-id' } },
      create: { householdId: 'household-1', transactionId1: 'keep-id', transactionId2: 'remove-id' },
      update: {},
    });
    expect(res.body).toMatchObject({ id: 'keep-id' });
  });

  it('does not merge split transactions', async () => {
    vi.mocked(prisma.transactionJournal.findMany).mockResolvedValue([
      { ...baseJournal, id: 'keep-id', isSplit: true },
      { ...baseJournal, id: 'remove-id' },
    ] as any);

    const res = await request(makeApp())
      .post('/duplicates/merge')
      .send({ keepId: 'keep-id', removeId: 'remove-id' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Cannot merge split transactions');
    expect(prisma.transactionJournal.update).not.toHaveBeenCalled();
  });
});


