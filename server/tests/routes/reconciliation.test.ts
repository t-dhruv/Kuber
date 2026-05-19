import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import reconciliationRouter from '../../src/routes/reconciliation';
import { prisma } from '../../src/lib/prisma';
import { makeRouteTestApp } from '../integration/integrationHarness';
import { createJournalFromLegacyTransaction, getVirtualAccountsByType } from '../../src/lib/legacyToJournalMigration';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    account: { findFirst: vi.fn() },
    transactionJournal: {
      findMany: vi.fn(),
      aggregate: vi.fn(),
      updateMany: vi.fn(),
    },
    reconciliation: {
      findFirst: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock('../../src/lib/legacyToJournalMigration', () => ({
  createJournalFromLegacyTransaction: vi.fn(),
  getVirtualAccountsByType: vi.fn(),
}));

const account = {
  id: 'account-1',
  householdId: 'household-1',
  name: 'Checking',
  isDeleted: false,
};

const reconcile = {
  id: 'reconcile-1',
  householdId: 'household-1',
  accountId: 'account-1',
  statementDate: new Date('2026-05-31T00:00:00.000Z'),
  statementBalance: 500,
  openingBalance: 100,
  difference: 0,
  createdAt: new Date('2026-06-01T00:00:00.000Z'),
};

function makeApp() {
  return makeRouteTestApp(reconciliationRouter, { householdId: 'household-1', userId: 'user-1' });
}

describe('reconciliation route integration', () => {
  beforeEach(() => vi.clearAllMocks());

  it('previews reconciliation for active household accounts only', async () => {
    vi.mocked(prisma.account.findFirst).mockResolvedValue(account as any);
    vi.mocked(prisma.transactionJournal.findMany).mockResolvedValue([{ id: 'txn-1' }] as any);
    vi.mocked(prisma.transactionJournal.aggregate).mockResolvedValue({ _sum: { amountDecimal: 125.5 } } as any);

    const res = await request(makeApp()).get('/account-1/reconcile');

    expect(res.status).toBe(200);
    expect(prisma.account.findFirst).toHaveBeenCalledWith({
      where: { id: 'account-1', householdId: 'household-1', isDeleted: false },
    });
    expect(prisma.transactionJournal.findMany).toHaveBeenCalledWith({
      where: {
        entries: { some: { accountId: 'account-1' } },
        householdId: 'household-1',
        isReconciled: false,
        isDeleted: false,
      },
      orderBy: { date: 'desc' },
      take: 200,
    });
    expect(prisma.transactionJournal.aggregate).toHaveBeenCalledWith({
      where: {
        entries: { some: { accountId: 'account-1' } },
        householdId: 'household-1',
        isReconciled: true,
        isDeleted: false,
      },
      _sum: { amountDecimal: true },
    });
    expect(res.body).toEqual({ unclearedTransactions: [{ id: 'txn-1' }], clearedBalance: 125.5 });
  });

  it('rejects invalid reconciliation payloads before writing', async () => {
    vi.mocked(prisma.account.findFirst).mockResolvedValue(account as any);

    const res = await request(makeApp())
      .post('/account-1/reconcile')
      .send({ statementDate: 'not-a-date', statementBalance: 100, clearedTransactionIds: [] });

    expect(res.status).toBe(400);
    expect(prisma.transactionJournal.updateMany).not.toHaveBeenCalled();
    expect(prisma.reconciliation.create).not.toHaveBeenCalled();
  });

  it('commits reconciliation only for selected live journals on the account', async () => {
    vi.mocked(prisma.account.findFirst).mockResolvedValue(account as any);
    vi.mocked(prisma.transactionJournal.updateMany).mockResolvedValue({ count: 2 } as any);
    vi.mocked(prisma.transactionJournal.aggregate).mockResolvedValue({ _sum: { amountDecimal: 500 } } as any);
    vi.mocked(prisma.reconciliation.findFirst).mockResolvedValue({ statementBalance: 100 } as any);
    vi.mocked(prisma.reconciliation.create).mockResolvedValue(reconcile as any);

    const res = await request(makeApp())
      .post('/account-1/reconcile')
      .send({
        statementDate: '2026-05-31T00:00:00.000Z',
        statementBalance: 500,
        clearedTransactionIds: ['txn-1', 'txn-2'],
      });

    expect(res.status).toBe(201);
    expect(prisma.account.findFirst).toHaveBeenCalledWith({
      where: { id: 'account-1', householdId: 'household-1', isDeleted: false },
    });
    expect(prisma.transactionJournal.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['txn-1', 'txn-2'] },
        householdId: 'household-1',
        entries: { some: { accountId: 'account-1' } },
        isDeleted: false,
      },
      data: { isReconciled: true, reconciledAt: new Date('2026-05-31T00:00:00.000Z') },
    });
    expect(prisma.transactionJournal.aggregate).toHaveBeenCalledWith({
      where: {
        householdId: 'household-1',
        entries: { some: { accountId: 'account-1' } },
        isReconciled: true,
        isDeleted: false,
      },
      _sum: { amountDecimal: true },
    });
    expect(res.body).toMatchObject({
      difference: 0,
      adjustmentCreated: false,
      reconciliation: { id: 'reconcile-1', statementBalance: 500, openingBalance: 100, difference: 0 },
    });
  });

  it('creates an adjustment journal when the statement does not match cleared totals', async () => {
    const tx = { transactionJournal: {} };
    vi.mocked(prisma.account.findFirst).mockResolvedValue(account as any);
    vi.mocked(prisma.transactionJournal.updateMany).mockResolvedValue({ count: 1 } as any);
    vi.mocked(prisma.transactionJournal.aggregate).mockResolvedValue({ _sum: { amountDecimal: 450 } } as any);
    vi.mocked(getVirtualAccountsByType).mockResolvedValue({ revenueAccountId: 'revenue-virtual' } as any);
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => fn(tx));
    vi.mocked(prisma.reconciliation.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.reconciliation.create).mockResolvedValue({ ...reconcile, difference: 50, openingBalance: 0 } as any);

    const res = await request(makeApp())
      .post('/account-1/reconcile')
      .send({
        statementDate: '2026-05-31T00:00:00.000Z',
        statementBalance: 500,
        clearedTransactionIds: ['txn-1'],
      });

    expect(res.status).toBe(201);
    expect(createJournalFromLegacyTransaction).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        householdId: 'household-1',
        accountId: 'account-1',
        description: 'Reconciliation Adjustment',
        amount: 50,
        date: new Date('2026-05-31T00:00:00.000Z'),
      }),
      undefined,
      'revenue-virtual',
    );
    expect(res.body.adjustmentCreated).toBe(true);
  });

  it('returns reconciliation history for active household accounts', async () => {
    vi.mocked(prisma.account.findFirst).mockResolvedValue(account as any);
    vi.mocked(prisma.reconciliation.findMany).mockResolvedValue([reconcile] as any);

    const res = await request(makeApp()).get('/account-1/reconcile/history');

    expect(res.status).toBe(200);
    expect(prisma.account.findFirst).toHaveBeenCalledWith({
      where: { id: 'account-1', householdId: 'household-1', isDeleted: false },
    });
    expect(prisma.reconciliation.findMany).toHaveBeenCalledWith({
      where: { accountId: 'account-1', householdId: 'household-1' },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    expect(res.body[0]).toMatchObject({ id: 'reconcile-1', statementBalance: 500, openingBalance: 100, difference: 0 });
  });
});


