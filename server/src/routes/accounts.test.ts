import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import accountsRouter from './accounts';
import { prisma } from '../lib/prisma';
import { makeRouteTestApp } from '../test/integrationHarness';

vi.mock('../lib/prisma', () => ({
  prisma: {
    account: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    accountBalanceSnapshot: {
      findMany: vi.fn(),
    },
    transactionJournal: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock('../lib/audit', () => ({
  logAudit: vi.fn(),
}));

vi.mock('../lib/legacyToJournalMigration', () => ({
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
      where: { householdId: 'household-1', isDeleted: false },
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
    vi.mocked(prisma.account.findUnique).mockResolvedValue({
      ...baseAccount,
      householdId: 'other-household',
    } as any);

    const res = await request(makeApp())
      .put('/account-1')
      .send({ name: 'Renamed' });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Account not found' });
    expect(prisma.account.update).not.toHaveBeenCalled();
  });

  it('soft-deletes the account and hides related journals', async () => {
    vi.mocked(prisma.account.findUnique).mockResolvedValue(baseAccount as any);
    vi.mocked(prisma.transactionJournal.updateMany).mockResolvedValue({ count: 2 } as any);
    vi.mocked(prisma.account.update).mockResolvedValue({
      ...baseAccount,
      isDeleted: true,
    } as any);

    const res = await request(makeApp()).delete('/account-1');

    expect(res.status).toBe(200);
    expect(prisma.transactionJournal.updateMany).toHaveBeenCalledWith({
      where: { entries: { some: { accountId: 'account-1' } }, householdId: 'household-1' },
      data: { isHidden: true },
    });
    expect(prisma.account.update).toHaveBeenCalledWith({
      where: { id: 'account-1' },
      data: { isDeleted: true, isHidden: true },
    });
    expect(prisma.account.delete).not.toHaveBeenCalled();
  });
});
