import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock prisma before importing the module under test ───────────────────────
// vi.mock is hoisted to the top of the file, so we use vi.hoisted() for fns
// that need to be referenced inside the factory.

const { mockHouseholdFindMany, mockAccountFindMany, mockNetWorthSnapshotUpsert } = vi.hoisted(() => ({
  mockHouseholdFindMany: vi.fn(),
  mockAccountFindMany: vi.fn(),
  mockNetWorthSnapshotUpsert: vi.fn(),
}));

vi.mock('./prisma', () => ({
  prisma: {
    household: { findMany: mockHouseholdFindMany },
    account: { findMany: mockAccountFindMany },
    netWorthSnapshot: { upsert: mockNetWorthSnapshotUpsert },
  },
}));

import { takeNetWorthSnapshot } from './netWorthJob';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeAccount(
  balance: number,
  type: string,
): { balance: number; type: string } {
  return { balance, type };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('takeNetWorthSnapshot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNetWorthSnapshotUpsert.mockResolvedValue({});
  });

  it('sums asset accounts and subtracts liabilities correctly', async () => {
    mockHouseholdFindMany.mockResolvedValue([{ id: 'hh-1' }]);
    mockAccountFindMany.mockResolvedValue([
      makeAccount(10_000, 'CHECKING'),   // asset
      makeAccount(5_000, 'SAVINGS'),     // asset
      makeAccount(-2_000, 'CREDIT_CARD'), // liability (negative balance)
      makeAccount(-3_000, 'LOAN'),        // liability (negative balance)
    ]);

    await takeNetWorthSnapshot();

    const call = mockNetWorthSnapshotUpsert.mock.calls[0][0];
    expect(call.create.assets).toBe(15_000);
    expect(call.create.liabilities).toBe(5_000); // Math.abs(-2000) + Math.abs(-3000)
    expect(call.create.netWorth).toBe(10_000);   // 15000 - 5000
  });

  it('calls prisma.netWorthSnapshot.upsert with the correct shape', async () => {
    mockHouseholdFindMany.mockResolvedValue([{ id: 'hh-abc' }]);
    mockAccountFindMany.mockResolvedValue([makeAccount(1_000, 'CHECKING')]);

    await takeNetWorthSnapshot();

    expect(mockNetWorthSnapshotUpsert).toHaveBeenCalledTimes(1);
    const [args] = mockNetWorthSnapshotUpsert.mock.calls[0];

    expect(args.where.householdId_date.householdId).toBe('hh-abc');
    expect(args.create.householdId).toBe('hh-abc');
    expect(args.update).toMatchObject({ assets: 1_000, liabilities: 0, netWorth: 1_000 });
    expect(args.create).toMatchObject({ assets: 1_000, liabilities: 0, netWorth: 1_000 });
  });

  it('produces a netWorth of 0 when there are no accounts', async () => {
    mockHouseholdFindMany.mockResolvedValue([{ id: 'hh-empty' }]);
    mockAccountFindMany.mockResolvedValue([]);

    await takeNetWorthSnapshot();

    const call = mockNetWorthSnapshotUpsert.mock.calls[0][0];
    expect(call.create.assets).toBe(0);
    expect(call.create.liabilities).toBe(0);
    expect(call.create.netWorth).toBe(0);
  });

  it('only snapshots the given household when householdId is provided', async () => {
    mockAccountFindMany.mockResolvedValue([makeAccount(500, 'SAVINGS')]);

    await takeNetWorthSnapshot('specific-hh');

    // household.findMany should NOT be called — we short-circuit to a fixed array
    expect(mockHouseholdFindMany).not.toHaveBeenCalled();
    expect(mockNetWorthSnapshotUpsert).toHaveBeenCalledTimes(1);
    const call = mockNetWorthSnapshotUpsert.mock.calls[0][0];
    expect(call.create.householdId).toBe('specific-hh');
  });

  it('snapshots every household when no householdId is provided', async () => {
    mockHouseholdFindMany.mockResolvedValue([{ id: 'hh-1' }, { id: 'hh-2' }]);
    mockAccountFindMany.mockResolvedValue([makeAccount(100, 'CHECKING')]);

    await takeNetWorthSnapshot();

    expect(mockNetWorthSnapshotUpsert).toHaveBeenCalledTimes(2);
  });

  it('uses today\'s date (midnight) as the snapshot date', async () => {
    mockHouseholdFindMany.mockResolvedValue([{ id: 'hh-1' }]);
    mockAccountFindMany.mockResolvedValue([]);

    const before = new Date();
    before.setHours(0, 0, 0, 0);

    await takeNetWorthSnapshot();

    const call = mockNetWorthSnapshotUpsert.mock.calls[0][0];
    const snapshotDate: Date = call.where.householdId_date.date;
    expect(snapshotDate.getHours()).toBe(0);
    expect(snapshotDate.getMinutes()).toBe(0);
    expect(snapshotDate.getSeconds()).toBe(0);
    expect(snapshotDate.getMilliseconds()).toBe(0);
  });

  it('handles positive balance on a LOAN account (absolute value used for liabilities)', async () => {
    // Edge case: some imports might store loan balances as positive numbers
    mockHouseholdFindMany.mockResolvedValue([{ id: 'hh-1' }]);
    mockAccountFindMany.mockResolvedValue([makeAccount(5_000, 'LOAN')]);

    await takeNetWorthSnapshot();

    const call = mockNetWorthSnapshotUpsert.mock.calls[0][0];
    expect(call.create.liabilities).toBe(5_000);
    expect(call.create.assets).toBe(0);
    expect(call.create.netWorth).toBe(-5_000);
  });
});
