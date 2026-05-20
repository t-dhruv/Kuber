import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import accountsRouter from '../../src/routes/accounts';
import { prisma } from '../../src/lib/prisma';
import { makeRouteTestApp } from '../integration/integrationHarness';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    account: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    accountBalanceSnapshot: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    recurringItem: {
      updateMany: vi.fn(),
    },
    goal: {
      updateMany: vi.fn(),
    },
    taxAccount: {
      updateMany: vi.fn(),
    },
    reconciliation: {
      deleteMany: vi.fn(),
    },
    reportingSnapshot: {
      deleteMany: vi.fn(),
    },
    reportingRollup: {
      deleteMany: vi.fn(),
    },
    investmentHolding: {
      deleteMany: vi.fn(),
    },
    transactionJournal: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    $transaction: vi.fn(async (fn) => fn(prisma)),
  },
}));

vi.mock('../../src/lib/audit', () => ({
  logAudit: vi.fn(),
}));

vi.mock('../../src/lib/legacyToJournalMigration', () => ({
  createJournalFromLegacyTransaction: vi.fn(),
  getVirtualAccountsByType: vi.fn(),
}));

const baseAccount = {
  id: 'account-1',
  householdId: 'household-1',
  name: 'Main Checking',
  type: 'CHECKING',
  institution: 'Kuber Bank',
  institutionLogo: null,
  lastFour: '1234',
  balance: 5000,
  balanceDecimal: null,
  currency: 'USD',
  creditLimit: null,
  isHidden: false,
  excludeFromNetWorth: false,
  lastSynced: null,
  createdAt: new Date('2026-05-01T00:00:00.000Z'),
};

function makeApp(householdId = 'household-1') {
  return makeRouteTestApp(accountsRouter, { householdId, userId: 'user-1' });
}

describe('accounts route integration', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists only non-deleted accounts for the authenticated household', async () => {
    vi.mocked(prisma.account.findMany).mockResolvedValue([
      baseAccount,
      {
        ...baseAccount,
        id: 'credit-card-1',
        name: 'Rewards Card',
        type: 'CREDIT_CARD',
        balance: -250,
        creditLimit: 1000,
      },
    ] as any);

    const res = await request(makeApp()).get('/');

    expect(res.status).toBe(200);
    expect(prisma.account.findMany).toHaveBeenCalledWith({
      where: { householdId: 'household-1', isDeleted: false, type: { notIn: ['expense', 'revenue', 'equity'] } },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    });
    expect(res.body.netWorth).toEqual({
      assets: 5000,
      liabilities: -250,
      total: 4750,
    });
    expect(res.body.groups).toHaveLength(2);
  });

  it('creates an account scoped to the authenticated household', async () => {
    vi.mocked(prisma.account.create).mockResolvedValue({
      ...baseAccount,
      id: 'created-account',
      name: 'Travel Savings',
      type: 'SAVINGS',
      institution: null,
      lastFour: null,
      balance: 1200,
      currency: 'CAD',
    } as any);

    const res = await request(makeApp())
      .post('/')
      .send({
        name: ' Travel Savings ',
        type: 'savings',
        balance: 1200,
        currency: 'CAD',
      });

    expect(res.status).toBe(201);
    expect(prisma.account.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        householdId: 'household-1',
        name: 'Travel Savings',
        type: 'SAVINGS',
        balance: 1200,
        currency: 'CAD',
      }),
    });
    expect(res.body.account).toMatchObject({
      id: 'created-account',
      name: 'Travel Savings',
      type: 'SAVINGS',
      balance: 1200,
    });
  });

  it('rejects account creation with invalid type before writing', async () => {
    const res = await request(makeApp())
      .post('/')
      .send({ name: 'Mystery', type: 'crypto-wallet', balance: 50 });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/type must be one of/i);
    expect(prisma.account.create).not.toHaveBeenCalled();
  });

  it('returns 404 when updating an account from another household', async () => {
    vi.mocked(prisma.account.findFirst).mockResolvedValue(null);

    const res = await request(makeApp())
      .put('/account-1')
      .send({ name: 'Renamed' });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Account not found' });
    expect(prisma.account.update).not.toHaveBeenCalled();
  });

  it('deletes account-related data and soft-deletes user-visible financial records', async () => {
    vi.mocked(prisma.account.findFirst).mockResolvedValue(baseAccount as any);
    vi.mocked(prisma.transactionJournal.updateMany).mockResolvedValue({ count: 2 } as any);
    vi.mocked(prisma.recurringItem.updateMany).mockResolvedValue({ count: 1 } as any);
    vi.mocked(prisma.goal.updateMany).mockResolvedValue({ count: 1 } as any);
    vi.mocked(prisma.taxAccount.updateMany).mockResolvedValue({ count: 1 } as any);
    vi.mocked(prisma.accountBalanceSnapshot.deleteMany).mockResolvedValue({ count: 3 } as any);
    vi.mocked(prisma.reconciliation.deleteMany).mockResolvedValue({ count: 1 } as any);
    vi.mocked(prisma.reportingSnapshot.deleteMany).mockResolvedValue({ count: 1 } as any);
    vi.mocked(prisma.reportingRollup.deleteMany).mockResolvedValue({ count: 1 } as any);
    vi.mocked(prisma.investmentHolding.deleteMany).mockResolvedValue({ count: 1 } as any);
    vi.mocked(prisma.account.update).mockResolvedValue({
      ...baseAccount,
      isDeleted: true,
    } as any);

    const res = await request(makeApp()).delete('/account-1');

    expect(res.status).toBe(200);
    expect(prisma.account.findFirst).toHaveBeenCalledWith({
      where: { id: 'account-1', householdId: 'household-1', isDeleted: false },
    });
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(prisma.transactionJournal.updateMany).toHaveBeenCalledWith({
      where: { entries: { some: { accountId: 'account-1' } }, householdId: 'household-1' },
      data: { isDeleted: true, isHidden: true },
    });
    expect(prisma.recurringItem.updateMany).toHaveBeenCalledWith({
      where: { householdId: 'household-1', accountId: 'account-1', isDeleted: false },
      data: { isDeleted: true, isActive: false },
    });
    expect(prisma.goal.updateMany).toHaveBeenCalledWith({
      where: { householdId: 'household-1', accountId: 'account-1', isDeleted: false },
      data: { isDeleted: true },
    });
    expect(prisma.taxAccount.updateMany).toHaveBeenCalledWith({
      where: { householdId: 'household-1', linkedAccountId: 'account-1' },
      data: { linkedAccountId: null },
    });
    expect(prisma.accountBalanceSnapshot.deleteMany).toHaveBeenCalledWith({
      where: { householdId: 'household-1', accountId: 'account-1' },
    });
    expect(prisma.reconciliation.deleteMany).toHaveBeenCalledWith({
      where: { householdId: 'household-1', accountId: 'account-1' },
    });
    expect(prisma.reportingSnapshot.deleteMany).toHaveBeenCalledWith({
      where: { householdId: 'household-1', kind: 'account_balance', subjectId: 'account-1' },
    });
    expect(prisma.reportingRollup.deleteMany).toHaveBeenCalledWith({
      where: { householdId: 'household-1', kind: 'account_balance', subjectId: 'account-1' },
    });
    expect(prisma.investmentHolding.deleteMany).toHaveBeenCalledWith({
      where: { accountId: 'account-1' },
    });
    expect(prisma.account.update).toHaveBeenCalledWith({
      where: { id: 'account-1' },
      data: { isDeleted: true, isHidden: true },
    });
    expect(prisma.account.delete).not.toHaveBeenCalled();
  });
});
