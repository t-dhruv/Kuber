import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import authRouter from '../../src/routes/auth';
import { prisma } from '../../src/lib/prisma';
import { consumeSecurityToken, createSecurityToken } from '../../src/lib/securityTokens';
import { isEmailProviderConfigured, sendEmailVerificationEmail, sendPasswordResetEmail } from '../../src/lib/email';
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
      // The registration gate counts Households to decide whether open signup
      // is still allowed. See tests/db/freshInstanceSignup.test.ts for the same
      // decision proven against a real database.
      count: vi.fn(),
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
  isEmailProviderConfigured: vi.fn(),
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
    // These tests are about the verification flow, so default to the Instance
    // that has email working and no Household yet — the configuration under
    // which signup behaves as it always did.
    vi.mocked(isEmailProviderConfigured).mockResolvedValue(true);
    vi.mocked(prisma.household.count).mockResolvedValue(0);
    delete process.env.ALLOW_SIGNUP;
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

  // The registration gate is pure request/response branching, which is what
  // this seam is for. Whether the gate reads the Household count correctly
  // against a real database is proven in tests/db/freshInstanceSignup.test.ts.
  // TODO: the `as any` casts below match this file's existing idiom for Prisma
  // mock returns — the mocks are deliberately partial, and typing them fully
  // would mean restating whole Prisma model shapes per case. Removing them is
  // part of the repo-wide `any` cleanup, which PRD #151 puts out of scope.
  describe('the registration gate', () => {
    function signup(body: Record<string, unknown> = {}) {
      return request(makeApp()).post('/auth/signup').send({
        email: 'new@example.com',
        password: 'Password123!',
        firstName: 'New',
        lastName: 'User',
        householdName: 'New Household',
        ...body,
      });
    }

    beforeEach(() => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.user.create).mockResolvedValue(verifiedUser({ emailVerifiedAt: null }) as any);
      vi.mocked(prisma.household.create).mockResolvedValue({ id: 'household-1' } as any);
      vi.mocked(prisma.householdMember.create).mockResolvedValue({} as any);
      vi.mocked(seedDefaultCategories).mockResolvedValue(undefined as any);
    });

    it('rejects an uninvited signup once a Household exists', async () => {
      vi.mocked(prisma.household.count).mockResolvedValue(1);

      const res = await signup();

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/registration is closed/i);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('accepts an uninvited signup when ALLOW_SIGNUP re-opens registration', async () => {
      vi.mocked(prisma.household.count).mockResolvedValue(1);
      process.env.ALLOW_SIGNUP = 'true';

      expect((await signup()).status).toBe(201);
    });

    it('accepts an invited signup even with registration closed', async () => {
      vi.mocked(prisma.household.count).mockResolvedValue(1);
      process.env.ALLOW_SIGNUP = 'false';
      vi.mocked(prisma.householdInvite.findUnique).mockResolvedValue({
        id: 'invite-1',
        householdId: 'household-1',
        email: 'new@example.com',
        role: 'member',
        expiresAt: new Date(Date.now() + 60_000),
        usedAt: null,
      } as any);
      vi.mocked(prisma.householdInvite.update).mockResolvedValue({} as any);

      const res = await signup({ householdName: undefined, inviteToken: 'invite-token' });

      expect(res.status).toBe(201);
    });
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
