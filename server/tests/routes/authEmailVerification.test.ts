import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import authRouter from '../../src/routes/auth';
import { prisma } from '../../src/lib/prisma';
import { consumeSecurityToken, createSecurityToken } from '../../src/lib/securityTokens';
import { sendEmailVerificationEmail, sendPasswordResetEmail } from '../../src/lib/email';
import { seedDefaultCategories } from '../../src/lib/default-categories';
import { createRefreshToken } from '../../src/lib/token';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    household: {
      create: vi.fn(),
    },
    householdMember: {
      create: vi.fn(),
    },
    householdInvite: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    refreshToken: {
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
  sendEmailVerificationEmail: vi.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
  sendAccountLockoutEmail: vi.fn().mockResolvedValue(undefined),
  sendWelcomeEmail: vi.fn().mockResolvedValue(undefined),
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
    email: 'new@example.com',
    emailVerifiedAt: new Date('2026-05-21T12:00:00.000Z'),
    passwordHash: bcrypt.hashSync('Password123!', 12),
    firstName: 'New',
    lastName: 'User',
    avatar: null,
    timezone: 'America/New_York',
    theme: 'system',
    failedLoginAttempts: 0,
    lockedUntil: null,
    householdMembers: [{ householdId: 'household-1' }],
    totpEnabled: false,
    ...overrides,
  };
}

describe('auth email verification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.JWT_SECRET = 'test-secret';
    vi.mocked(prisma.$transaction).mockImplementation(async (arg: unknown) => {
      if (typeof arg === 'function') return arg(prisma);
      return Promise.all(arg as Promise<unknown>[]);
    });
    vi.mocked(createSecurityToken).mockResolvedValue({
      rawToken: 'raw-verification-token',
      expiresAt: new Date('2026-05-22T12:00:00.000Z'),
    });
  });

  it('signup returns pending email verification instead of access token', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.user.create).mockResolvedValue(verifiedUser({ emailVerifiedAt: null }) as any);
    vi.mocked(prisma.household.create).mockResolvedValue({ id: 'household-1' } as any);
    vi.mocked(prisma.householdMember.create).mockResolvedValue({} as any);
    vi.mocked(seedDefaultCategories).mockResolvedValue(undefined as any);

    const res = await request(makeApp()).post('/auth/signup').send({
      email: 'NEW@example.com',
      password: 'Password123!',
      firstName: 'New',
      lastName: 'User',
      householdName: 'New Household',
    });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      requireEmailVerification: true,
      email: 'new@example.com',
    });
    expect(res.body.accessToken).toBeUndefined();
    expect(createSecurityToken).toHaveBeenCalledWith('user-1', 'email_verification');
    expect(sendEmailVerificationEmail).toHaveBeenCalledWith('new@example.com', 'raw-verification-token');
    expect(createRefreshToken).not.toHaveBeenCalled();
  });

  it('login blocks unverified users after valid password', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(verifiedUser({ emailVerifiedAt: null }) as any);

    const res = await request(makeApp()).post('/auth/login').send({
      email: 'new@example.com',
      password: 'Password123!',
    });

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({
      requireEmailVerification: true,
      email: 'new@example.com',
      error: 'Verify your email before signing in.',
    });
    expect(createRefreshToken).not.toHaveBeenCalled();
  });

  it('verifies an email token', async () => {
    vi.mocked(consumeSecurityToken).mockResolvedValue({ ok: true, userId: 'user-1' });
    vi.mocked(prisma.user.update).mockResolvedValue({} as any);

    const res = await request(makeApp()).post('/auth/verify-email').send({
      token: 'raw-verification-token',
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'Email verified successfully' });
    expect(consumeSecurityToken).toHaveBeenCalledWith('raw-verification-token', 'email_verification');
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { emailVerifiedAt: expect.any(Date) },
    });
  });

  it('resends verification without revealing whether the email exists', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(verifiedUser({ emailVerifiedAt: null }) as any);

    const res = await request(makeApp()).post('/auth/resend-verification').send({
      email: 'NEW@example.com',
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'If that email needs verification, a new link has been sent.' });
    expect(createSecurityToken).toHaveBeenCalledWith('user-1', 'email_verification');
    expect(sendEmailVerificationEmail).toHaveBeenCalledWith('new@example.com', 'raw-verification-token');
  });

  it('only sends password reset emails for verified users using security tokens', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(verifiedUser() as any);
    vi.mocked(createSecurityToken).mockResolvedValue({
      rawToken: 'raw-reset-token',
      expiresAt: new Date('2026-05-21T13:00:00.000Z'),
    });

    const res = await request(makeApp()).post('/auth/forgot-password').send({
      email: 'NEW@example.com',
    });

    expect(res.status).toBe(200);
    expect(createSecurityToken).toHaveBeenCalledWith('user-1', 'password_reset');
    expect(sendPasswordResetEmail).toHaveBeenCalledWith('new@example.com', 'raw-reset-token');
  });

  it('resets passwords by consuming a security token', async () => {
    vi.mocked(consumeSecurityToken).mockResolvedValue({ ok: true, userId: 'user-1' });
    vi.mocked(prisma.user.update).mockResolvedValue({} as any);
    vi.mocked(prisma.refreshToken.deleteMany).mockResolvedValue({ count: 1 } as any);

    const res = await request(makeApp()).post('/auth/reset-password').send({
      token: 'raw-reset-token',
      password: 'NewPassword123!',
    });

    expect(res.status).toBe(200);
    expect(consumeSecurityToken).toHaveBeenCalledWith('raw-reset-token', 'password_reset');
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: expect.objectContaining({
        passwordHash: expect.any(String),
        failedLoginAttempts: 0,
        lockedUntil: null,
      }),
    });
    expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
  });
});
