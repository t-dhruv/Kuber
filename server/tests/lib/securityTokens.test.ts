import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prismaMock } from '../../src/test-setup';
import {
  consumeSecurityToken,
  createSecurityToken,
  deleteSecurityTokensForUser,
  SECURITY_TOKEN_TTLS,
} from '../../src/lib/securityTokens';
import { hashToken } from '../../src/lib/token';

describe('securityTokens', () => {
  beforeEach(() => {
    vi.resetAllMocks();
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

  it('stores a caller-provided raw token while hashing only the token', async () => {
    prismaMock.securityToken.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.securityToken.create.mockResolvedValue({
      id: 'tok_1',
      userId: 'user_1',
      type: 'email_otp',
      tokenHash: 'hash',
      expiresAt: new Date(),
      consumedAt: null,
      attemptCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await createSecurityToken('user_1', 'email_otp', { rawToken: '123456' });

    expect(result.rawToken).toBe('123456');
    expect(result.expiresAt).toEqual(new Date(Date.now() + SECURITY_TOKEN_TTLS.email_otp));
    expect(prismaMock.securityToken.create).toHaveBeenCalledWith({
      data: {
        userId: 'user_1',
        type: 'email_otp',
        tokenHash: hashToken('123456'),
        expiresAt: result.expiresAt,
      },
    });
    expect(prismaMock.securityToken.create).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ rawToken: '123456' }),
      }),
    );
  });

  it('allows repeated caller-provided email OTP hashes at the helper level', async () => {
    prismaMock.securityToken.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.securityToken.create.mockResolvedValue({
      id: 'tok_1',
      userId: 'user_1',
      type: 'email_otp',
      tokenHash: hashToken('123456'),
      expiresAt: new Date(),
      consumedAt: null,
      attemptCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await createSecurityToken('user_1', 'email_otp', { rawToken: '123456' });
    await createSecurityToken('user_1', 'email_otp', { rawToken: '123456' });

    expect(prismaMock.securityToken.create).toHaveBeenCalledTimes(2);
    expect(prismaMock.securityToken.create).toHaveBeenNthCalledWith(1, {
      data: expect.objectContaining({
        type: 'email_otp',
        tokenHash: hashToken('123456'),
      }),
    });
    expect(prismaMock.securityToken.create).toHaveBeenNthCalledWith(2, {
      data: expect.objectContaining({
        type: 'email_otp',
        tokenHash: hashToken('123456'),
      }),
    });
  });

  it('rejects caller-provided raw tokens for non-OTP token types', async () => {
    await expect(
      createSecurityToken('user_1', 'password_reset', { rawToken: '123456' }),
    ).rejects.toThrow('Caller-provided raw tokens are only supported for email OTP');

    expect(prismaMock.securityToken.deleteMany).not.toHaveBeenCalled();
    expect(prismaMock.securityToken.create).not.toHaveBeenCalled();
  });

  it('consumes a valid token once', async () => {
    const tokenHash = hashToken('raw-token');
    prismaMock.securityToken.findFirst.mockResolvedValue({
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
    expect(prismaMock.securityToken.findFirst).toHaveBeenCalledWith({
      where: { type: 'email_verification', tokenHash },
      orderBy: { createdAt: 'desc' },
    });
    expect(prismaMock.securityToken.update).toHaveBeenCalledWith({
      where: { id: 'tok_1' },
      data: { consumedAt: expect.any(Date) },
    });
  });

  it('counts a wrong email OTP attempt against the active user challenge', async () => {
    prismaMock.securityToken.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'tok_1',
        userId: 'user_1',
        type: 'email_otp',
        tokenHash: hashToken('123456'),
        expiresAt: new Date(Date.now() + SECURITY_TOKEN_TTLS.email_otp),
        consumedAt: null,
        attemptCount: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    prismaMock.securityToken.update.mockResolvedValue({} as never);

    const result = await consumeSecurityToken('000000', 'email_otp', { userId: 'user_1', maxAttempts: 3 });

    expect(result).toEqual({ ok: false, reason: 'missing' });
    expect(prismaMock.securityToken.findFirst).toHaveBeenNthCalledWith(1, {
      where: { userId: 'user_1', type: 'email_otp', tokenHash: hashToken('000000') },
      orderBy: { createdAt: 'desc' },
    });
    expect(prismaMock.securityToken.findFirst).toHaveBeenNthCalledWith(2, {
      where: {
        userId: 'user_1',
        type: 'email_otp',
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    expect(prismaMock.securityToken.update).toHaveBeenCalledWith({
      where: { id: 'tok_1' },
      data: { attemptCount: { increment: 1 } },
    });
  });

  it('does not consume another user email OTP token when scoped by userId', async () => {
    const tokenHash = hashToken('123456');
    prismaMock.securityToken.findFirst
      .mockResolvedValueOnce({
        id: 'tok_2',
        userId: 'user_2',
        type: 'email_otp',
        tokenHash,
        expiresAt: new Date(Date.now() + SECURITY_TOKEN_TTLS.email_otp),
        consumedAt: null,
        attemptCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .mockResolvedValueOnce({
        id: 'tok_1',
        userId: 'user_1',
        type: 'email_otp',
        tokenHash: hashToken('654321'),
        expiresAt: new Date(Date.now() + SECURITY_TOKEN_TTLS.email_otp),
        consumedAt: null,
        attemptCount: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    prismaMock.securityToken.update.mockResolvedValue({} as never);

    const result = await consumeSecurityToken('123456', 'email_otp', { userId: 'user_1', maxAttempts: 5 });

    expect(result).toEqual({ ok: false, reason: 'missing' });
    expect(prismaMock.securityToken.update).toHaveBeenCalledWith({
      where: { id: 'tok_1' },
      data: { attemptCount: { increment: 1 } },
    });
    expect(prismaMock.securityToken.update).not.toHaveBeenCalledWith({
      where: { id: 'tok_2' },
      data: { consumedAt: expect.any(Date) },
    });
  });

  it('consumes the requesting user email OTP when another user has the same token hash', async () => {
    const tokenHash = hashToken('123456');
    prismaMock.securityToken.findFirst.mockResolvedValue({
      id: 'tok_1',
      userId: 'user_1',
      type: 'email_otp',
      tokenHash,
      expiresAt: new Date(Date.now() + SECURITY_TOKEN_TTLS.email_otp),
      consumedAt: null,
      attemptCount: 0,
      createdAt: new Date(Date.now() - 1000),
      updatedAt: new Date(),
    });
    prismaMock.securityToken.update.mockResolvedValue({} as never);

    const result = await consumeSecurityToken('123456', 'email_otp', { userId: 'user_1', maxAttempts: 5 });

    expect(result).toEqual({ ok: true, userId: 'user_1' });
    expect(prismaMock.securityToken.findFirst).toHaveBeenCalledWith({
      where: {
        userId: 'user_1',
        type: 'email_otp',
        tokenHash,
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(prismaMock.securityToken.update).toHaveBeenCalledWith({
      where: { id: 'tok_1' },
      data: { consumedAt: expect.any(Date) },
    });
  });

  it('consumes the active email OTP challenge when a wrong attempt reaches maxAttempts', async () => {
    prismaMock.securityToken.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'tok_1',
        userId: 'user_1',
        type: 'email_otp',
        tokenHash: hashToken('123456'),
        expiresAt: new Date(Date.now() + SECURITY_TOKEN_TTLS.email_otp),
        consumedAt: null,
        attemptCount: 2,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    prismaMock.securityToken.update.mockResolvedValue({} as never);

    const result = await consumeSecurityToken('000000', 'email_otp', { userId: 'user_1', maxAttempts: 3 });

    expect(result).toEqual({ ok: false, reason: 'missing' });
    expect(prismaMock.securityToken.update).toHaveBeenCalledWith({
      where: { id: 'tok_1' },
      data: {
        attemptCount: { increment: 1 },
        consumedAt: expect.any(Date),
      },
    });
  });

  it('rejects and consumes an OTP after too many failed attempts', async () => {
    const tokenHash = hashToken('123456');
    prismaMock.securityToken.findFirst.mockResolvedValue({
      id: 'tok_1',
      userId: 'user_1',
      type: 'email_otp',
      tokenHash,
      expiresAt: new Date(Date.now() + SECURITY_TOKEN_TTLS.email_otp),
      consumedAt: null,
      attemptCount: 3,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    prismaMock.securityToken.update.mockResolvedValue({} as never);

    const result = await consumeSecurityToken('123456', 'email_otp', { maxAttempts: 3 });

    expect(result).toEqual({ ok: false, reason: 'too_many_attempts' });
    expect(prismaMock.securityToken.update).toHaveBeenCalledWith({
      where: { id: 'tok_1' },
      data: { consumedAt: expect.any(Date) },
    });
  });

  it('returns expired and increments attemptCount for expired tokens', async () => {
    prismaMock.securityToken.findFirst.mockResolvedValue({
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
