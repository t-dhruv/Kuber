import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import notificationsRouter from '../../src/routes/notifications';
import { prisma } from '../../src/lib/prisma';
import { runProactiveChecks } from '../../src/lib/proactiveAi';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    notification: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

vi.mock('../../src/lib/proactiveAi', () => ({
  runProactiveChecks: vi.fn(),
}));

function makeApp(householdId?: string) {
  const effectiveHouseholdId = arguments.length === 0 ? 'hh-1' : householdId;
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    if (effectiveHouseholdId !== undefined) req.householdId = effectiveHouseholdId;
    req.log = { error: vi.fn(), child: () => req.log };
    next();
  });
  app.use('/notifications', notificationsRouter);
  return app;
}

describe('notification routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists recent notifications and unread count for the household', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-14T12:00:00.000Z'));
    vi.mocked(prisma.notification.findMany).mockResolvedValue([
      { id: 'n-1', read: false },
      { id: 'n-2', read: true },
      { id: 'n-3', read: false },
    ] as any);

    const res = await request(makeApp()).get('/notifications');

    expect(res.status).toBe(200);
    expect(prisma.notification.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ householdId: 'hh-1' }),
      orderBy: { createdAt: 'desc' },
      take: 50,
    }));
    expect(res.body.unreadCount).toBe(2);
    vi.useRealTimers();
  });

  it('requires a household for notification listing', async () => {
    const res = await request(makeApp(undefined)).get('/notifications');

    expect(res.status).toBe(401);
    expect(prisma.notification.findMany).not.toHaveBeenCalled();
  });

  it('marks only household-owned notifications as read', async () => {
    vi.mocked(prisma.notification.findFirst).mockResolvedValue({ id: 'n-1' } as any);
    vi.mocked(prisma.notification.update).mockResolvedValue({} as any);

    const res = await request(makeApp()).put('/notifications/n-1/read');

    expect(res.status).toBe(200);
    expect(prisma.notification.findFirst).toHaveBeenCalledWith({
      where: { id: 'n-1', householdId: 'hh-1' },
    });
    expect(prisma.notification.update).toHaveBeenCalledWith({
      where: { id: 'n-1' },
      data: { read: true },
    });
  });

  it('returns 404 when marking another household notification as read', async () => {
    vi.mocked(prisma.notification.findFirst).mockResolvedValue(null);

    const res = await request(makeApp()).put('/notifications/n-1/read');

    expect(res.status).toBe(404);
    expect(prisma.notification.update).not.toHaveBeenCalled();
  });

  it('marks all unread household notifications as read', async () => {
    vi.mocked(prisma.notification.updateMany).mockResolvedValue({ count: 2 } as any);

    const res = await request(makeApp()).put('/notifications/read-all');

    expect(res.status).toBe(200);
    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: { householdId: 'hh-1', read: false },
      data: { read: true },
    });
  });

  it('clears read household notifications', async () => {
    vi.mocked(prisma.notification.deleteMany).mockResolvedValue({ count: 3 } as any);

    const res = await request(makeApp()).delete('/notifications/clear');

    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(3);
    expect(prisma.notification.deleteMany).toHaveBeenCalledWith({
      where: { householdId: 'hh-1', read: true },
    });
  });

  it('runs proactive checks for the current household', async () => {
    vi.mocked(runProactiveChecks).mockResolvedValue(4);

    const res = await request(makeApp()).post('/notifications/run-checks');

    expect(res.status).toBe(200);
    expect(res.body.created).toBe(4);
    expect(runProactiveChecks).toHaveBeenCalledWith(prisma, 'hh-1');
  });
});


