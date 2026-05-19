import crypto from 'crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import authRouter from '../../src/routes/auth';
import { prisma } from '../../src/lib/prisma';
import { sendPasswordResetEmail } from '../../src/lib/email';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    userPreference: {
      upsert: vi.fn(),
      findFirst: vi.fn(),
      delete: vi.fn(),
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

function sha256(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

describe('password reset token storage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('stores only a hash-derived reset token key while emailing the raw token', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'user-1',
      email: 'ada@example.com',
    } as any);
    vi.mocked(prisma.userPreference.upsert).mockResolvedValue({} as any);

    const res = await request(makeApp())
      .post('/auth/forgot-password')
      .send({ email: 'ada@example.com' });

    expect(res.status).toBe(200);
    const rawToken = vi.mocked(sendPasswordResetEmail).mock.calls[0][1];
    const expectedKey = `reset_token_${sha256(rawToken)}`;
    const upsertArgs = vi.mocked(prisma.userPreference.upsert).mock.calls[0][0] as any;
    expect(upsertArgs.where.userId_key.key).toBe(expectedKey);
    expect(upsertArgs.where.userId_key.key).not.toBe(`reset_token_${rawToken}`);
    expect(sendPasswordResetEmail).toHaveBeenCalledWith('ada@example.com', rawToken);
  });

  it('looks up reset submissions by hashed token key', async () => {
    vi.mocked(prisma.userPreference.findFirst).mockResolvedValue({
      userId: 'user-1',
      key: `reset_token_${sha256('raw-reset-token')}`,
      value: new Date(Date.now() + 60_000).toISOString(),
    } as any);
    vi.mocked(prisma.user.update).mockResolvedValue({} as any);
    vi.mocked(prisma.userPreference.delete).mockResolvedValue({} as any);
    vi.mocked(prisma.refreshToken.deleteMany).mockResolvedValue({} as any);
    vi.mocked(prisma.$transaction).mockResolvedValue([] as any);

    const res = await request(makeApp())
      .post('/auth/reset-password')
      .send({ token: 'raw-reset-token', password: 'NewPassword123!' });

    expect(res.status).toBe(200);
    expect(prisma.userPreference.findFirst).toHaveBeenCalledWith({
      where: { key: `reset_token_${sha256('raw-reset-token')}` },
    });
  });
});


