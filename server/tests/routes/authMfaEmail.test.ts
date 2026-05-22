import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import authRouter from '../../src/routes/auth';
import { prisma } from '../../src/lib/prisma';
import { createSecurityToken, consumeSecurityToken } from '../../src/lib/securityTokens';
import { createRefreshToken } from '../../src/lib/token';
import { sendEmailOtpEmail } from '../../src/lib/email';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    refreshToken: {
      deleteMany: vi.fn(),
    },
    securityToken: {
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock('../../src/lib/securityTokens', () => ({
  createSecurityToken: vi.fn(),
  consumeSecurityToken: vi.fn(),
}));

vi.mock('../../src/lib/token', async () => {
  const actual = await vi.importActual<typeof import('../../src/lib/token')>('../../src/lib/token');
  return {
    ...actual,
    createRefreshToken: vi.fn(),
  };
});

vi.mock('../../src/lib/email', () => ({
  sendEmailOtpEmail: vi.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: vi.fn(),
  sendAccountLockoutEmail: vi.fn(),
  sendWelcomeEmail: vi.fn(),
  sendEmailVerificationEmail: vi.fn(),
}));

vi.mock('../../src/lib/default-categories', () => ({
  seedDefaultCategories: vi.fn(),
}));

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/auth', authRouter);
  return app;
}

function verifiedUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-1',
    email: 'ada@example.com',
    passwordHash: bcrypt.hashSync('Password123!', 12),
    emailVerifiedAt: new Date('2026-05-21T12:00:00.000Z'),
    firstName: 'Ada',
    lastName: 'Lovelace',
    avatar: null,
    timezone: 'America/Toronto',
    theme: 'system',
    totpEnabled: false,
    totpSecret: null,
    emailMfaEnabled: true,
    backupCodes: [],
    failedLoginAttempts: 0,
    lockedUntil: null,
    householdMembers: [{ householdId: 'household-1' }],
    ...overrides,
  };
}

function bearerToken() {
  return `Bearer ${jwt.sign({ userId: 'user-1', householdId: 'household-1', email: 'ada@example.com' }, 'test-secret')}`;
}

describe('generalized MFA email OTP routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.JWT_SECRET = 'test-secret';
    vi.mocked(prisma.$transaction).mockImplementation(async (arg: unknown) => {
      if (Array.isArray(arg)) return Promise.all(arg);
      if (typeof arg === 'function') return arg(prisma);
      return arg as never;
    });
  });

  it('login returns generalized MFA methods for email MFA', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(verifiedUser() as never);

    const res = await request(makeApp())
      .post('/auth/login')
      .send({ email: 'ADA@example.com', password: 'Password123!', rememberMe: true });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      requireMfa: true,
      methods: ['email'],
    });
    expect(res.body.tempToken).toEqual(expect.any(String));
    expect(res.body.requireTotp).toBeUndefined();
    expect(jwt.verify(res.body.tempToken, 'test-secret')).toMatchObject({
      userId: 'user-1',
      purpose: 'mfa',
      rememberMe: true,
    });
    expect(createRefreshToken).not.toHaveBeenCalled();
  });

  it('sends a hashed email OTP challenge for a valid MFA temp token', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(verifiedUser() as never);
    vi.mocked(createSecurityToken).mockResolvedValue({
      rawToken: '123456',
      expiresAt: new Date('2026-05-21T12:10:00.000Z'),
    });

    const login = await request(makeApp())
      .post('/auth/login')
      .send({ email: 'ada@example.com', password: 'Password123!' });

    const res = await request(makeApp())
      .post('/auth/mfa/email/send')
      .send({ tempToken: login.body.tempToken });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'If email MFA is available, a code has been sent.' });
    expect(createSecurityToken).toHaveBeenCalledWith('user-1', 'email_otp', {
      rawToken: expect.stringMatching(/^[0-9]{6}$/),
    });
    expect(sendEmailOtpEmail).toHaveBeenCalledWith('ada@example.com', expect.stringMatching(/^[0-9]{6}$/));
  });

  it('verifies email OTP once and issues auth', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(verifiedUser() as never);
    vi.mocked(consumeSecurityToken).mockResolvedValue({ ok: true, userId: 'user-1' });
    vi.mocked(createRefreshToken).mockResolvedValue({
      rawToken: 'refresh-token',
      familyId: 'family-1',
    } as never);

    const login = await request(makeApp())
      .post('/auth/login')
      .send({ email: 'ada@example.com', password: 'Password123!' });

    const res = await request(makeApp())
      .post('/auth/mfa/verify')
      .send({ tempToken: login.body.tempToken, method: 'email', code: '123456' });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.user.email).toBe('ada@example.com');
    expect(consumeSecurityToken).toHaveBeenCalledWith('123456', 'email_otp', {
      maxAttempts: 5,
      userId: 'user-1',
    });
    expect(createRefreshToken).toHaveBeenCalledWith('user-1', undefined, false);
  });

  it('rejects enabling email MFA when email is unverified', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(verifiedUser({ emailVerifiedAt: null }) as never);

    const res = await request(makeApp())
      .post('/auth/mfa/email/enable')
      .set('Authorization', bearerToken())
      .send({ password: 'Password123!' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Verify your email before enabling email MFA');
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('returns email verification and email MFA status', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(verifiedUser() as never);

    const res = await request(makeApp())
      .get('/auth/2fa/status')
      .set('Authorization', bearerToken());

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      emailVerified: true,
      totpEnabled: false,
      emailMfaEnabled: true,
      backupCodesRemaining: 0,
    });
  });

  it('enables email MFA with password confirmation', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(verifiedUser({ emailMfaEnabled: false }) as never);
    vi.mocked(prisma.user.update).mockResolvedValue({} as never);

    const res = await request(makeApp())
      .post('/auth/mfa/email/enable')
      .set('Authorization', bearerToken())
      .send({ password: 'Password123!' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'Email MFA enabled' });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { emailMfaEnabled: true },
    });
  });
});
