import { beforeEach, describe, expect, it, vi } from 'vitest';
import { processRecurringItems, advanceNextDate } from './recurringJob';

describe('advanceNextDate', () => {
  it('advances daily by 1 day', () => {
    const d = new Date('2026-04-23');
    expect(advanceNextDate(d, 'daily').toISOString().slice(0, 10)).toBe('2026-04-24');
  });

  it('advances weekly by 7 days', () => {
    const d = new Date('2026-04-23');
    expect(advanceNextDate(d, 'weekly').toISOString().slice(0, 10)).toBe('2026-04-30');
  });

  it('advances monthly by 1 month', () => {
    const d = new Date('2026-01-31');
    expect(advanceNextDate(d, 'monthly').toISOString().slice(0, 10)).toBe('2026-02-28');
  });

  it('advances yearly by 1 year', () => {
    const d = new Date('2026-04-23');
    expect(advanceNextDate(d, 'yearly').toISOString().slice(0, 10)).toBe('2027-04-23');
  });
});

describe('processRecurringItems', () => {
  function makePrisma({ items = [] }: { items?: any[] } = {}) {
    const txCreate = vi.fn().mockResolvedValue({ id: 'tx-new' });
    const riUpdate = vi.fn().mockResolvedValue({});
    const riFindMany = vi.fn().mockResolvedValue(items);
    return {
      prisma: {
        recurringItem: { findMany: riFindMany, update: riUpdate },
        transaction: { create: txCreate },
      },
      txCreate, riUpdate, riFindMany,
    };
  }

  beforeEach(() => { vi.clearAllMocks(); });

  it('skips items where isAutopay is false', async () => {
    const { prisma, txCreate } = makePrisma({
      items: [{ id: 'ri-1', isAutopay: false, nextDate: new Date('2026-04-01'), frequency: 'monthly', householdId: 'hh-1', accountId: 'acc-1', amount: 100, name: 'Rent', categoryId: null }],
    });
    await processRecurringItems(prisma as any);
    expect(txCreate).not.toHaveBeenCalled();
  });

  it('creates transaction and advances nextDate for overdue autopay item', async () => {
    const nextDate = new Date('2026-04-01');
    const { prisma, txCreate, riUpdate } = makePrisma({
      items: [{ id: 'ri-1', isAutopay: true, nextDate, frequency: 'monthly', householdId: 'hh-1', accountId: 'acc-1', amount: 1200, name: 'Rent', categoryId: 'cat-1' }],
    });
    await processRecurringItems(prisma as any);
    expect(txCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        householdId: 'hh-1',
        accountId: 'acc-1',
        categoryId: 'cat-1',
        description: 'Rent',
        amount: -1200,
        date: nextDate,
        isRecurring: true,
        recurringItemId: 'ri-1',
        needsReview: false,
      }),
    });
    expect(riUpdate).toHaveBeenCalledWith({
      where: { id: 'ri-1' },
      data: expect.objectContaining({ lastProcessedAt: expect.any(Date) }),
    });
  });
});
