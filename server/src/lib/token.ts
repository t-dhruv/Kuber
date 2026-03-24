import crypto from 'crypto';
import { prisma } from './prisma';

// SHA-256 hash of a raw token — fast, deterministic, safe for DB lookup
export function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

// Generate a cryptographically random raw token
export function generateRawToken(bytes = 40): string {
  return crypto.randomBytes(bytes).toString('hex');
}

// Create a refresh token row, returns the raw (unhashed) token to set as a cookie
export async function createRefreshToken(
  userId: string,
  familyId?: string,
): Promise<{ rawToken: string; familyId: string }> {
  const rawToken = generateRawToken();
  const tokenHash = hashToken(rawToken);
  const family = familyId ?? crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await prisma.refreshToken.create({
    data: { tokenHash, familyId: family, userId, expiresAt },
  });

  return { rawToken, familyId: family };
}

// Delete all tokens in a family (used on theft detection or logout)
export async function invalidateFamily(familyId: string): Promise<void> {
  await prisma.refreshToken.deleteMany({ where: { familyId } });
}
