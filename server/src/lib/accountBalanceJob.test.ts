import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from './prisma';
import { runAccountBalanceSnapshot } from './accountBalanceJob';

describe('runAccountBalanceSnapshot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-14T15:30:00.000Z'));
    vi.mocked(prisma.account.findMany).mockResolvedValue([]);
    vi.mocked(prisma.accountBalanceSnapshot.upsert).mockResolvedValue(undefined as never);
    vi.mocked(prisma.reportingSnapshot.upsert).mockResolvedValue(undefined as never);
    vi.mocked(prisma.reportingRollup.upsert).mockResolvedValue(undefined as never);
  });

  it('queries only visible non-deleted accounts for daily balance snapshots', async () => {
    await runAccountBalanceSnapshot();

    expect(prisma.account.findMany).toHaveBeenCalledWith({
      where: { isHidden: false, isDeleted: false },
      select: { id: true, householdId: true, balance: true },
    });
  });

  it('upserts account balance, reporting snapshot, and monthly rollup for each account', async () => {
    vi.mocked(prisma.account.findMany).mockResolvedValue([
      { id: 'account-1', householdId: 'household-1', balance: 123.45 },
      { id: 'account-2', householdId: 'household-2', balance: -50 },
    ] as never);

    await runAccountBalanceSnapshot();

    const today = new Date('2026-05-14T00:00:00.000Z');
    expect(prisma.accountBalanceSnapshot.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.accountBalanceSnapshot.upsert).toHaveBeenCalledWith({
      where: { accountId_date: { accountId: 'account-1', date: today } },
      update: { balance: 123.45 },
      create: {
        accountId: 'account-1',
        householdId: 'household-1',
        date: today,
        balance: 123.45,
      },
    });
    expect(prisma.reportingSnapshot.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          householdId_kind_snapshotDate_subjectId: {
            householdId: 'household-1',
            kind: 'account_balance',
            snapshotDate: today,
            subjectId: 'account-1',
          },
        },
        create: expect.objectContaining({
          householdId: 'household-1',
          kind: 'account_balance',
          periodKey: '2026-05',
          subjectId: 'account-1',
          payload: { balance: 123.45 },
          source: 'live',
        }),
      }),
    );
    expect(prisma.reportingRollup.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          householdId_kind_periodKey_subjectId: {
            householdId: 'household-1',
            kind: 'account_balance',
            periodKey: '2026-05',
            subjectId: 'account-1',
          },
        },
        create: expect.objectContaining({
          payload: { balance: 123.45 },
          source: 'daily_snapshots',
        }),
      }),
    );
  });
});
