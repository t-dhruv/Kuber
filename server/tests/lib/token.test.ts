import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../../src/lib/prisma';
import {
  DEFAULT_REFRESH_TTL_MS,
  REMEMBER_ME_REFRESH_TTL_MS,
  createRefreshToken,
  generateRawToken,
  hashToken,
  invalidateFamily,
} from '../../src/lib/token';

describe('token helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('hashes raw tokens with deterministic SHA-256 hex output', () => {
    expect(hashToken('raw-token')).toBe('34d328009b123fbbb0dc93f18b3e6de1ecf7b1a5783c33dff7ffe1926f09e943');
    expect(hashToken('raw-token')).toBe(hashToken('raw-token'));
    expect(hashToken('other-token')).not.toBe(hashToken('raw-token'));
  });

  it('generates cryptographically random hex tokens with requested byte length', () => {
    const token = generateRawToken(16);

    expect(token).toMatch(/^[a-f0-9]{32}$/);
    expect(generateRawToken(16)).not.toBe(token);
  });

  it('creates a hashed refresh token with default ttl and generated family id', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));

    const result = await createRefreshToken('user-1');

    expect(result.rawToken).toMatch(/^[a-f0-9]{80}$/);
    expect(result.familyId).toEqual(expect.any(String));
    expect(prisma.refreshToken.create).toHaveBeenCalledWith({
      data: {
        tokenHash: hashToken(result.rawToken),
        familyId: result.familyId,
        userId: 'user-1',
        expiresAt: new Date(Date.now() + DEFAULT_REFRESH_TTL_MS),
        rememberMe: false,
      },
    });

    vi.useRealTimers();
  });

  it('creates remember-me refresh tokens in an existing family with longer ttl', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));

    const result = await createRefreshToken('user-1', 'family-1', true);

    expect(result.familyId).toBe('family-1');
    expect(prisma.refreshToken.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          familyId: 'family-1',
          rememberMe: true,
          expiresAt: new Date(Date.now() + REMEMBER_ME_REFRESH_TTL_MS),
        }),
      }),
    );

    vi.useRealTimers();
  });

  it('invalidates every refresh token in a family', async () => {
    await invalidateFamily('family-1');

    expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({ where: { familyId: 'family-1' } });
  });
});

