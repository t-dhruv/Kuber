import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import authRouter from './auth';
import settingsRouter from './settings';
import { prisma } from '../lib/prisma';
import { sendHouseholdInviteEmail } from '../lib/email';
import { createRefreshToken } from '../lib/token';

vi.mock('../lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    householdMember: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
    householdInvite: {
      create: vi.fn(),
      findUnique: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock('../lib/email', () => ({
  sendHouseholdInviteEmail: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  sendAccountLockoutEmail: vi.fn(),
  sendWelcomeEmail: vi.fn(() => Promise.resolve()),
  sendTestEmail: vi.fn(),
}));

vi.mock('../lib/token', () => ({
  createRefreshToken: vi.fn(),
  invalidateFamily: vi.fn(),
  hashToken: vi.fn((token: string) => `hashed:${token}`),
  DEFAULT_REFRESH_TTL_MS: 60_000,
  REMEMBER_ME_REFRESH_TTL_MS: 120_000,
}));

vi.mock('../lib/default-categories', () => ({
  seedDefaultCategories: vi.fn(),
}));

function makeSettingsApp(role = 'owner') {
  vi.mocked(prisma.householdMember.findUnique).mockResolvedValue({ role } as any);
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.userId = 'owner-1';
    req.householdId = 'hh-1';
    req.log = { error: vi.fn(), child: () => req.log };
    next();
  });
  app.use('/settings', settingsRouter);
  return app;
}

function makeAuthApp() {
  const app = express();
  app.use(express.json());
  app.use('/auth', authRouter);
  return app;
}

describe('household invites', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.JWT_SECRET = 'test-secret';
    process.env.CLIENT_URL = 'http://localhost:3000';
  });

  it('creates an email invite with a redeemable signup link', async () => {
    vi.mocked(prisma.householdMember.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.householdInvite.create).mockResolvedValue({
      token: 'invite-token',
      expiresAt: new Date('2026-05-15T00:00:00.000Z'),
      household: { name: 'Ada House' },
    } as any);

    const res = await request(makeSettingsApp())
      .post('/settings/household/invite')
      .send({ email: ' ADA@example.COM ', role: 'Admin' });

    expect(res.status).toBe(200);
    expect(prisma.householdInvite.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        email: 'ada@example.com',
        role: 'admin',
        householdId: 'hh-1',
      }),
    }));
    expect(sendHouseholdInviteEmail).toHaveBeenCalledWith('ada@example.com', 'Ada House', 'invite-token');
    expect(res.body.inviteUrl).toBe('/signup?invite=invite-token');
  });

  it('redeems a signup invite into the invited household', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.householdInvite.findUnique).mockResolvedValue({
      id: 'invite-1',
      token: 'invite-token',
      householdId: 'hh-1',
      email: 'ada@example.com',
      role: 'member',
      expiresAt: new Date(Date.now() + 60_000),
      usedAt: null,
    } as any);
    vi.mocked(createRefreshToken).mockResolvedValue({ rawToken: 'refresh-token' } as any);

    const tx = {
      user: {
        create: vi.fn().mockResolvedValue({
          id: 'user-1',
          email: 'ada@example.com',
          firstName: 'Ada',
          lastName: 'Lovelace',
          avatar: null,
          timezone: 'America/New_York',
          theme: 'system',
        }),
      },
      householdMember: { create: vi.fn() },
      householdInvite: { update: vi.fn() },
    };
    vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => callback(tx));

    const res = await request(makeAuthApp())
      .post('/auth/signup')
      .send({
        email: 'ADA@example.com',
        password: 'Password123!',
        firstName: 'Ada',
        lastName: 'Lovelace',
        inviteToken: 'invite-token',
      });

    expect(res.status).toBe(201);
    expect(tx.householdMember.create).toHaveBeenCalledWith({
      data: { userId: 'user-1', householdId: 'hh-1', role: 'member' },
    });
    expect(tx.householdInvite.update).toHaveBeenCalledWith({
      where: { id: 'invite-1' },
      data: { usedAt: expect.any(Date) },
    });
    expect(res.body.user.householdId).toBe('hh-1');
  });

  it('rejects expired or already used signup invites', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.householdInvite.findUnique).mockResolvedValue({
      id: 'invite-1',
      householdId: 'hh-1',
      email: 'ada@example.com',
      role: 'member',
      expiresAt: new Date(Date.now() - 60_000),
      usedAt: null,
    } as any);

    const res = await request(makeAuthApp())
      .post('/auth/signup')
      .send({
        email: 'ada@example.com',
        password: 'Password123!',
        firstName: 'Ada',
        lastName: 'Lovelace',
        inviteToken: 'invite-token',
      });

    expect(res.status).toBe(400);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('allows an owner to disable 2FA for another household member', async () => {
    vi.mocked(prisma.householdMember.findUnique)
      .mockResolvedValueOnce({ role: 'owner' } as any)
      .mockResolvedValueOnce({ role: 'member' } as any);
    vi.mocked(prisma.user.update).mockResolvedValue({} as any);

    const res = await request(makeSettingsApp())
      .post('/settings/household/members/member-1/disable-2fa')
      .send();

    expect(res.status).toBe(200);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'member-1' },
      data: { totpSecret: null, totpEnabled: false, backupCodes: [] },
    });
  });
});
