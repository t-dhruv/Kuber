import { describe, it, expect, vi, beforeEach } from 'vitest';
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

describe('runLogoFetchJob', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.logoCache.findMany.mockResolvedValue([]);
    mockPrisma.logoCache.upsert.mockResolvedValue({});
    mockPrisma.logoCache.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.account.findMany.mockResolvedValue([]);
    mockPrisma.merchant.findMany.mockResolvedValue([]);
    vi.mocked(getOrFetchBankLogo).mockResolvedValue(null);
    vi.mocked(getOrFetchMerchantLogo).mockResolvedValue(null);
  });

  it('fetches logo for merchant with no cache entry', async () => {
    mockPrisma.merchant.findMany.mockResolvedValue([{ name: 'Amazon' }]);
    mockPrisma.logoCache.findMany.mockResolvedValue([]);
    vi.mocked(getOrFetchMerchantLogo).mockResolvedValue({ data: Buffer.from('img'), mimeType: 'image/png' });

    await runLogoFetchJob();

    expect(getOrFetchMerchantLogo).toHaveBeenCalledWith('Amazon');
  });
});
