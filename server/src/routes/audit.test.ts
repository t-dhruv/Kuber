import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import auditRouter from './audit';
import { prisma } from '../lib/prisma';

vi.mock('../lib/prisma', () => ({
  prisma: {
    auditLog: {
      findMany: vi.fn(),
    },
  },
}));

function makeApp() {
  const app = express();
  app.use((req: any, _res, next) => {
    req.householdId = 'hh-1';
    req.log = { error: vi.fn(), child: () => req.log };
    next();
  });
  app.use('/audit', auditRouter);
  return app;
}

describe('audit route', () => {
  beforeEach(() => vi.clearAllMocks());

  it('scopes audit queries to household and caps requested limits', async () => {
    vi.mocked(prisma.auditLog.findMany).mockResolvedValue([]);

    const res = await request(makeApp())
      .get('/audit?entity=transaction&action=update&limit=999&startDate=2026-05-01&endDate=2026-05-07');

    expect(res.status).toBe(200);
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        householdId: 'hh-1',
        entity: 'TRANSACTION',
        action: 'UPDATE',
        createdAt: {
          gte: new Date('2026-05-01'),
          lte: new Date('2026-05-07'),
        },
      },
      take: 200,
    }));
  });

  it('maps audit rows for settings UI display', async () => {
    vi.mocked(prisma.auditLog.findMany).mockResolvedValue([
      {
        id: 'audit-1',
        action: 'DELETE',
        entity: 'TRANSACTION',
        entityId: 'tx-1',
        changes: { before: { amount: -12.34 } },
        createdAt: new Date('2026-05-07T12:00:00.000Z'),
        user: { firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.test' },
      },
    ] as any);

    const res = await request(makeApp()).get('/audit');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      {
        id: 'audit-1',
        action: 'DELETE',
        entity: 'TRANSACTION',
        entityId: 'tx-1',
        changes: { before: { amount: -12.34 } },
        createdAt: '2026-05-07T12:00:00.000Z',
        user: 'Ada Lovelace',
      },
    ]);
  });
});
