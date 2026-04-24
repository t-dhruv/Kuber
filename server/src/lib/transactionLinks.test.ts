import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma', async () => {
  const actual = await vi.importActual('../lib/prisma');
  return {
    ...actual,
    prisma: {
      transactionLink: {
        create: vi.fn(),
        findMany: vi.fn(),
        delete: vi.fn(),
        findFirst: vi.fn(),
      },
      transactionLinkType: {
        findMany: vi.fn(),
      },
      transaction: {
        findFirst: vi.fn(),
      },
    },
  };
});

import { prisma } from '../lib/prisma';
import { listLinkTypes, createLink, deleteLink, getLinksForTransaction } from './transactionLinks';

describe('listLinkTypes', () => {
  it('returns all link types ordered by name', async () => {
    const types = [{ id: 'ltype-repayment', name: 'repayment', inward: 'is repaid by', outward: 'repays' }];
    (prisma.transactionLinkType.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(types);
    const result = await listLinkTypes();
    expect(result).toEqual(types);
    expect(prisma.transactionLinkType.findMany).toHaveBeenCalledWith({ orderBy: { name: 'asc' } });
  });
});

describe('createLink', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a link between two different transactions', async () => {
    (prisma.transaction.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'tx-1', householdId: 'hh-1' });
    (prisma.transactionLink.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      id:          'link-1',
      householdId: 'hh-1',
      linkTypeId:  'ltype-repayment',
      fromId:      'tx-1',
      toId:        'tx-2',
    });

    const result = await createLink({
      householdId: 'hh-1',
      linkTypeId:  'ltype-repayment',
      fromId:      'tx-1',
      toId:        'tx-2',
    });

    expect(prisma.transactionLink.create).toHaveBeenCalledWith({
      data:    { householdId: 'hh-1', linkTypeId: 'ltype-repayment', fromId: 'tx-1', toId: 'tx-2' },
      include: expect.any(Object),
    });
    expect(result.fromId).toBe('tx-1');
  });

  it('throws when transactions do not belong to household', async () => {
    (prisma.transaction.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await expect(
      createLink({ householdId: 'hh-1', linkTypeId: 'lt-1', fromId: 'tx-1', toId: 'tx-2' })
    ).rejects.toThrow('Transaction not found');
    expect(prisma.transactionLink.create).not.toHaveBeenCalled();
  });

  it('throws when fromId === toId', async () => {
    await expect(
      createLink({ householdId: 'hh-1', linkTypeId: 'lt-1', fromId: 'tx-1', toId: 'tx-1' })
    ).rejects.toThrow('Cannot link a transaction to itself');
    expect(prisma.transactionLink.create).not.toHaveBeenCalled();
  });
});

describe('getLinksForTransaction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('queries links where transactionId is from OR to', async () => {
    (prisma.transactionLink.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    await getLinksForTransaction({ householdId: 'hh-1', transactionId: 'tx-1' });
    expect(prisma.transactionLink.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          householdId: 'hh-1',
          OR: [{ fromId: 'tx-1' }, { toId: 'tx-1' }],
        },
      })
    );
  });
});

describe('deleteLink', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deletes link and returns it when found', async () => {
    const link = { id: 'link-1', householdId: 'hh-1' };
    (prisma.transactionLink.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(link);
    (prisma.transactionLink.delete as ReturnType<typeof vi.fn>).mockResolvedValue(link);

    const result = await deleteLink('link-1', 'hh-1');
    expect(result).toEqual(link);
    expect(prisma.transactionLink.delete).toHaveBeenCalledWith({ where: { id: 'link-1' } });
  });

  it('returns null when link not found', async () => {
    (prisma.transactionLink.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const result = await deleteLink('link-1', 'hh-1');
    expect(result).toBeNull();
    expect(prisma.transactionLink.delete).not.toHaveBeenCalled();
  });
});