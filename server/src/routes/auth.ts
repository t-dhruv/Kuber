import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { generateSecret as totpGenerateSecret, verify as totpVerify, generateURI as totpGenerateURI } from 'otplib';
import { toDataURL } from 'qrcode';
import { prisma } from '../lib/prisma';
import { createRefreshToken, invalidateFamily, hashToken } from '../lib/token';
import { sendPasswordResetEmail, sendAccountLockoutEmail } from '../lib/email';
import type { UserDto } from '@kuber/shared';

const router = Router();

const ACCESS_TOKEN_TTL = '15m';
const BCRYPT_ROUNDS = 12;

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

function setRefreshCookie(res: Response, rawToken: string) {
  res.cookie('refreshToken', rawToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

// ─── POST /signup ─────────────────────────────────────────────────────────────

router.post('/signup', async (req: Request, res: Response) => {
  try {
    const { email, password, firstName, lastName, householdName } = req.body as {
      email: string; password: string; firstName: string; lastName: string; householdName: string;
    };

    if (!email || !password || !firstName || !lastName || !householdName) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (existing) return res.status(409).json({ error: 'Email already in use' });

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    const result = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: { email: email.toLowerCase(), passwordHash, firstName, lastName },
      });
      const household = await tx.household.create({ data: { name: householdName } });
      await tx.householdMember.create({
        data: { userId: newUser.id, householdId: household.id, role: 'owner' },
      });
      return { user: newUser, householdId: household.id };
    });

    const accessToken = signAccessToken(result.user.id, result.householdId, result.user.email);
    const { rawToken } = await createRefreshToken(result.user.id);
    setRefreshCookie(res, rawToken);

    return res.status(201).json({ user: toUserDto(result.user, result.householdId), accessToken });
  } catch (err) {
    console.error('[auth/signup]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── POST /login ──────────────────────────────────────────────────────────────

router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body as { email: string; password: string };
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

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

    const householdId = user.householdMembers[0]?.householdId;
    if (!householdId) return res.status(400).json({ error: 'User has no household' });

    // Reset lockout on success
    if (user.failedLoginAttempts > 0) {
      await prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: 0, lockedUntil: null },
      });
    }

    // 2FA check
    if (user.totpEnabled) {
      const tempToken = jwt.sign(
        { userId: user.id, purpose: '2fa' },
        process.env.JWT_SECRET!,
        { expiresIn: '5m' },
      );
      return res.json({ requireTotp: true, tempToken });
    }

    const accessToken = signAccessToken(user.id, householdId, user.email);
    const { rawToken } = await createRefreshToken(user.id);
    setRefreshCookie(res, rawToken);

    return res.json({ user: toUserDto(user, householdId), accessToken });
  } catch (err) {
    console.error('[auth/login]', err);
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

    // Rotate: delete old, issue new in same family
    await prisma.refreshToken.delete({ where: { tokenHash } });
    const { rawToken: newRawToken } = await createRefreshToken(stored.userId, stored.familyId);
    setRefreshCookie(res, newRawToken);

    const accessToken = signAccessToken(stored.userId, householdId, stored.user.email);
    return res.json({ accessToken });
  } catch (err) {
    console.error('[auth/refresh]', err);
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
    console.error('[auth/logout]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── POST /forgot-password ────────────────────────────────────────────────────

router.post('/forgot-password', async (req: Request, res: Response) => {
  try {
    const { email } = req.body as { email: string };
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });

    // Always return success to prevent user enumeration
    if (user) {
      const resetToken = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      await prisma.userPreference.upsert({
        where: { userId_key: { userId: user.id, key: `reset_token_${resetToken}` } },
        update: { value: expiresAt.toISOString() },
        create: { userId: user.id, key: `reset_token_${resetToken}`, value: expiresAt.toISOString() },
      });

      await sendPasswordResetEmail(user.email, resetToken);
    }

    return res.json({ message: 'If that email exists, a reset link has been sent.' });
  } catch (err) {
    console.error('[auth/forgot-password]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── POST /reset-password ─────────────────────────────────────────────────────

router.post('/reset-password', async (req: Request, res: Response) => {
  try {
    const { token, password } = req.body as { token: string; password: string };
    if (!token || !password) return res.status(400).json({ error: 'Token and password are required' });
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

    const pref = await prisma.userPreference.findFirst({
      where: { key: `reset_token_${token}` },
    });
    if (!pref) return res.status(400).json({ error: 'Invalid or expired reset token' });

    const expiresAt = new Date(pref.value);
    if (expiresAt < new Date()) {
      await prisma.userPreference.delete({ where: { userId_key: { userId: pref.userId, key: pref.key } } });
      return res.status(400).json({ error: 'Reset token has expired' });
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    await prisma.$transaction([
      prisma.user.update({
        where: { id: pref.userId },
        data: { passwordHash, failedLoginAttempts: 0, lockedUntil: null },
      }),
      prisma.userPreference.delete({ where: { userId_key: { userId: pref.userId, key: pref.key } } }),
      prisma.refreshToken.deleteMany({ where: { userId: pref.userId } }),
    ]);

    return res.json({ message: 'Password updated successfully' });
  } catch (err) {
    console.error('[auth/reset-password]', err);
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
    console.error('[auth/2fa/setup]', err);
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
    console.error('[auth/2fa/enable]', err);
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
    console.error('[auth/2fa/disable]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── POST /2fa/validate ───────────────────────────────────────────────────────
// Second step: exchange tempToken + TOTP code for full access

router.post('/2fa/validate', async (req: Request, res: Response) => {
  try {
    const { tempToken, code } = req.body as { tempToken: string; code: string };
    if (!tempToken || !code) return res.status(400).json({ error: 'tempToken and code are required' });

    let payload: { userId: string; purpose: string };
    try {
      payload = jwt.verify(tempToken, process.env.JWT_SECRET!) as typeof payload;
    } catch {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    if (payload.purpose !== '2fa') return res.status(400).json({ error: 'Invalid token purpose' });

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

    const accessToken = signAccessToken(user.id, householdId, user.email);
    const { rawToken } = await createRefreshToken(user.id);
    setRefreshCookie(res, rawToken);

    return res.json({ user: toUserDto(user, householdId), accessToken });
  } catch (err) {
    console.error('[auth/2fa/validate]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── POST /2fa/use-backup ─────────────────────────────────────────────────────

router.post('/2fa/use-backup', async (req: Request, res: Response) => {
  try {
    const { tempToken, backupCode } = req.body as { tempToken: string; backupCode: string };
    if (!tempToken || !backupCode) return res.status(400).json({ error: 'tempToken and backupCode are required' });

    let payload: { userId: string; purpose: string };
    try {
      payload = jwt.verify(tempToken, process.env.JWT_SECRET!) as typeof payload;
    } catch {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    if (payload.purpose !== '2fa') return res.status(400).json({ error: 'Invalid token purpose' });

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

    const accessToken = signAccessToken(user.id, householdId, user.email);
    const { rawToken } = await createRefreshToken(user.id);
    setRefreshCookie(res, rawToken);

    return res.json({ user: toUserDto(user, householdId), accessToken, backupCodesRemaining: newCodes.length });
  } catch (err) {
    console.error('[auth/2fa/use-backup]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET /2fa/status ──────────────────────────────────────────────────────────

router.get('/2fa/status', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
    const payload = jwt.verify(authHeader.slice(7), process.env.JWT_SECRET!) as { userId: string };
    const user = await prisma.user.findUnique({ where: { id: payload.userId }, select: { totpEnabled: true, backupCodes: true } });
    if (!user) return res.status(404).json({ error: 'User not found' });
    return res.json({ totpEnabled: user.totpEnabled, backupCodesRemaining: user.backupCodes.length });
  } catch (err) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
});

export default router;
