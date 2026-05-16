import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import goalsRouter from '../../src/routes/goals';
import { prisma } from '../../src/lib/prisma';
import { makeRouteTestApp } from '../../src/test/integrationHarness';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    goal: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    account: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
  },
}));

vi.mock('../../src/lib/audit', () => ({
  logAudit: vi.fn(),
}));

const targetDate = new Date('2026-12-31T00:00:00.000Z');

const baseGoal = {
  id: 'goal-1',
  householdId: 'household-1',
  name: 'Emergency Fund',
  type: 'savings',
  targetAmount: 1000,
  currentAmount: 250,
  targetDate,
  monthlyContribution: 100,
  imageUrl: null,
  icon: null,
  accountId: null,
  isDeleted: false,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

const debtGoal = {
  ...baseGoal,
  id: 'goal-debt',
  name: 'Pay Card',
  type: 'debt',
  targetAmount: 500,
  currentAmount: 0,
  monthlyContribution: 75,
  accountId: 'account-debt',
};

const debtAccount = {
  id: 'account-debt',
  householdId: 'household-1',
  name: 'Rewards Card',
  type: 'CREDIT_CARD',
  balance: -200,
  institution: 'Kuber Bank',
};

function makeApp(householdId = 'household-1') {
  return makeRouteTestApp(goalsRouter, { householdId, userId: 'user-1' });
}

describe('goals route integration', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists active household goals and computes linked debt progress', async () => {
    vi.mocked(prisma.goal.findMany).mockResolvedValue([baseGoal, debtGoal] as any);
    vi.mocked(prisma.account.findMany).mockResolvedValue([debtAccount] as any);

    const res = await request(makeApp()).get('/');

    expect(res.status).toBe(200);
    expect(prisma.goal.findMany).toHaveBeenCalledWith({
      where: { householdId: 'household-1', isDeleted: false },
      orderBy: { createdAt: 'asc' },
    });
    expect(prisma.account.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id: { in: ['account-debt'] },
        householdId: 'household-1',
        isDeleted: false,
      },
    }));
    expect(res.body[0]).toMatchObject({
      id: 'goal-1',
      currentAmount: 250,
      percent: 25,
      remaining: 750,
    });
    expect(res.body[1]).toMatchObject({
      id: 'goal-debt',
      currentAmount: 300,
      percent: 60,
      remaining: 200,
      linkedAccount: {
        id: 'account-debt',
        name: 'Rewards Card',
      },
    });
  });

  it('lists non-deleted debt accounts available for goal linking', async () => {
    vi.mocked(prisma.account.findMany).mockResolvedValue([debtAccount] as any);

    const res = await request(makeApp()).get('/accounts-for-debt');

    expect(res.status).toBe(200);
    expect(prisma.account.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        householdId: 'household-1',
        type: { in: ['CREDIT_CARD', 'LOAN'] },
        isHidden: false,
        isDeleted: false,
      },
    }));
    expect(res.body).toEqual([expect.objectContaining({ id: 'account-debt' })]);
  });

  it('creates a linked debt goal only when the account belongs to the household', async () => {
    vi.mocked(prisma.account.findFirst).mockResolvedValue(debtAccount as any);
    vi.mocked(prisma.goal.create).mockResolvedValue(debtGoal as any);

    const res = await request(makeApp())
      .post('/')
      .send({
        name: 'Pay Card',
        type: 'DEBT',
        targetAmount: 500,
        accountId: 'account-debt',
      });

    expect(res.status).toBe(201);
    expect(prisma.account.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id: 'account-debt',
        householdId: 'household-1',
        isDeleted: false,
      },
    }));
    expect(prisma.goal.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        householdId: 'household-1',
        type: 'debt',
        accountId: 'account-debt',
      }),
    }));
  });

  it('rejects goal creation for another household account', async () => {
    vi.mocked(prisma.account.findFirst).mockResolvedValue(null);

    const res = await request(makeApp())
      .post('/')
      .send({
        name: 'Pay Card',
        type: 'debt',
        targetAmount: 500,
        accountId: 'account-other',
      });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Invalid accountId' });
    expect(prisma.goal.create).not.toHaveBeenCalled();
  });

  it('forbids updating another household goal', async () => {
    vi.mocked(prisma.goal.findUnique).mockResolvedValue({
      ...baseGoal,
      householdId: 'other-household',
    } as any);

    const res = await request(makeApp())
      .put('/goal-1')
      .send({ name: 'Updated' });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Forbidden' });
    expect(prisma.goal.update).not.toHaveBeenCalled();
  });

  it('soft-deletes a goal instead of hard-deleting it', async () => {
    vi.mocked(prisma.goal.findUnique).mockResolvedValue(baseGoal as any);
    vi.mocked(prisma.goal.update).mockResolvedValue({
      ...baseGoal,
      isDeleted: true,
    } as any);

    const res = await request(makeApp()).delete('/goal-1');

    expect(res.status).toBe(200);
    expect(prisma.goal.update).toHaveBeenCalledWith({
      where: { id: 'goal-1' },
      data: { isDeleted: true },
    });
    expect(prisma.goal.delete).not.toHaveBeenCalled();
  });

  it('records a contribution for a household goal', async () => {
    vi.mocked(prisma.goal.findUnique).mockResolvedValue(baseGoal as any);
    vi.mocked(prisma.goal.update).mockResolvedValue({
      ...baseGoal,
      currentAmount: 300,
    } as any);

    const res = await request(makeApp())
      .post('/goal-1/contribute')
      .send({ amount: 50 });

    expect(res.status).toBe(200);
    expect(prisma.goal.update).toHaveBeenCalledWith({
      where: { id: 'goal-1' },
      data: { currentAmount: 300 },
    });
    expect(res.body).toMatchObject({
      id: 'goal-1',
      currentAmount: 300,
      percent: 30,
      remaining: 700,
    });
  });
});


