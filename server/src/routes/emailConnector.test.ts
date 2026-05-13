import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import emailConnectorRouter from './emailConnector';
import { prisma } from '../lib/prisma';

vi.mock('../lib/prisma', () => ({
  prisma: {
    householdMember: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
    userPreference: {
      findFirst: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
    account: {
      findFirst: vi.fn(),
    },
    transaction: {
      create: vi.fn(),
    },
  },
}));

vi.mock('../lib/encryption', () => ({
  encrypt: (value: string) => `encrypted:${value}`,
  decrypt: (value: string) => value.replace(/^encrypted:/, ''),
}));

vi.mock('../lib/imapWatcher', () => ({
  fetchReceiptEmails: vi.fn().mockResolvedValue([]),
}));

function makeApp() {
  vi.mocked(prisma.householdMember.findUnique).mockResolvedValue({ role: 'owner' } as any);
  vi.mocked(prisma.householdMember.findFirst).mockResolvedValue({ householdId: 'hh-1' } as any);
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.userId = 'user-1';
    req.householdId = 'hh-1';
    req.log = { error: vi.fn(), child: () => req.log };
    next();
  });
  app.use('/email-connector', emailConnectorRouter);
  return app;
}

describe('email connector credential storage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('encrypts the IMAP password before saving config', async () => {
    vi.mocked(prisma.userPreference.upsert).mockResolvedValue({} as any);

    const res = await request(makeApp())
      .put('/email-connector/config')
      .send({
        host: 'imap.example.com',
        port: 993,
        user: 'ada@example.com',
        password: 'mailbox-secret',
        tls: true,
        accountId: 'acct-1',
      });

    expect(res.status).toBe(200);
    const upsertArgs = vi.mocked(prisma.userPreference.upsert).mock.calls[0][0] as any;
    const stored = JSON.parse(upsertArgs.create.value);
    expect(stored.password).toBe('encrypted:mailbox-secret');
    expect(upsertArgs.create.value).not.toContain('"password":"mailbox-secret"');
    expect(upsertArgs.update.value).toBe(upsertArgs.create.value);
  });
});
