import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { verify as totpVerify } from 'otplib';
import { prisma } from '../lib/prisma';
import { consumeSecurityToken, createSecurityToken } from '../lib/securityTokens';
import { sendEmailOtpEmail } from '../lib/email';

export type MfaMethod = 'totp' | 'email' | 'backup';

export type MfaUser = {
  id: string;
  email: string;
  emailVerifiedAt: Date | null;
  totpEnabled: boolean;
  totpSecret: string | null;
  emailMfaEnabled: boolean;
  backupCodes: string[];
};

export type MfaTempPayload = {
  userId: string;
  purpose: 'mfa';
  rememberMe: boolean;
};

export function getAvailableMfaMethods(user: MfaUser): MfaMethod[] {
  const methods: MfaMethod[] = [];
  if (user.totpEnabled && user.totpSecret) methods.push('totp');
  if (user.emailMfaEnabled && user.emailVerifiedAt) methods.push('email');
  if (user.backupCodes.length > 0) methods.push('backup');
  return methods;
}

export function signMfaTempToken(userId: string, rememberMe: boolean): string {
  return jwt.sign({ userId, purpose: 'mfa', rememberMe }, process.env.JWT_SECRET!, { expiresIn: '5m' });
}

export function verifyMfaTempToken(tempToken: string): MfaTempPayload | null {
  try {
    const payload = jwt.verify(tempToken, process.env.JWT_SECRET!) as Partial<MfaTempPayload>;
    if (payload.purpose !== 'mfa' || !payload.userId) return null;
    return { userId: payload.userId, purpose: 'mfa', rememberMe: !!payload.rememberMe };
  } catch {
    return null;
  }
}

export function verifyLegacyOrMfaTempToken(tempToken: string): { userId: string; rememberMe: boolean } | null {
  try {
    const payload = jwt.verify(tempToken, process.env.JWT_SECRET!) as { userId?: string; purpose?: string; rememberMe?: boolean };
    if (!payload.userId || !['2fa', 'mfa'].includes(payload.purpose ?? '')) return null;
    return { userId: payload.userId, rememberMe: !!payload.rememberMe };
  } catch {
    return null;
  }
}

export function generateEmailOtpCode(): string {
  return String(crypto.randomInt(100000, 1000000));
}

export async function sendEmailOtpChallenge(user: MfaUser): Promise<void> {
  if (!user.emailVerifiedAt || !user.emailMfaEnabled) return;

  const code = generateEmailOtpCode();
  await createSecurityToken(user.id, 'email_otp', { rawToken: code });
  await sendEmailOtpEmail(user.email, code);
}

export async function verifyMfaCode(user: MfaUser, method: MfaMethod, code: string): Promise<boolean> {
  if (method === 'totp') {
    if (!user.totpEnabled || !user.totpSecret) return false;
    return Boolean(totpVerify({ token: code, secret: user.totpSecret }));
  }

  if (method === 'email') {
    if (!user.emailVerifiedAt || !user.emailMfaEnabled) return false;
    const result = await consumeSecurityToken(code, 'email_otp', { maxAttempts: 5, userId: user.id });
    return result.ok && result.userId === user.id;
  }

  let matchIndex = -1;
  for (let i = 0; i < user.backupCodes.length; i++) {
    if (await bcrypt.compare(code, user.backupCodes[i])) {
      matchIndex = i;
      break;
    }
  }
  if (matchIndex === -1) return false;

  await prisma.user.update({
    where: { id: user.id },
    data: { backupCodes: user.backupCodes.filter((_, i) => i !== matchIndex) },
  });
  return true;
}
