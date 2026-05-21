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
  | { ok: false; reason: 'missing' | 'wrong_type' | 'expired' | 'consumed' };

export async function createSecurityToken(
  userId: string,
  type: SecurityTokenType,
): Promise<{ rawToken: string; expiresAt: Date }> {
  await deleteSecurityTokensForUser(userId, type);

  const rawToken = generateRawToken();
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
): Promise<ConsumeResult> {
  const tokenHash = hashToken(rawToken);
  const token = await prisma.securityToken.findUnique({ where: { tokenHash } });

  if (!token) return { ok: false, reason: 'missing' };
  if (token.type !== expectedType) return { ok: false, reason: 'wrong_type' };
  if (token.consumedAt) return { ok: false, reason: 'consumed' };

  if (token.expiresAt <= new Date()) {
    await prisma.securityToken.update({
      where: { id: token.id },
      data: { attemptCount: { increment: 1 } },
    });
    return { ok: false, reason: 'expired' };
  }

  await prisma.securityToken.update({
    where: { id: token.id },
    data: { consumedAt: new Date() },
  });

  return { ok: true, userId: token.userId };
}

export async function deleteSecurityTokensForUser(userId: string, type: SecurityTokenType): Promise<void> {
  await prisma.securityToken.deleteMany({
    where: { userId, type, consumedAt: null },
  });
}
