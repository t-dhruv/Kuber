import { prisma } from './prisma';
import { generateRawToken, hashToken } from './token';

export const SECURITY_TOKEN_TTLS = {
  email_verification: 24 * 60 * 60 * 1000,
  password_reset: 60 * 60 * 1000,
  email_otp: 10 * 60 * 1000,
} as const;

export type SecurityTokenType = keyof typeof SECURITY_TOKEN_TTLS;

type ConsumeResult =
  | { ok: true; userId: string }
  | { ok: false; reason: 'missing' | 'wrong_type' | 'expired' | 'consumed' | 'too_many_attempts' };

type CreateSecurityTokenOptions = {
  rawToken?: string;
};

type ConsumeSecurityTokenOptions = {
  maxAttempts?: number;
  userId?: string;
};

export async function createSecurityToken(
  userId: string,
  type: SecurityTokenType,
  options: CreateSecurityTokenOptions = {},
): Promise<{ rawToken: string; expiresAt: Date }> {
  if (options.rawToken !== undefined && type !== 'email_otp') {
    throw new Error('Caller-provided raw tokens are only supported for email OTP');
  }

  await deleteSecurityTokensForUser(userId, type);

  const rawToken = options.rawToken ?? generateRawToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + SECURITY_TOKEN_TTLS[type]);

  await prisma.securityToken.create({
    data: {
      userId,
      type,
      tokenHash,
      expiresAt,
    },
  });

  return { rawToken, expiresAt };
}

export async function consumeSecurityToken(
  rawToken: string,
  expectedType: SecurityTokenType,
  options: ConsumeSecurityTokenOptions = {},
): Promise<ConsumeResult> {
  const tokenHash = hashToken(rawToken);
  const tokenWhere =
    expectedType === 'email_otp' && options.userId
      ? { userId: options.userId, type: expectedType, tokenHash }
      : { type: expectedType, tokenHash };
  const token = await prisma.securityToken.findFirst({
    where: tokenWhere,
    orderBy: { createdAt: 'desc' },
  });

  if (!token) {
    await recordMissingEmailOtpAttempt(expectedType, options);
    return { ok: false, reason: 'missing' };
  }
  if (expectedType === 'email_otp' && options.userId && token.userId !== options.userId) {
    await recordMissingEmailOtpAttempt(expectedType, options);
    return { ok: false, reason: 'missing' };
  }
  if (token.type !== expectedType) return { ok: false, reason: 'wrong_type' };
  if (token.consumedAt) return { ok: false, reason: 'consumed' };

  if (token.expiresAt <= new Date()) {
    await prisma.securityToken.update({
      where: { id: token.id },
      data: { attemptCount: { increment: 1 } },
    });
    return { ok: false, reason: 'expired' };
  }

  if (options.maxAttempts !== undefined && token.attemptCount >= options.maxAttempts) {
    await prisma.securityToken.update({
      where: { id: token.id },
      data: { consumedAt: new Date() },
    });
    return { ok: false, reason: 'too_many_attempts' };
  }

  await prisma.securityToken.update({
    where: { id: token.id },
    data: { consumedAt: new Date() },
  });

  return { ok: true, userId: token.userId };
}

async function recordMissingEmailOtpAttempt(
  expectedType: SecurityTokenType,
  options: ConsumeSecurityTokenOptions,
): Promise<void> {
  if (expectedType !== 'email_otp' || !options.userId) return;

  const token = await prisma.securityToken.findFirst({
    where: {
      userId: options.userId,
      type: 'email_otp',
      consumedAt: null,
      expiresAt: { gt: new Date() },
    },
  });

  if (!token) return;

  const reachesMaxAttempts = options.maxAttempts !== undefined && token.attemptCount + 1 >= options.maxAttempts;

  await prisma.securityToken.update({
    where: { id: token.id },
    data: {
      attemptCount: { increment: 1 },
      ...(reachesMaxAttempts ? { consumedAt: new Date() } : {}),
    },
  });
}

export async function deleteSecurityTokensForUser(userId: string, type: SecurityTokenType): Promise<void> {
  await prisma.securityToken.deleteMany({
    where: { userId, type, consumedAt: null },
  });
}
