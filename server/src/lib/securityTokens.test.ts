import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prismaMock } from '../test-setup';
import {
  consumeSecurityToken,
  createSecurityToken,
  deleteSecurityTokensForUser,
  SECURITY_TOKEN_TTLS,
} from './securityTokens';
import { hashToken } from './token';

describe('securityTokens', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-21T12:00:00.000Z'));
  });

  it('stores only the hashed token and returns the raw token', async () => {
    prismaMock.securityToken.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.securityToken.create.mockResolvedValue({
      id: 'tok_1',
      userId: 'user_1',
      type: 'email_verification',
      tokenHash: 'hash',
      expiresAt: new Date(),
      consumedAt: null,
      attemptCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await createSecurityToken('user_1', 'email_verification');

    expect(result.rawToken).toMatch(/^[a-f0-9]{80}$/);
    expect(result.expiresAt).toEqual(new Date(Date.now() + SECURITY_TOKEN_TTLS.email_verification));
    expect(prismaMock.securityToken.create).toHaveBeenCalledWith({
      data: {
        userId: 'user_1',
        type: 'email_verification',
        tokenHash: hashToken(result.rawToken),
        expiresAt: result.expiresAt,
      },
    });
    expect(prismaMock.securityToken.create).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ rawToken: result.rawToken }),
      }),
    );
  });

  it('consumes a valid token once', async () => {
    const tokenHash = hashToken('raw-token');
    prismaMock.securityToken.findUnique.mockResolvedValue({
      id: 'tok_1',
      userId: 'user_1',
      type: 'email_verification',
      tokenHash,
      expiresAt: new Date(Date.now() + SECURITY_TOKEN_TTLS.email_verification),
      consumedAt: null,
      attemptCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    prismaMock.securityToken.update.mockResolvedValue({} as never);

    const result = await consumeSecurityToken('raw-token', 'email_verification');

    expect(result).toEqual({ ok: true, userId: 'user_1' });
    expect(prismaMock.securityToken.findUnique).toHaveBeenCalledWith({ where: { tokenHash } });
    expect(prismaMock.securityToken.update).toHaveBeenCalledWith({
      where: { id: 'tok_1' },
      data: { consumedAt: expect.any(Date) },
    });
  });

  it('returns expired and increments attemptCount for expired tokens', async () => {
    prismaMock.securityToken.findUnique.mockResolvedValue({
      id: 'tok_1',
      userId: 'user_1',
      type: 'email_verification',
      tokenHash: hashToken('raw-token'),
      expiresAt: new Date(Date.now() - 1),
      consumedAt: null,
      attemptCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    prismaMock.securityToken.update.mockResolvedValue({} as never);

    const result = await consumeSecurityToken('raw-token', 'email_verification');

    expect(result).toEqual({ ok: false, reason: 'expired' });
    expect(prismaMock.securityToken.update).toHaveBeenCalledWith({
      where: { id: 'tok_1' },
      data: { attemptCount: { increment: 1 } },
    });
  });

  it('deletes unconsumed tokens by user and type', async () => {
    prismaMock.securityToken.deleteMany.mockResolvedValue({ count: 2 });

    await deleteSecurityTokensForUser('user_1', 'password_reset');

    expect(prismaMock.securityToken.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user_1', type: 'password_reset', consumedAt: null },
    });
  });
});
