import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import authRouter from '../../src/routes/auth';
import { prisma } from '../../src/lib/prisma';
import { sendPasswordResetEmail } from '../../src/lib/email';
import { consumeSecurityToken, createSecurityToken } from '../../src/lib/securityTokens';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    refreshToken: {
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock('../../src/lib/email', () => ({
  sendPasswordResetEmail: vi.fn(),
  sendAccountLockoutEmail: vi.fn(),
  sendWelcomeEmail: vi.fn(),
  sendEmailVerificationEmail: vi.fn(),
}));

vi.mock('../../src/lib/securityTokens', () => ({
  createSecurityToken: vi.fn(),
  consumeSecurityToken: vi.fn(),
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

describe('password reset token storage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates a password reset security token while emailing the raw token', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'user-1',
      email: 'ada@example.com',
      emailVerifiedAt: new Date('2026-05-21T12:00:00.000Z'),
    } as any);
    vi.mocked(createSecurityToken).mockResolvedValue({
      rawToken: 'raw-reset-token',
      expiresAt: new Date('2026-05-21T13:00:00.000Z'),
    });

    const res = await request(makeApp())
      .post('/auth/forgot-password')
      .send({ email: 'ada@example.com' });

    expect(res.status).toBe(200);
    expect(createSecurityToken).toHaveBeenCalledWith('user-1', 'password_reset');
    expect(sendPasswordResetEmail).toHaveBeenCalledWith('ada@example.com', 'raw-reset-token');
  });

  it('does not send reset emails for unverified users', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'user-1',
      email: 'ada@example.com',
      emailVerifiedAt: null,
    } as any);

    const res = await request(makeApp())
      .post('/auth/forgot-password')
      .send({ email: 'ada@example.com' });

    expect(res.status).toBe(200);
    expect(createSecurityToken).not.toHaveBeenCalled();
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it('consumes reset security tokens on password reset', async () => {
    vi.mocked(consumeSecurityToken).mockResolvedValue({ ok: true, userId: 'user-1' });
    vi.mocked(prisma.user.update).mockResolvedValue({} as any);
    vi.mocked(prisma.refreshToken.deleteMany).mockResolvedValue({} as any);
    vi.mocked(prisma.$transaction).mockResolvedValue([] as any);

    const res = await request(makeApp())
      .post('/auth/reset-password')
      .send({ token: 'raw-reset-token', password: 'NewPassword123!' });

    expect(res.status).toBe(200);
    expect(consumeSecurityToken).toHaveBeenCalledWith('raw-reset-token', 'password_reset');
    expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
  });
});


