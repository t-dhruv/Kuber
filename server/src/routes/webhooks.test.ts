import crypto from 'crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import webhooksRouter from './webhooks';
import { prisma } from '../lib/prisma';

vi.mock('../lib/prisma', () => ({
  prisma: {
    householdMember: {
      findUnique: vi.fn(),
    },
    webhook: {
      findMany: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    webhookDelivery: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock('../lib/encryption', () => ({
  encrypt: (value: string) => `encrypted:${value}`,
  decrypt: (value: string) => value.replace(/^encrypted:/, ''),
}));

vi.mock('../lib/safeOutboundUrl', () => ({
  assertSafeOutboundUrl: vi.fn(async (url: string) => url),
}));

function makeApp() {
  vi.mocked(prisma.householdMember.findUnique).mockResolvedValue({ role: 'owner' } as any);
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.userId = 'user-1';
    req.householdId = 'hh-1';
    req.log = { error: vi.fn(), child: () => req.log };
    next();
  });
  app.use('/webhooks', webhooksRouter);
  return app;
}

describe('webhook secret handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn(async () => ({
      status: 200,
      ok: true,
    })));
  });

  it('encrypts stored secrets and never returns the secret value on create', async () => {
    vi.mocked(prisma.webhook.create).mockResolvedValue({
      id: 'wh-1',
      householdId: 'hh-1',
      name: 'Ledger',
      url: 'https://example.com/hook',
      events: ['transaction.created'],
      secret: 'encrypted:webhook-secret',
      isActive: true,
      createdAt: new Date('2026-05-07T00:00:00.000Z'),
      updatedAt: new Date('2026-05-07T00:00:00.000Z'),
    } as any);

    const res = await request(makeApp())
      .post('/webhooks')
      .send({
        name: 'Ledger',
        url: 'https://example.com/hook',
        events: ['transaction.created'],
        secret: 'webhook-secret',
      });

    expect(res.status).toBe(201);
    const createArgs = vi.mocked(prisma.webhook.create).mock.calls[0][0] as any;
    expect(createArgs.data.secret).toBe('encrypted:webhook-secret');
    expect(res.body.secret).toBeUndefined();
    expect(res.body.secretSet).toBe(true);
  });

  it('masks secrets when listing webhooks', async () => {
    vi.mocked(prisma.webhook.findMany).mockResolvedValue([
      {
        id: 'wh-1',
        householdId: 'hh-1',
        name: 'Ledger',
        url: 'https://example.com/hook',
        events: ['transaction.created'],
        secret: 'encrypted:webhook-secret',
        isActive: true,
        createdAt: new Date('2026-05-07T00:00:00.000Z'),
        updatedAt: new Date('2026-05-07T00:00:00.000Z'),
      },
    ] as any);

    const res = await request(makeApp()).get('/webhooks');

    expect(res.status).toBe(200);
    expect(res.body[0].secret).toBeUndefined();
    expect(res.body[0].secretSet).toBe(true);
  });

  it('decrypts stored secrets before signing test deliveries', async () => {
    vi.mocked(prisma.webhook.findFirst).mockResolvedValue({
      id: 'wh-1',
      householdId: 'hh-1',
      name: 'Ledger',
      url: 'https://example.com/hook',
      events: ['transaction.created'],
      secret: 'encrypted:webhook-secret',
      isActive: true,
    } as any);

    const res = await request(makeApp()).post('/webhooks/wh-1/test');

    expect(res.status).toBe(200);
    const fetchArgs = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    const expected = crypto
      .createHmac('sha256', 'webhook-secret')
      .update(fetchArgs[1].body as string)
      .digest('hex');
    expect((fetchArgs[1].headers as Record<string, string>)['X-Kuber-Signature']).toBe(`sha256=${expected}`);
  });
});
