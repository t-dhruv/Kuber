import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import pushRouter from '../../src/routes/push';
import { prisma } from '../../src/lib/prisma';
import { getVapidPublicKey } from '../../src/lib/webPush';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    pushSubscription: {
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

vi.mock('../../src/lib/webPush', () => ({
  getVapidPublicKey: vi.fn(),
}));

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.userId = 'user-1';
    req.householdId = 'hh-1';
    req.log = { error: vi.fn(), child: () => req.log };
    next();
  });
  app.use('/push', pushRouter);
  return app;
}

describe('push routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the VAPID public key when configured', async () => {
    vi.mocked(getVapidPublicKey).mockReturnValue('public-key');

    const res = await request(makeApp()).get('/push/vapid-public-key');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ publicKey: 'public-key' });
  });

  it('returns 503 when push notifications are not configured', async () => {
    vi.mocked(getVapidPublicKey).mockReturnValue('');

    const res = await request(makeApp()).get('/push/vapid-public-key');

    expect(res.status).toBe(503);
    expect(res.body.error).toBe('Push notifications not configured');
  });

  it('upserts a push subscription for the authenticated user and household', async () => {
    vi.mocked(prisma.pushSubscription.upsert).mockResolvedValue({ id: 'sub-1' } as any);

    const res = await request(makeApp())
      .post('/push/subscribe')
      .send({
        endpoint: 'https://push.example/subscription',
        keys: { p256dh: 'p256dh-key', auth: 'auth-secret' },
      });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: 'sub-1' });
    expect(prisma.pushSubscription.upsert).toHaveBeenCalledWith({
      where: { endpoint: 'https://push.example/subscription' },
      update: { p256dh: 'p256dh-key', auth: 'auth-secret', userId: 'user-1' },
      create: {
        householdId: 'hh-1',
        userId: 'user-1',
        endpoint: 'https://push.example/subscription',
        p256dh: 'p256dh-key',
        auth: 'auth-secret',
      },
    });
  });

  it('rejects invalid push subscription payloads', async () => {
    const res = await request(makeApp())
      .post('/push/subscribe')
      .send({ endpoint: 'not-a-url', keys: { p256dh: '', auth: '' } });

    expect(res.status).toBe(400);
    expect(prisma.pushSubscription.upsert).not.toHaveBeenCalled();
  });

  it('unsubscribes only the current household endpoint', async () => {
    vi.mocked(prisma.pushSubscription.deleteMany).mockResolvedValue({ count: 1 } as any);

    const res = await request(makeApp())
      .delete('/push/unsubscribe')
      .send({ endpoint: 'https://push.example/subscription' });

    expect(res.status).toBe(200);
    expect(prisma.pushSubscription.deleteMany).toHaveBeenCalledWith({
      where: { endpoint: 'https://push.example/subscription', householdId: 'hh-1' },
    });
  });
});


