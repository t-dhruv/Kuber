import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';
import type { UserDto } from '@kuber/shared';

const router = Router();

const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL_DAYS = 7;
const BCRYPT_ROUNDS = 12;

function toUserDto(user: { id: string; email: string; firstName: string; lastName: string; avatar: string | null; timezone: string; theme: string }, householdId: string): UserDto {
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

async function createRefreshToken(userId: string): Promise<string> {
  const token = require('crypto').randomBytes(40).toString('hex');
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
  await prisma.refreshToken.create({ data: { token, userId, expiresAt } });
  return token;
}

function setRefreshCookie(res: Response, token: string) {
  res.cookie('refreshToken', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

// POST /signup
router.post('/signup', async (req: Request, res: Response) => {
  try {
    const { email, password, firstName, lastName, householdName } = req.body as {
      email: string;
      password: string;
      firstName: string;
      lastName: string;
      householdName: string;
    };

    if (!email || !password || !firstName || !lastName || !householdName) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (existing) return res.status(409).json({ error: 'Email already in use' });

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    const user = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          email: email.toLowerCase(),
          passwordHash,
          firstName,
          lastName,
        },
      });

      const household = await tx.household.create({
        data: { name: householdName },
      });

      await tx.householdMember.create({
        data: { userId: newUser.id, householdId: household.id, role: 'owner' },
      });

      return { user: newUser, householdId: household.id };
    });

    const accessToken = signAccessToken(user.user.id, user.householdId, user.user.email);
    const refreshToken = await createRefreshToken(user.user.id);
    setRefreshCookie(res, refreshToken);

    return res.status(201).json({ data: { user: toUserDto(user.user, user.householdId), accessToken } });
  } catch (err) {
    console.error('[auth/signup]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /login
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

    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const householdId = user.householdMembers[0]?.householdId;
    if (!householdId) return res.status(400).json({ error: 'User has no household' });

    const accessToken = signAccessToken(user.id, householdId, user.email);
    const refreshToken = await createRefreshToken(user.id);
    setRefreshCookie(res, refreshToken);

    return res.json({ data: { user: toUserDto(user, householdId), accessToken } });
  } catch (err) {
    console.error('[auth/login]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /refresh
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const token = req.cookies?.refreshToken as string | undefined;
    if (!token) return res.status(401).json({ error: 'No refresh token' });

    const stored = await prisma.refreshToken.findUnique({
      where: { token },
      include: { user: { include: { householdMembers: { take: 1 } } } },
    });

    if (!stored || stored.expiresAt < new Date()) {
      if (stored) await prisma.refreshToken.delete({ where: { token } });
      res.clearCookie('refreshToken', { path: '/' });
      return res.status(401).json({ error: 'Refresh token expired or invalid' });
    }

    const householdId = stored.user.householdMembers[0]?.householdId;
    if (!householdId) return res.status(400).json({ error: 'User has no household' });

    // Rotate refresh token
    await prisma.refreshToken.delete({ where: { token } });
    const newRefreshToken = await createRefreshToken(stored.userId);
    setRefreshCookie(res, newRefreshToken);

    const accessToken = signAccessToken(stored.userId, householdId, stored.user.email);
    return res.json({ data: { accessToken } });
  } catch (err) {
    console.error('[auth/refresh]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /logout
router.post('/logout', async (req: Request, res: Response) => {
  try {
    const token = req.cookies?.refreshToken as string | undefined;
    if (token) {
      await prisma.refreshToken.deleteMany({ where: { token } });
    }
    res.clearCookie('refreshToken', { path: '/' });
    return res.json({ data: null });
  } catch (err) {
    console.error('[auth/logout]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /forgot-password
router.post('/forgot-password', async (req: Request, res: Response) => {
  try {
    const { email } = req.body as { email: string };
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });

    // Always return success to avoid user enumeration
    if (user) {
      const resetToken = require('crypto').randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      await prisma.userPreference.upsert({
        where: { userId_key: { userId: user.id, key: `reset_token_${resetToken}` } },
        update: { value: expiresAt.toISOString() },
        create: { userId: user.id, key: `reset_token_${resetToken}`, value: expiresAt.toISOString() },
      });

      console.log(`[forgot-password] Reset token for ${email}: ${resetToken}`);
      console.log(`[forgot-password] Reset URL: ${process.env.CLIENT_URL ?? 'http://localhost:3000'}/reset-password?token=${resetToken}`);
    }

    return res.json({ data: { message: 'If that email exists, a reset link has been sent.' } });
  } catch (err) {
    console.error('[auth/forgot-password]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /reset-password
router.post('/reset-password', async (req: Request, res: Response) => {
  try {
    const { token, password } = req.body as { token: string; password: string };
    if (!token || !password) return res.status(400).json({ error: 'Token and password are required' });

    // Find the preference row for this token
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
      prisma.user.update({ where: { id: pref.userId }, data: { passwordHash } }),
      prisma.userPreference.delete({ where: { userId_key: { userId: pref.userId, key: pref.key } } }),
      // Invalidate all refresh tokens
      prisma.refreshToken.deleteMany({ where: { userId: pref.userId } }),
    ]);

    return res.json({ data: { message: 'Password updated successfully' } });
  } catch (err) {
    console.error('[auth/reset-password]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
