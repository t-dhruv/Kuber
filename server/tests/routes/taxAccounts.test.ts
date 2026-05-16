import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import taxAccountsRouter from '../../src/routes/taxAccounts';
import { prisma } from '../../src/lib/prisma.js';
import { makeRouteTestApp } from '../../src/test/integrationHarness';

vi.mock('../../src/lib/prisma.js', () => ({
  prisma: {
    taxAccount: {
      findMany: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    account: {
      findFirst: vi.fn(),
    },
  },
}));

const taxAccount = {
  id: 'tax-1',
  householdId: 'household-1',
  name: 'Dhruv TFSA',
  type: 'TFSA',
  linkedAccountId: 'account-1',
  memberName: 'Dhruv',
  birthYear: 1990,
  annualRoomCad: 7000,
  totalRoomEver: 95500,
  contributionsYtd: 90000,
  withdrawalsYtd: 1000,
  notes: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

function makeApp() {
  return makeRouteTestApp(taxAccountsRouter, { householdId: 'household-1', userId: 'user-1' });
}

describe('tax accounts route integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-13T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('lists household tax accounts oldest first', async () => {
    vi.mocked(prisma.taxAccount.findMany).mockResolvedValue([taxAccount] as any);

    const res = await request(makeApp()).get('/');

    expect(res.status).toBe(200);
    expect(prisma.taxAccount.findMany).toHaveBeenCalledWith({
      where: { householdId: 'household-1' },
      orderBy: { createdAt: 'asc' },
    });
    expect(res.body[0]).toMatchObject({ id: 'tax-1', name: 'Dhruv TFSA' });
  });

  it('summarizes contribution room and alerts by household member', async () => {
    vi.mocked(prisma.taxAccount.findMany).mockResolvedValue([
      taxAccount,
      { ...taxAccount, id: 'rrsp-1', name: 'RRSP', type: 'RRSP', contributionsYtd: 70000, totalRoomEver: 30000 },
    ] as any);

    const res = await request(makeApp()).get('/household-summary');

    expect(res.status).toBe(200);
    expect(prisma.taxAccount.findMany).toHaveBeenCalledWith({
      where: { householdId: 'household-1' },
    });
    expect(res.body.accounts).toEqual([
      expect.objectContaining({
        id: 'tax-1',
        type: 'TFSA',
        roomRemaining: 20000,
        overContribution: 0,
        alert: 'warning',
      }),
      expect.objectContaining({
        id: 'rrsp-1',
        type: 'RRSP',
        roomRemaining: 0,
        overContribution: 7510,
        alert: 'over',
      }),
    ]);
  });

  it('creates a tax account only when the linked account belongs to the household', async () => {
    vi.mocked(prisma.account.findFirst).mockResolvedValue({ id: 'account-1' } as any);
    vi.mocked(prisma.taxAccount.create).mockResolvedValue(taxAccount as any);

    const res = await request(makeApp())
      .post('/')
      .send({
        name: 'Dhruv TFSA',
        type: 'TFSA',
        linkedAccountId: 'account-1',
        birthYear: 1990,
        contributionsYtd: 90000,
        withdrawalsYtd: 1000,
      });

    expect(res.status).toBe(201);
    expect(prisma.account.findFirst).toHaveBeenCalledWith({
      where: { id: 'account-1', householdId: 'household-1', isDeleted: false },
    });
    expect(prisma.taxAccount.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        householdId: 'household-1',
        linkedAccountId: 'account-1',
      }),
    });
  });

  it('rejects tax accounts linked to another household account', async () => {
    vi.mocked(prisma.account.findFirst).mockResolvedValue(null);

    const res = await request(makeApp())
      .post('/')
      .send({ name: 'Other TFSA', type: 'TFSA', linkedAccountId: 'other-account' });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Invalid linkedAccountId' });
    expect(prisma.taxAccount.create).not.toHaveBeenCalled();
  });

  it('updates only household tax accounts and validates replacement linked accounts', async () => {
    vi.mocked(prisma.taxAccount.findFirst).mockResolvedValue(taxAccount as any);
    vi.mocked(prisma.account.findFirst).mockResolvedValue({ id: 'account-2' } as any);
    vi.mocked(prisma.taxAccount.update).mockResolvedValue({ ...taxAccount, linkedAccountId: 'account-2' } as any);

    const res = await request(makeApp()).put('/tax-1').send({ linkedAccountId: 'account-2' });

    expect(res.status).toBe(200);
    expect(prisma.taxAccount.findFirst).toHaveBeenCalledWith({
      where: { id: 'tax-1', householdId: 'household-1' },
    });
    expect(prisma.account.findFirst).toHaveBeenCalledWith({
      where: { id: 'account-2', householdId: 'household-1', isDeleted: false },
    });
    expect(prisma.taxAccount.update).toHaveBeenCalledWith({
      where: { id: 'tax-1' },
      data: { linkedAccountId: 'account-2' },
    });
  });

  it('deletes only household tax accounts', async () => {
    vi.mocked(prisma.taxAccount.findFirst).mockResolvedValue(taxAccount as any);
    vi.mocked(prisma.taxAccount.delete).mockResolvedValue(taxAccount as any);

    const res = await request(makeApp()).delete('/tax-1');

    expect(res.status).toBe(200);
    expect(prisma.taxAccount.findFirst).toHaveBeenCalledWith({
      where: { id: 'tax-1', householdId: 'household-1' },
    });
    expect(prisma.taxAccount.delete).toHaveBeenCalledWith({ where: { id: 'tax-1' } });
    expect(res.body).toEqual({ message: 'Deleted' });
  });
});


