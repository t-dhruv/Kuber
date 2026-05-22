import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { z } from 'zod';
import { generateSecret as totpGenerateSecret, verify as totpVerify, generateURI as totpGenerateURI } from 'otplib';
import { toDataURL } from 'qrcode';
import { prisma } from '../lib/prisma';
import { createRefreshToken, invalidateFamily, hashToken, DEFAULT_REFRESH_TTL_MS, REMEMBER_ME_REFRESH_TTL_MS } from '../lib/token';
import { consumeSecurityToken, createSecurityToken } from '../lib/securityTokens';
import { sendPasswordResetEmail, sendAccountLockoutEmail, sendWelcomeEmail, sendEmailVerificationEmail } from '../lib/email';
import { requireAuth } from '../middleware/auth';
import { seedDefaultCategories } from '../lib/default-categories';
import type { AuthRequest } from '../middleware/auth';
import type { UserDto } from '@kuber/shared';
import { createModuleLogger } from '../lib/logger';
import {
  getAvailableMfaMethods,
  sendEmailOtpChallenge,
  signMfaTempToken,
  verifyLegacyOrMfaTempToken,
  verifyMfaCode,
  verifyMfaTempToken,
} from '../services/mfaService';

const log = createModuleLogger('auth');
const router = Router();

const ACCESS_TOKEN_TTL = '15m';
const BCRYPT_ROUNDS = 12;

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  householdName: z.string().min(1).optional(),
  inviteToken: z.string().min(1).optional(),
}).refine((data) => data.householdName || data.inviteToken, {
  message: 'All fields are required',
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  rememberMe: z.boolean().optional(),
});

const tokenSchema = z.object({
  token: z.string().min(1),
});

const resendVerificationSchema = z.object({
  email: z.string().email(),
});

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8),
});

const mfaTempTokenSchema = z.object({
  tempToken: z.string().min(1),
});

const mfaVerifySchema = z.object({
  tempToken: z.string().min(1),
  method: z.enum(['totp', 'email', 'backup']),
  code: z.string().min(1),
});

const passwordConfirmSchema = z.object({
  password: z.string().min(1),
});

// Lockout thresholds: { attemptCount → lockDurationMs }
const LOCKOUT_THRESHOLDS: [number, number][] = [
  [5, 15 * 60 * 1000],      // 5 attempts → 15 min
  [8, 60 * 60 * 1000],      // 8 attempts → 1 hr
  [10, 24 * 60 * 60 * 1000], // 10+ attempts → 24 hr
];

function getLockDuration(attempts: number): number | null {
  for (let i = LOCKOUT_THRESHOLDS.length - 1; i >= 0; i--) {
    if (attempts >= LOCKOUT_THRESHOLDS[i][0]) return LOCKOUT_THRESHOLDS[i][1];
  }
  return null;
}

function toUserDto(
  user: { id: string; email: string; firstName: string; lastName: string; avatar: string | null; timezone: string; theme: string },
  householdId: string,
): UserDto {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    avatar: user.avatar,
    timezone: user.timezone,
    theme: user.theme as 'light' | 'dark' | 'system',
    householdId,
  };
}

function signAccessToken(userId: string, householdId: string, email: string): string {
  return jwt.sign({ userId, householdId, email }, process.env.JWT_SECRET!, { expiresIn: ACCESS_TOKEN_TTL });
}

function setRefreshCookie(res: Response, rawToken: string, rememberMe = false) {
  const maxAge = rememberMe ? REMEMBER_ME_REFRESH_TTL_MS : DEFAULT_REFRESH_TTL_MS;
  res.cookie('refreshToken', rawToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge,
    path: '/',
  });
}

// ─── POST /signup ─────────────────────────────────────────────────────────────

router.post('/signup', async (req: Request, res: Response) => {
  try {
    const parsed = signupSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid signup request' });
    }

    const { email, password, firstName, lastName, householdName, inviteToken } = parsed.data;
    const normalizedEmail = email.toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) return res.status(409).json({ error: 'Email already in use' });

    let invite: { id: string; householdId: string; email: string; role: string; expiresAt: Date; usedAt: Date | null } | null = null;
    if (inviteToken) {
      invite = await prisma.householdInvite.findUnique({ where: { token: inviteToken } });
      if (!invite || invite.usedAt || invite.expiresAt <= new Date()) {
        return res.status(400).json({ error: 'Invite is invalid or expired' });
      }
      if (invite.email.toLowerCase() !== normalizedEmail) {
        return res.status(400).json({ error: 'Invite is for a different email address' });
      }
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    const result = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: { email: normalizedEmail, passwordHash, firstName, lastName },
      });
      if (invite) {
        await tx.householdMember.create({
          data: { userId: newUser.id, householdId: invite.householdId, role: invite.role },
        });
        await tx.householdInvite.update({
          where: { id: invite.id },
          data: { usedAt: new Date() },
        });
        return { user: newUser, householdId: invite.householdId };
      }
      const household = await tx.household.create({ data: { name: householdName! } });
      await tx.householdMember.create({
        data: { userId: newUser.id, householdId: household.id, role: 'owner' },
      });
      // Seed default categories so the household is usable immediately
      await seedDefaultCategories(tx, household.id);
      return { user: newUser, householdId: household.id };
    });

    const { rawToken } = await createSecurityToken(result.user.id, 'email_verification');

    sendEmailVerificationEmail(result.user.email, rawToken).catch(() => {});
    sendWelcomeEmail(result.user.email, result.user.firstName).catch(() => {});

    return res.status(201).json({
      requireEmailVerification: true,
      email: result.user.email,
      message: 'Check your email to verify your account.',
    });
  } catch (err) {
    log.error({ err }, 'auth/signup');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── POST /verify-email ───────────────────────────────────────────────────────

router.post('/verify-email', async (req: Request, res: Response) => {
  try {
    const parsed = tokenSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Verification token is required' });

    const result = await consumeSecurityToken(parsed.data.token, 'email_verification');
    if (!result.ok) return res.status(400).json({ error: 'Invalid or expired verification token' });

    await prisma.user.update({
      where: { id: result.userId },
      data: { emailVerifiedAt: new Date() },
    });

    return res.json({ message: 'Email verified successfully' });
  } catch (err) {
    log.error({ err }, 'auth/verify-email');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── POST /resend-verification ───────────────────────────────────────────────

router.post('/resend-verification', async (req: Request, res: Response) => {
  try {
    const parsed = resendVerificationSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.json({ message: 'If that email needs verification, a new link has been sent.' });
    }

    const user = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
    if (user && !user.emailVerifiedAt) {
      const { rawToken } = await createSecurityToken(user.id, 'email_verification');
      await sendEmailVerificationEmail(user.email, rawToken);
    }

    return res.json({ message: 'If that email needs verification, a new link has been sent.' });
  } catch (err) {
    log.error({ err }, 'auth/resend-verification');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── POST /login ──────────────────────────────────────────────────────────────

router.post('/login', async (req: Request, res: Response) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Email and password are required' });

    const { email, password, rememberMe = false } = parsed.data;

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: { householdMembers: { take: 1 } },
    });

    // Check lockout before doing bcrypt (saves CPU on locked accounts)
    if (user?.lockedUntil && user.lockedUntil > new Date()) {
      const secondsLeft = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 1000);
      return res.status(429).json({
        error: `Account locked. Try again in ${Math.ceil(secondsLeft / 60)} minute(s).`,
        lockedUntilMs: user.lockedUntil.getTime(),
      });
    }

    // Always run bcrypt to prevent timing attacks — even if user not found
    const dummyHash = '$2b$12$invalidhashfortimingnormalization000000000000000000000';
    const valid = user ? await bcrypt.compare(password, user.passwordHash) : await bcrypt.compare(password, dummyHash).then(() => false);

    if (!user || !valid) {
      if (user) {
        const newAttempts = user.failedLoginAttempts + 1;
        const lockDuration = getLockDuration(newAttempts);
        const lockedUntil = lockDuration ? new Date(Date.now() + lockDuration) : null;

        await prisma.user.update({
          where: { id: user.id },
          data: { failedLoginAttempts: newAttempts, lockedUntil },
        });

        if (lockedUntil) {
          sendAccountLockoutEmail(user.email, lockedUntil).catch(() => {});
        }
      }
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (!user.emailVerifiedAt) {
      return res.status(403).json({
        requireEmailVerification: true,
        email: user.email,
        error: 'Verify your email before signing in.',
      });
    }

    const householdId = user.householdMembers[0]?.householdId;
    if (!householdId) return res.status(400).json({ error: 'User has no household' });

    // Reset lockout on success
    if (user.failedLoginAttempts > 0) {
      await prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: 0, lockedUntil: null },
      });
    }

    const mfaMethods = getAvailableMfaMethods(user);
    if (mfaMethods.length > 0) {
      const tempToken = signMfaTempToken(user.id, !!rememberMe);
      return res.json({ requireMfa: true, tempToken, methods: mfaMethods });
    }

    const accessToken = signAccessToken(user.id, householdId, user.email);
    const { rawToken } = await createRefreshToken(user.id, undefined, !!rememberMe);
    setRefreshCookie(res, rawToken, !!rememberMe);

    return res.json({ user: toUserDto(user, householdId), accessToken });
  } catch (err) {
    log.error({ err }, 'auth/login');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── POST /refresh ────────────────────────────────────────────────────────────

router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const rawToken = req.cookies?.refreshToken as string | undefined;
    if (!rawToken) return res.status(401).json({ error: 'No refresh token' });

    const tokenHash = hashToken(rawToken);
    const stored = await prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: { include: { householdMembers: { take: 1 } } } },
    });

    // Token not found — possible theft. If we can find the family via a recent token,
    // invalidate it. Since we can't look up family from an unknown hash, just reject.
    if (!stored) {
      res.clearCookie('refreshToken', { path: '/' });
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    if (stored.expiresAt < new Date()) {
      await prisma.refreshToken.delete({ where: { tokenHash } });
      res.clearCookie('refreshToken', { path: '/' });
      return res.status(401).json({ error: 'Refresh token expired' });
    }

    const householdId = stored.user.householdMembers[0]?.householdId;
    if (!householdId) return res.status(400).json({ error: 'User has no household' });

    // Rotate: delete old, issue new in same family (inherit rememberMe from original session)
    const rememberMe = stored.rememberMe;
    await prisma.refreshToken.delete({ where: { tokenHash } });
    const { rawToken: newRawToken } = await createRefreshToken(stored.userId, stored.familyId, rememberMe);
    setRefreshCookie(res, newRawToken, rememberMe);

    const accessToken = signAccessToken(stored.userId, householdId, stored.user.email);
    return res.json({ accessToken });
  } catch (err) {
    log.error({ err }, 'auth/refresh');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── POST /logout ─────────────────────────────────────────────────────────────

router.post('/logout', async (req: Request, res: Response) => {
  try {
    const rawToken = req.cookies?.refreshToken as string | undefined;
    if (rawToken) {
      const tokenHash = hashToken(rawToken);
      const stored = await prisma.refreshToken.findUnique({ where: { tokenHash } });
      if (stored) {
        // Invalidate entire family (all devices/tabs in this login session)
        await invalidateFamily(stored.familyId);
      }
    }
    res.clearCookie('refreshToken', { path: '/' });
    return res.json({ message: 'Logged out' });
  } catch (err) {
    log.error({ err }, 'auth/logout');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── POST /forgot-password ────────────────────────────────────────────────────

router.post('/forgot-password', async (req: Request, res: Response) => {
  try {
    const parsed = forgotPasswordSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Email is required' });

    const user = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });

    // Always return success to prevent user enumeration
    if (user?.emailVerifiedAt) {
      const { rawToken } = await createSecurityToken(user.id, 'password_reset');
      await sendPasswordResetEmail(user.email, rawToken);
    }

    return res.json({ message: 'If that email exists, a reset link has been sent.' });
  } catch (err) {
    log.error({ err }, 'auth/forgot-password');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── POST /reset-password ─────────────────────────────────────────────────────

router.post('/reset-password', async (req: Request, res: Response) => {
  try {
    const parsed = resetPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Token and password are required' });
    }

    const { token, password } = parsed.data;
    const consumed = await consumeSecurityToken(token, 'password_reset');
    if (!consumed.ok) return res.status(400).json({ error: 'Invalid or expired reset token' });

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    await prisma.$transaction([
      prisma.user.update({
        where: { id: consumed.userId },
        data: { passwordHash, failedLoginAttempts: 0, lockedUntil: null },
      }),
      prisma.refreshToken.deleteMany({ where: { userId: consumed.userId } }),
    ]);

    return res.json({ message: 'Password updated successfully' });
  } catch (err) {
    log.error({ err }, 'auth/reset-password');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── POST /2fa/setup ──────────────────────────────────────────────────────────

router.post('/2fa/setup', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
    const payload = jwt.verify(authHeader.slice(7), process.env.JWT_SECRET!) as { userId: string };

    const secret = totpGenerateSecret();
    const user = await prisma.user.findUnique({ where: { id: payload.userId }, select: { email: true } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const otpauth = totpGenerateURI({ secret, label: user.email, issuer: process.env.TOTP_APP_NAME ?? 'Kuber' });
    const qrCodeDataUrl = await toDataURL(otpauth);

    // Store secret temporarily (not yet enabled)
    await prisma.userPreference.upsert({
      where: { userId_key: { userId: payload.userId, key: 'totp_pending_secret' } },
      update: { value: secret },
      create: { userId: payload.userId, key: 'totp_pending_secret', value: secret },
    });

    return res.json({ secret, qrCodeDataUrl });
  } catch (err) {
    log.error({ err }, 'auth/2fa/setup');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── POST /2fa/enable ─────────────────────────────────────────────────────────

router.post('/2fa/enable', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
    const payload = jwt.verify(authHeader.slice(7), process.env.JWT_SECRET!) as { userId: string };

    const { code } = req.body as { code: string };
    if (!code) return res.status(400).json({ error: 'TOTP code is required' });

    const pendingPref = await prisma.userPreference.findUnique({
      where: { userId_key: { userId: payload.userId, key: 'totp_pending_secret' } },
    });
    if (!pendingPref) return res.status(400).json({ error: 'No pending 2FA setup. Call /2fa/setup first.' });

    const valid = totpVerify({ token: code, secret: pendingPref.value });
    if (!valid) return res.status(400).json({ error: 'Invalid TOTP code' });

    // Generate 8 backup codes
    const rawBackupCodes = Array.from({ length: 8 }, () => crypto.randomBytes(5).toString('hex'));
    const hashedBackupCodes = await Promise.all(rawBackupCodes.map(c => bcrypt.hash(c, 10)));

    await prisma.$transaction([
      prisma.user.update({
        where: { id: payload.userId },
        data: { totpSecret: pendingPref.value, totpEnabled: true, backupCodes: hashedBackupCodes },
      }),
      prisma.userPreference.delete({
        where: { userId_key: { userId: payload.userId, key: 'totp_pending_secret' } },
      }),
    ]);

    return res.json({ backupCodes: rawBackupCodes, message: 'Two-factor authentication enabled' });
  } catch (err) {
    log.error({ err }, 'auth/2fa/enable');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── POST /2fa/disable ────────────────────────────────────────────────────────

router.post('/2fa/disable', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
    const payload = jwt.verify(authHeader.slice(7), process.env.JWT_SECRET!) as { userId: string };

    const { password } = req.body as { password: string };
    if (!password) return res.status(400).json({ error: 'Password is required to disable 2FA' });

    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return res.status(401).json({ error: 'Invalid password' });

    await prisma.user.update({
      where: { id: payload.userId },
      data: { totpSecret: null, totpEnabled: false, backupCodes: [] },
    });

    return res.json({ message: 'Two-factor authentication disabled' });
  } catch (err) {
    log.error({ err }, 'auth/2fa/disable');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── POST /mfa/email/send ────────────────────────────────────────────────────

router.post('/mfa/email/send', async (req: Request, res: Response) => {
  try {
    const parsed = mfaTempTokenSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'tempToken is required' });

    const payload = verifyMfaTempToken(parsed.data.tempToken);
    if (!payload) return res.status(401).json({ error: 'Invalid or expired token' });

    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (user) await sendEmailOtpChallenge(user);

    return res.json({ message: 'If email MFA is available, a code has been sent.' });
  } catch (err) {
    log.error({ err }, 'auth/mfa/email/send');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── POST /mfa/verify ────────────────────────────────────────────────────────

router.post('/mfa/verify', async (req: Request, res: Response) => {
  try {
    const parsed = mfaVerifySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'tempToken, method, and code are required' });

    const payload = verifyMfaTempToken(parsed.data.tempToken);
    if (!payload) return res.status(401).json({ error: 'Invalid or expired token' });

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      include: { householdMembers: { take: 1 } },
    });
    if (!user) return res.status(400).json({ error: 'MFA verification failed' });

    const valid = await verifyMfaCode(user, parsed.data.method, parsed.data.code);
    if (!valid) return res.status(401).json({ error: 'MFA verification failed' });

    const householdId = user.householdMembers[0]?.householdId;
    if (!householdId) return res.status(400).json({ error: 'User has no household' });

    const accessToken = signAccessToken(user.id, householdId, user.email);
    const { rawToken } = await createRefreshToken(user.id, undefined, payload.rememberMe);
    setRefreshCookie(res, rawToken, payload.rememberMe);

    return res.json({ user: toUserDto(user, householdId), accessToken });
  } catch (err) {
    log.error({ err }, 'auth/mfa/verify');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── POST /mfa/email/enable ──────────────────────────────────────────────────

router.post('/mfa/email/enable', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const parsed = passwordConfirmSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Password is required' });

    const user = await prisma.user.findUnique({ where: { id: req.userId! } });
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.emailVerifiedAt) return res.status(400).json({ error: 'Verify your email before enabling email MFA' });

    const valid = await bcrypt.compare(parsed.data.password, user.passwordHash);
    if (!valid) return res.status(401).json({ error: 'Invalid password' });

    await prisma.user.update({ where: { id: user.id }, data: { emailMfaEnabled: true } });
    return res.json({ message: 'Email MFA enabled' });
  } catch (err) {
    log.error({ err }, 'auth/mfa/email/enable');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── POST /mfa/email/disable ─────────────────────────────────────────────────

router.post('/mfa/email/disable', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const parsed = passwordConfirmSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Password is required' });

    const user = await prisma.user.findUnique({ where: { id: req.userId! } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const valid = await bcrypt.compare(parsed.data.password, user.passwordHash);
    if (!valid) return res.status(401).json({ error: 'Invalid password' });

    await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: { emailMfaEnabled: false } }),
      prisma.securityToken.deleteMany({ where: { userId: user.id, type: 'email_otp', consumedAt: null } }),
    ]);
    return res.json({ message: 'Email MFA disabled' });
  } catch (err) {
    log.error({ err }, 'auth/mfa/email/disable');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── POST /2fa/validate ───────────────────────────────────────────────────────
// Second step: exchange tempToken + TOTP code for full access

router.post('/2fa/validate', async (req: Request, res: Response) => {
  try {
    const { tempToken, code } = req.body as { tempToken: string; code: string };
    if (!tempToken || !code) return res.status(400).json({ error: 'tempToken and code are required' });

    const payload = verifyLegacyOrMfaTempToken(tempToken);
    if (!payload) return res.status(401).json({ error: 'Invalid or expired token' });

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      include: { householdMembers: { take: 1 } },
    });
    if (!user || !user.totpEnabled || !user.totpSecret) {
      return res.status(400).json({ error: '2FA not enabled for this user' });
    }

    const valid = totpVerify({ token: code, secret: user.totpSecret! });
    if (!valid) return res.status(401).json({ error: 'Invalid TOTP code' });

    const householdId = user.householdMembers[0]?.householdId;
    if (!householdId) return res.status(400).json({ error: 'User has no household' });

    const rememberMe2fa = payload.rememberMe;
    const accessToken = signAccessToken(user.id, householdId, user.email);
    const { rawToken } = await createRefreshToken(user.id, undefined, rememberMe2fa);
    setRefreshCookie(res, rawToken, rememberMe2fa);

    return res.json({ user: toUserDto(user, householdId), accessToken });
  } catch (err) {
    log.error({ err }, 'auth/2fa/validate');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── POST /2fa/use-backup ─────────────────────────────────────────────────────

router.post('/2fa/use-backup', async (req: Request, res: Response) => {
  try {
    const { tempToken, backupCode } = req.body as { tempToken: string; backupCode: string };
    if (!tempToken || !backupCode) return res.status(400).json({ error: 'tempToken and backupCode are required' });

    const payload = verifyLegacyOrMfaTempToken(tempToken);
    if (!payload) return res.status(401).json({ error: 'Invalid or expired token' });

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      include: { householdMembers: { take: 1 } },
    });
    if (!user || !user.totpEnabled) return res.status(400).json({ error: '2FA not enabled' });

    // Check each hashed backup code
    let matchIndex = -1;
    for (let i = 0; i < user.backupCodes.length; i++) {
      if (await bcrypt.compare(backupCode, user.backupCodes[i])) {
        matchIndex = i;
        break;
      }
    }
    if (matchIndex === -1) return res.status(401).json({ error: 'Invalid backup code' });

    // Remove used backup code
    const newCodes = user.backupCodes.filter((_, i) => i !== matchIndex);
    await prisma.user.update({ where: { id: user.id }, data: { backupCodes: newCodes } });

    const householdId = user.householdMembers[0]?.householdId;
    if (!householdId) return res.status(400).json({ error: 'User has no household' });

    const rememberMe2fa = payload.rememberMe;
    const accessToken = signAccessToken(user.id, householdId, user.email);
    const { rawToken } = await createRefreshToken(user.id, undefined, rememberMe2fa);
    setRefreshCookie(res, rawToken, rememberMe2fa);

    return res.json({ user: toUserDto(user, householdId), accessToken, backupCodesRemaining: newCodes.length });
  } catch (err) {
    log.error({ err }, 'auth/2fa/use-backup');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET /2fa/status ──────────────────────────────────────────────────────────

router.get('/2fa/status', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
    const payload = jwt.verify(authHeader.slice(7), process.env.JWT_SECRET!) as { userId: string };
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        emailVerifiedAt: true,
        totpEnabled: true,
        emailMfaEnabled: true,
        backupCodes: true,
      },
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    return res.json({
      emailVerified: !!user.emailVerifiedAt,
      totpEnabled: user.totpEnabled,
      emailMfaEnabled: user.emailMfaEnabled,
      backupCodesRemaining: user.backupCodes.length,
    });
  } catch {
    return res.status(401).json({ error: 'Unauthorized' });
  }
});

// GET /api/v1/auth/me — alias for /api/v1/users/me (for API consumers using the auth prefix)
router.get('/me', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId! } });
    if (!user) return res.status(404).json({ error: 'User not found' });
    const dto = toUserDto(user, req.householdId!);
    return res.json(dto);
  } catch (err) {
    log.error({ err }, 'auth/me GET');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
