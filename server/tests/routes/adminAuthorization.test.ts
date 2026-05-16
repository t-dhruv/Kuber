import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import apiTokensRouter from '../../src/routes/apiTokens';
import webhooksRouter from '../../src/routes/webhooks';
import { prisma } from '../../src/lib/prisma';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    householdMember: {
      findUnique: vi.fn(),
    },
    apiToken: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      delete: vi.fn(),
    },
    webhook: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    webhookDelivery: {
      findMany: vi.fn(),
    },
  },
}));

function makeApp(role = 'member') {
  vi.mocked(prisma.householdMember.findUnique).mockResolvedValue({ role } as any);
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.userId = 'user-1';
    req.householdId = 'hh-1';
    req.log = { error: vi.fn(), child: () => req.log };
    next();
  });
  app.use('/api-tokens', apiTokensRouter);
  app.use('/webhooks', webhooksRouter);
  return app;
}

describe('admin-only integration routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects regular members creating API tokens', async () => {
    const res = await request(makeApp())
      .post('/api-tokens')
      .send({ name: 'Member token' });

    expect(res.status).toBe(403);
    expect(prisma.apiToken.create).not.toHaveBeenCalled();
  });

  it('rejects regular members creating webhooks', async () => {
    const res = await request(makeApp())
      .post('/webhooks')
      .send({
        name: 'Ledger sink',
        url: 'https://example.com/webhook',
        events: ['transaction.created'],
      });

    expect(res.status).toBe(403);
    expect(prisma.webhook.create).not.toHaveBeenCalled();
  });

  it('rejects owner webhook URLs pointing at private infrastructure', async () => {
    const res = await request(makeApp('owner'))
      .post('/webhooks')
      .send({
        name: 'Metadata sink',
        url: 'http://169.254.169.254/latest/meta-data',
        events: ['transaction.created'],
      });

    expect(res.status).toBe(400);
    expect(prisma.webhook.create).not.toHaveBeenCalled();
  });
});


