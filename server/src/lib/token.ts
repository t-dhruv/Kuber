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

const DEFAULT_REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;    // 7 days
const REMEMBER_ME_REFRESH_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

export { DEFAULT_REFRESH_TTL_MS, REMEMBER_ME_REFRESH_TTL_MS };

// Create a refresh token row, returns the raw (unhashed) token to set as a cookie
export async function createRefreshToken(
  userId: string,
  familyId?: string,
  rememberMe = false,
): Promise<{ rawToken: string; familyId: string }> {
  const rawToken = generateRawToken();
  const tokenHash = hashToken(rawToken);
  const family = familyId ?? crypto.randomUUID();
  const ttlMs = rememberMe ? REMEMBER_ME_REFRESH_TTL_MS : DEFAULT_REFRESH_TTL_MS;
  const expiresAt = new Date(Date.now() + ttlMs);

  await prisma.refreshToken.create({
    data: { tokenHash, familyId: family, userId, expiresAt, rememberMe },
  });

  return { rawToken, familyId: family };
}

// Delete all tokens in a family (used on theft detection or logout)
export async function invalidateFamily(familyId: string): Promise<void> {
  await prisma.refreshToken.deleteMany({ where: { familyId } });
}
