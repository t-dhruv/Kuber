import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { requireHouseholdRole } from './auth';
import { prisma } from '../lib/prisma';

vi.mock('../lib/prisma', () => ({
  prisma: {
    householdMember: {
      findUnique: vi.fn(),
    },
  },
}));

function makeApp(userId: string | null = 'user-1', householdId: string | null = 'hh-1') {
  const app = express();
  app.use((req: any, _res, next) => {
    if (userId) req.userId = userId;
    if (householdId) req.householdId = householdId;
    req.log = { error: vi.fn(), child: () => req.log };
    next();
  });
  app.use(requireHouseholdRole(['owner', 'admin']));
  app.get('/protected', (_req, res) => res.json({ ok: true }));
  return app;
}

describe('requireHouseholdRole', () => {
  beforeEach(() => vi.clearAllMocks());

  it('allows owners and admins', async () => {
    vi.mocked(prisma.householdMember.findUnique).mockResolvedValue({ role: 'Admin' } as any);

    const res = await request(makeApp()).get('/protected');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(prisma.householdMember.findUnique).toHaveBeenCalledWith({
      where: { userId_householdId: { userId: 'user-1', householdId: 'hh-1' } },
      select: { role: true },
    });
  });

  it('rejects regular household members', async () => {
    vi.mocked(prisma.householdMember.findUnique).mockResolvedValue({ role: 'member' } as any);

    const res = await request(makeApp()).get('/protected');

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Insufficient household permissions' });
  });

  it('rejects requests without authenticated household context', async () => {
    const res = await request(makeApp(null, 'hh-1')).get('/protected');

    expect(res.status).toBe(401);
    expect(prisma.householdMember.findUnique).not.toHaveBeenCalled();
  });
});
