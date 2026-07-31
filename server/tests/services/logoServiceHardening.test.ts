import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../../src/lib/prisma';
import { getOrFetchBankLogo } from '../../src/services/logoService';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    logoCache: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

function okResponse(bytes: number, contentLength?: string) {
  return {
    ok: true,
    headers: {
      get: (h: string) =>
        h === 'content-type' ? 'image/png' : h === 'content-length' ? (contentLength ?? String(bytes)) : null,
    },
    arrayBuffer: async () => new ArrayBuffer(bytes),
  };
}

describe('logo service hardening', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.logoCache.findUnique).mockResolvedValue(null as never);
  });

  it('records a miss so repeat lookups do not refetch upstream', async () => {
    // Both upstreams fail — this is the amplification case: an unauthenticated
    // caller asking for an unknown name repeatedly.
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, headers: { get: () => null } })));

    expect(await getOrFetchBankLogo('Not A Real Bank')).toBeNull();

    expect(prisma.logoCache.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ type: 'bank', source: 'miss' }),
      }),
    );
  });

  it('answers a known miss from cache without any outbound fetch', async () => {
    vi.mocked(prisma.logoCache.findUnique).mockResolvedValue({ logoData: null, mimeType: null } as never);
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    expect(await getOrFetchBankLogo('Not A Real Bank')).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects an oversized upstream body by declared content-length', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => okResponse(8, String(2 * 1024 * 1024))));

    expect(await getOrFetchBankLogo('Huge Bank')).toBeNull();
    // Nothing that large should ever reach the database.
    expect(prisma.logoCache.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ source: 'miss' }) }),
    );
  });

  it('rejects an oversized upstream body when content-length lies', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => okResponse(2 * 1024 * 1024, '10')));

    expect(await getOrFetchBankLogo('Lying Bank')).toBeNull();
  });

  it('still stores a normally sized logo', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => okResponse(2048)));

    const result = await getOrFetchBankLogo('Chase Bank');

    expect(result?.mimeType).toBe('image/png');
    expect(result?.data.byteLength).toBe(2048);
    expect(prisma.logoCache.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ source: 'clearbit' }) }),
    );
  });
});
