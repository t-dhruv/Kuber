import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../../src/lib/prisma';
import {
  deleteHolding,
  deleteHoldingsByAccountId,
  deleteHoldingsByIds,
  deleteHoldingRecurring,
  skipLot,
  softDeleteHoldingsByIds,
} from '../../src/services/investmentService';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    investmentHolding: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    holdingLot: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    dividendRecord: {
      updateMany: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    recurringInvestment: {
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    account: { findFirst: vi.fn() },
    $transaction: vi.fn(async (ops: unknown) => (Array.isArray(ops) ? Promise.all(ops) : ops)),
  },
}));

vi.mock('../../src/lib/priceCache', () => ({
  getQuotes: vi.fn(),
  getQuote: vi.fn(),
  getLiveBenchmarks: vi.fn(),
}));

/**
 * Financial records are never hard-deleted. HoldingLot, DividendRecord and
 * RecurringInvestment all cascade from InvestmentHolding at the database level,
 * so a single hard delete would destroy a holding's whole trade history and
 * cost basis. These tests assert no delete/deleteMany ever reaches Prisma for
 * the investment models.
 */
function expectNoHardDeletes() {
  for (const model of ['investmentHolding', 'holdingLot', 'dividendRecord', 'recurringInvestment'] as const) {
    expect(prisma[model].delete, `${model}.delete`).not.toHaveBeenCalled();
    expect(prisma[model].deleteMany, `${model}.deleteMany`).not.toHaveBeenCalled();
  }
}

describe('investment soft delete', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('soft-deletes a holding and everything cascading from it', async () => {
    vi.mocked(prisma.investmentHolding.findFirst).mockResolvedValue({ id: 'holding-1' } as never);

    const result = await deleteHolding('household-1', 'holding-1');

    expect(result).toEqual({ success: true });
    for (const model of ['holdingLot', 'dividendRecord', 'recurringInvestment'] as const) {
      expect(prisma[model].updateMany).toHaveBeenCalledWith({
        where: { holdingId: { in: ['holding-1'] }, isDeleted: false },
        data: { isDeleted: true },
      });
    }
    expect(prisma.investmentHolding.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['holding-1'] }, isDeleted: false },
      data: { isDeleted: true },
    });
    expectNoHardDeletes();
  });

  it('does not touch an already soft-deleted holding', async () => {
    vi.mocked(prisma.investmentHolding.findFirst).mockResolvedValue(null as never);

    expect(await deleteHolding('household-1', 'holding-gone')).toBeNull();
    expect(prisma.investmentHolding.updateMany).not.toHaveBeenCalled();
    expectNoHardDeletes();
  });

  it('scopes the holding lookup to the household and excludes deleted rows', async () => {
    vi.mocked(prisma.investmentHolding.findFirst).mockResolvedValue({ id: 'holding-1' } as never);

    await deleteHolding('household-1', 'holding-1');

    expect(prisma.investmentHolding.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'holding-1',
        isDeleted: false,
        account: { householdId: 'household-1', isDeleted: false },
      },
    });
  });

  it('soft-deletes every live holding when an account is closed', async () => {
    vi.mocked(prisma.account.findFirst).mockResolvedValue({ id: 'account-1' } as never);
    vi.mocked(prisma.investmentHolding.findMany).mockResolvedValue([
      { id: 'holding-1' },
      { id: 'holding-2' },
    ] as never);

    expect(await deleteHoldingsByAccountId('household-1', 'account-1')).toEqual({ deleted: 2 });
    expect(prisma.investmentHolding.findMany).toHaveBeenCalledWith({
      where: { accountId: 'account-1', isDeleted: false },
      select: { id: true },
    });
    expect(prisma.holdingLot.updateMany).toHaveBeenCalledWith({
      where: { holdingId: { in: ['holding-1', 'holding-2'] }, isDeleted: false },
      data: { isDeleted: true },
    });
    expectNoHardDeletes();
  });

  it('only soft-deletes bulk ids that belong to the household', async () => {
    vi.mocked(prisma.investmentHolding.findMany).mockResolvedValue([{ id: 'mine-1' }] as never);

    expect(await deleteHoldingsByIds('household-1', ['mine-1', 'someone-elses'])).toEqual({ deleted: 1 });
    expect(prisma.investmentHolding.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['mine-1'] }, isDeleted: false },
      data: { isDeleted: true },
    });
    expectNoHardDeletes();
  });

  it('is a no-op when there is nothing to soft-delete', async () => {
    expect(await softDeleteHoldingsByIds([])).toBe(0);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expectNoHardDeletes();
  });

  it('soft-deletes a skipped lot instead of destroying it', async () => {
    vi.mocked(prisma.holdingLot.findFirst).mockResolvedValue({ id: 'lot-1', holdingId: 'holding-1' } as never);

    expect(await skipLot('household-1', 'lot-1')).toEqual({ message: 'Lot skipped' });
    expect(prisma.holdingLot.update).toHaveBeenCalledWith({
      where: { id: 'lot-1' },
      data: { isDeleted: true },
    });
    expectNoHardDeletes();
  });

  it('soft-deletes a recurring schedule', async () => {
    vi.mocked(prisma.recurringInvestment.findFirst).mockResolvedValue({ id: 'sched-1' } as never);

    expect(await deleteHoldingRecurring('household-1', 'sched-1')).toEqual({ message: 'Deleted' });
    expect(prisma.recurringInvestment.update).toHaveBeenCalledWith({
      where: { id: 'sched-1' },
      data: { isDeleted: true },
    });
    expectNoHardDeletes();
  });
});
