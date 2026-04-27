import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runLogoFetchJob } from './logoFetchJob';

vi.mock('../lib/prisma', () => ({
  prisma: {
    logoCache: {
      findMany: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
    merchant: {
      findMany: vi.fn(),
    },
    account: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock('../services/logoService', () => ({
  getOrFetchBankLogo: vi.fn(),
  getOrFetchMerchantLogo: vi.fn(),
}));

import { prisma } from '../lib/prisma';
import { getOrFetchBankLogo, getOrFetchMerchantLogo } from '../services/logoService';

const mockPrisma = prisma as unknown as {
  logoCache: { findMany: ReturnType<typeof vi.fn>; upsert: ReturnType<typeof vi.fn>; deleteMany: ReturnType<typeof vi.fn> };
  merchant: { findMany: ReturnType<typeof vi.fn> };
  account: { findMany: ReturnType<typeof vi.fn> };
};

async function runJobWithTimers() {
  const jobPromise = runLogoFetchJob();
  await vi.runAllTimersAsync();
  await jobPromise;
}

describe('runLogoFetchJob', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mockPrisma.logoCache.findMany.mockImplementation(({ where }: { where: Record<string, unknown> }) => {
      if (where.type === 'merchant') return Promise.resolve([]);
      if (where.type === 'bank') return Promise.resolve([]);
      if ('logoData' in where) return Promise.resolve([]); // retry query
      return Promise.resolve([]);
    });
    mockPrisma.logoCache.upsert.mockResolvedValue({});
    mockPrisma.logoCache.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.account.findMany.mockResolvedValue([]);
    mockPrisma.merchant.findMany.mockResolvedValue([]);
    vi.mocked(getOrFetchBankLogo).mockResolvedValue(null);
    vi.mocked(getOrFetchMerchantLogo).mockResolvedValue(null);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fetches logo for merchant with no cache entry', async () => {
    mockPrisma.merchant.findMany.mockResolvedValue([{ name: 'Amazon' }]);
    vi.mocked(getOrFetchMerchantLogo).mockResolvedValue({ data: Buffer.from('img'), mimeType: 'image/png' });

    await runJobWithTimers();

    expect(getOrFetchMerchantLogo).toHaveBeenCalledWith('Amazon');
  });

  it('skips retry entries fetched within the last 24 hours', async () => {
    mockPrisma.merchant.findMany.mockResolvedValue([]);
    mockPrisma.account.findMany.mockResolvedValue([]);

    await runJobWithTimers();

    expect(getOrFetchMerchantLogo).not.toHaveBeenCalled();
    expect(getOrFetchBankLogo).not.toHaveBeenCalled();
  });

  it('retries failed entries older than 24 hours', async () => {
    mockPrisma.logoCache.findMany.mockImplementation(({ where }: { where: Record<string, unknown> }) => {
      if (where.type === 'merchant') return Promise.resolve([{ key: 'amazon' }]);
      if (where.type === 'bank') return Promise.resolve([]);
      if ('logoData' in where) return Promise.resolve([{ type: 'merchant', key: 'amazon' }]);
      return Promise.resolve([]);
    });
    mockPrisma.merchant.findMany.mockResolvedValue([]);
    mockPrisma.account.findMany.mockResolvedValue([]);
    mockPrisma.logoCache.deleteMany.mockResolvedValue({ count: 1 });
    vi.mocked(getOrFetchMerchantLogo).mockResolvedValue({ data: Buffer.from('img'), mimeType: 'image/png' });

    await runJobWithTimers();

    expect(mockPrisma.logoCache.deleteMany).toHaveBeenCalledWith({
      where: { type: 'merchant', key: 'amazon', logoData: null },
    });
    expect(getOrFetchMerchantLogo).toHaveBeenCalledWith('amazon');
  });

  it('writes negative cache entry when fetch fails', async () => {
    mockPrisma.merchant.findMany.mockResolvedValue([{ name: 'UnknownShop' }]);
    mockPrisma.account.findMany.mockResolvedValue([]);
    vi.mocked(getOrFetchMerchantLogo).mockResolvedValue(null);

    await runJobWithTimers();

    expect(mockPrisma.logoCache.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { type_key: { type: 'merchant', key: 'unknownshop' } },
        create: expect.objectContaining({ type: 'merchant', key: 'unknownshop', fetchedAt: expect.any(Date) }),
        update: expect.objectContaining({ fetchedAt: expect.any(Date) }),
      })
    );
  });

  it('deduplicates items that appear in both missing and retry sets', async () => {
    // amazon has no positive cache entry, so appears in missing; also in retry (stale failure)
    mockPrisma.logoCache.findMany.mockImplementation(({ where }: { where: Record<string, unknown> }) => {
      if (where.type === 'merchant') return Promise.resolve([]); // amazon not cached → appears in missing
      if (where.type === 'bank') return Promise.resolve([]);
      if ('logoData' in where) return Promise.resolve([{ type: 'merchant', key: 'amazon' }]); // stale retry
      return Promise.resolve([]);
    });
    mockPrisma.merchant.findMany.mockResolvedValue([{ name: 'Amazon' }]);
    mockPrisma.account.findMany.mockResolvedValue([]);
    vi.mocked(getOrFetchMerchantLogo).mockResolvedValue(null);

    await runJobWithTimers();

    expect(getOrFetchMerchantLogo).toHaveBeenCalledTimes(1);
  });

  it('processes at most 200 items per run', async () => {
    mockPrisma.merchant.findMany.mockResolvedValue(
      Array.from({ length: 300 }, (_, i) => ({ name: `Merchant${i}` }))
    );
    mockPrisma.account.findMany.mockResolvedValue([]);
    vi.mocked(getOrFetchMerchantLogo).mockResolvedValue(null);

    await runJobWithTimers();

    expect(getOrFetchMerchantLogo).toHaveBeenCalledTimes(200);
  });

  it('skips merchants that already have a successful cache entry', async () => {
    mockPrisma.logoCache.findMany.mockImplementation(({ where }: { where: Record<string, unknown> }) => {
      if (where.type === 'merchant') return Promise.resolve([{ key: 'amazon' }]);
      if (where.type === 'bank') return Promise.resolve([]);
      if ('logoData' in where) return Promise.resolve([]);
      return Promise.resolve([]);
    });
    mockPrisma.merchant.findMany.mockResolvedValue([{ name: 'Amazon' }]);
    mockPrisma.account.findMany.mockResolvedValue([]);

    await runJobWithTimers();

    expect(getOrFetchMerchantLogo).not.toHaveBeenCalled();
  });

  it('fetches bank logo for account institution with no cache entry', async () => {
    mockPrisma.account.findMany.mockResolvedValue([{ institution: 'Chase Bank' }]);
    mockPrisma.merchant.findMany.mockResolvedValue([]);
    vi.mocked(getOrFetchBankLogo).mockResolvedValue({ data: Buffer.from('img'), mimeType: 'image/png' });

    await runJobWithTimers();

    expect(getOrFetchBankLogo).toHaveBeenCalledWith('Chase Bank');
  });

  it('continues processing remaining items if one throws', async () => {
    mockPrisma.merchant.findMany.mockResolvedValue([
      { name: 'BadShop' },
      { name: 'GoodShop' },
    ]);
    mockPrisma.account.findMany.mockResolvedValue([]);
    vi.mocked(getOrFetchMerchantLogo)
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValueOnce({ data: Buffer.from('img'), mimeType: 'image/png' });

    await runJobWithTimers();

    expect(getOrFetchMerchantLogo).toHaveBeenCalledTimes(2);
  });
});
