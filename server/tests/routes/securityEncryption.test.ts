import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import securityRouter from '../../src/routeModules/security';
import { prisma } from '../../src/lib/prisma';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    householdEncryptionKey: {
      findFirst: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    householdWrappedKey: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).userId = 'user-1';
    (req as any).householdId = 'household-1';
    (req as any).log = { error: vi.fn(), child: () => (req as any).log };
    next();
  });
  app.use('/security', securityRouter);
  return app;
}

describe('security encryption routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.$transaction).mockImplementation(async (arg: unknown) => {
      if (typeof arg === 'function') return arg(prisma);
      return Promise.all(arg as Promise<unknown>[]);
    });
  });

  it('returns disabled status when no active key exists', async () => {
    vi.mocked(prisma.householdEncryptionKey.findFirst).mockResolvedValue(null);

    const res = await request(makeApp()).get('/security/encryption/status');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ enabled: false, activeKey: null, hasWrappedKey: false });
  });

  it('sets up encryption with an opaque wrapped key envelope', async () => {
    vi.mocked(prisma.householdEncryptionKey.create).mockResolvedValue({
      id: 'key-1',
      householdId: 'household-1',
      version: 1,
      status: 'active',
      createdAt: new Date('2026-05-21T12:00:00.000Z'),
      updatedAt: new Date('2026-05-21T12:00:00.000Z'),
    } as never);
    vi.mocked(prisma.householdWrappedKey.create).mockResolvedValue({} as never);

    const wrappedKey = { v: 1, alg: 'AES-GCM', kid: 'wrap-1', iv: 'iv', ct: 'ct' };
    const res = await request(makeApp())
      .post('/security/encryption/setup')
      .send({ wrappedKey });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ enabled: true, activeKey: { id: 'key-1', version: 1 } });
    expect(prisma.householdWrappedKey.create).toHaveBeenCalledWith({
      data: { keyId: 'key-1', userId: 'user-1', wrappedKey },
    });
  });
});
