import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import settingsRouter from './settings';
import { prisma } from '../lib/prisma';
import { sendHouseholdInviteEmail } from '../lib/email';

vi.mock('../lib/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn() },
    household: { findUnique: vi.fn(), update: vi.fn() },
    householdMember: { findFirst: vi.fn(), findUnique: vi.fn(), delete: vi.fn() },
    householdInvite: { create: vi.fn() },
    category: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    categoryGroup: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), delete: vi.fn() },
    transactionJournal: { count: vi.fn() },
  },
}));

vi.mock('../lib/email', () => ({
  sendHouseholdInviteEmail: vi.fn(),
  sendTestEmail: vi.fn(),
}));

vi.mock('../lib/encryption', () => ({
  encrypt: (value: string) => `encrypted:${value}`,
}));

vi.mock('../lib/ai', () => ({
  getAiClient: vi.fn(),
  invalidateAiCache: vi.fn(),
}));

vi.mock('../lib/safeOutboundUrl', () => ({
  assertSafeOutboundUrl: vi.fn(),
}));

function makeApp(userId = 'user-1', householdId = 'hh-1') {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.userId = userId;
    req.householdId = householdId;
    req.log = { error: vi.fn(), child: () => req.log };
    next();
  });
  app.use('/settings', settingsRouter);
  return app;
}

const memberUser = {
  id: 'user-2',
  firstName: 'Member',
  lastName: 'User',
  email: 'member@example.com',
  totpEnabled: true,
};

describe('settings routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.householdMember.findFirst).mockResolvedValue({
      household: { currency: 'CAD' },
    } as any);
  });

  it('returns profile with household currency', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'user-1',
      email: 'owner@example.com',
      firstName: 'Owner',
      lastName: 'User',
      avatar: null,
      timezone: 'America/Toronto',
    } as any);

    const res = await request(makeApp()).get('/settings/profile');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: 'user-1',
      email: 'owner@example.com',
      timezone: 'America/Toronto',
      currency: 'CAD',
    });
  });

  it('updates only supplied profile fields', async () => {
    vi.mocked(prisma.user.update).mockResolvedValue({
      id: 'user-1',
      email: 'owner@example.com',
      firstName: 'New',
      lastName: 'Name',
      avatar: 'avatar.png',
      timezone: 'UTC',
    } as any);

    const res = await request(makeApp())
      .put('/settings/profile')
      .send({ firstName: 'New', timezone: 'UTC' });

    expect(res.status).toBe(200);
    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'user-1' },
      data: { firstName: 'New', timezone: 'UTC' },
    }));
    expect(res.body.avatarUrl).toBe('avatar.png');
  });

  it('returns household members with 2FA status', async () => {
    vi.mocked(prisma.household.findUnique).mockResolvedValue({
      id: 'hh-1',
      name: 'Family',
      currency: 'CAD',
      members: [
        { userId: 'user-2', role: 'member', joinedAt: new Date('2026-05-01T00:00:00.000Z'), user: memberUser },
      ],
    } as any);

    const res = await request(makeApp()).get('/settings/household');

    expect(res.status).toBe(200);
    expect(prisma.household.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'hh-1' },
    }));
    expect(res.body.members[0]).toMatchObject({
      userId: 'user-2',
      email: 'member@example.com',
      role: 'member',
      totpEnabled: true,
    });
  });

  it('rejects household updates from non-admin members', async () => {
    vi.mocked(prisma.householdMember.findUnique).mockResolvedValue({ role: 'member' } as any);

    const res = await request(makeApp())
      .put('/settings/household')
      .send({ name: 'Updated' });

    expect(res.status).toBe(403);
    expect(prisma.household.update).not.toHaveBeenCalled();
  });

  it('creates household invites for admins and normalizes email and role', async () => {
    vi.mocked(prisma.householdMember.findUnique).mockResolvedValue({ role: 'admin' } as any);
    vi.mocked(prisma.householdMember.findFirst).mockResolvedValueOnce(null as any);
    vi.mocked(prisma.householdInvite.create).mockResolvedValue({
      token: 'invite-token',
      expiresAt: new Date('2026-05-21T00:00:00.000Z'),
      household: { name: 'Family' },
    } as any);

    const res = await request(makeApp())
      .post('/settings/household/invite')
      .send({ email: ' New@Example.COM ', role: 'ADMIN' });

    expect(res.status).toBe(200);
    expect(prisma.householdInvite.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        householdId: 'hh-1',
        email: 'new@example.com',
        role: 'admin',
      }),
    }));
    expect(sendHouseholdInviteEmail).toHaveBeenCalledWith('new@example.com', 'Family', 'invite-token');
    expect(res.body.inviteUrl).toBe('/signup?invite=invite-token');
  });

  it('prevents owners from removing themselves from a household', async () => {
    vi.mocked(prisma.householdMember.findUnique).mockResolvedValue({ role: 'owner' } as any);

    const res = await request(makeApp()).delete('/settings/household/members/user-1');

    expect(res.status).toBe(400);
    expect(prisma.householdMember.delete).not.toHaveBeenCalled();
  });

  it('disables member 2FA only after owner and target membership checks', async () => {
    vi.mocked(prisma.householdMember.findUnique)
      .mockResolvedValueOnce({ role: 'owner' } as any)
      .mockResolvedValueOnce({ role: 'member' } as any);
    vi.mocked(prisma.user.update).mockResolvedValue({} as any);

    const res = await request(makeApp()).post('/settings/household/members/user-2/disable-2fa');

    expect(res.status).toBe(200);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-2' },
      data: { totpSecret: null, totpEnabled: false, backupCodes: [] },
    });
  });

  it('creates categories only for valid household category groups', async () => {
    vi.mocked(prisma.categoryGroup.findFirst).mockResolvedValue({ id: 'group-1' } as any);
    vi.mocked(prisma.category.create).mockResolvedValue({
      id: 'cat-1',
      householdId: 'hh-1',
      name: 'Groceries',
      groupId: 'group-1',
      bucketType: 'needs',
    } as any);

    const res = await request(makeApp())
      .post('/settings/categories')
      .send({ name: 'Groceries', groupId: 'group-1', bucketType: 'needs' });

    expect(res.status).toBe(201);
    expect(prisma.categoryGroup.findFirst).toHaveBeenCalledWith({
      where: { id: 'group-1', householdId: 'hh-1' },
    });
    expect(prisma.category.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ householdId: 'hh-1', name: 'Groceries', bucketType: 'needs' }),
    }));
  });

  it('blocks deletion of categories used by live journals', async () => {
    vi.mocked(prisma.category.findFirst).mockResolvedValue({ id: 'cat-1' } as any);
    vi.mocked(prisma.transactionJournal.count).mockResolvedValue(2);

    const res = await request(makeApp()).delete('/settings/categories/cat-1');

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('used by 2 transactions');
    expect(prisma.category.delete).not.toHaveBeenCalled();
  });

  it('creates unique category groups for the household', async () => {
    vi.mocked(prisma.categoryGroup.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.categoryGroup.create).mockResolvedValue({
      id: 'group-1',
      name: 'Bills',
      type: 'expense',
    } as any);

    const res = await request(makeApp())
      .post('/settings/category-groups')
      .send({ name: ' Bills ', type: 'expense' });

    expect(res.status).toBe(201);
    expect(prisma.categoryGroup.findFirst).toHaveBeenCalledWith({
      where: { householdId: 'hh-1', name: 'Bills' },
    });
    expect(res.body).toEqual({ id: 'group-1', name: 'Bills', type: 'expense', categoryCount: 0 });
  });
});
