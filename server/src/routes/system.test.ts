import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import systemRouter from './system';
import { prisma } from '../lib/prisma';

vi.mock('../lib/prisma', () => ({
  prisma: {
    userPreference: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    householdMember: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock('../lib/encryption', () => ({
  encrypt: (v: string) => v,
  decrypt: (v: string) => v,
}));

function makeApp(householdId = 'hh1', userId = 'u1', role = 'owner') {
  vi.mocked(prisma.householdMember.findUnique).mockResolvedValue({ role } as any);
  const app = express();
  app.use(express.json());
  app.use((req: any, _res: any, next: any) => {
    req.householdId = householdId;
    req.userId = userId;
    next();
  });
  app.use('/system', systemRouter);
  return app;
}

describe('GET /system/automation', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns defaults when no preference stored', async () => {
    vi.mocked(prisma.userPreference.findUnique).mockResolvedValue(null);
    const res = await request(makeApp()).get('/system/automation');
    expect(res.status).toBe(200);
    expect(res.body.ruleEngineEnabled).toBe(true);
    expect(res.body.billMatcherConfidence).toBe(80);
  });

  it('returns stored config when preference exists', async () => {
    vi.mocked(prisma.userPreference.findUnique).mockResolvedValue({
      value: JSON.stringify({ ruleEngineEnabled: false, billMatcherEnabled: true, billMatcherConfidence: 60, autoCategorizeEnabled: false }),
    } as any);
    const res = await request(makeApp()).get('/system/automation');
    expect(res.status).toBe(200);
    expect(res.body.ruleEngineEnabled).toBe(false);
    expect(res.body.billMatcherConfidence).toBe(60);
  });
});

describe('PUT /system/automation', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('rejects regular members before saving config', async () => {
    const body = { ruleEngineEnabled: false, billMatcherEnabled: true, billMatcherConfidence: 70, autoCategorizeEnabled: true };
    const res = await request(makeApp('hh1', 'u1', 'member')).put('/system/automation').send(body);
    expect(res.status).toBe(403);
    expect(prisma.userPreference.upsert).not.toHaveBeenCalled();
  });

  it('saves valid config and returns it', async () => {
    vi.mocked(prisma.userPreference.upsert).mockResolvedValue({} as any);
    const body = { ruleEngineEnabled: false, billMatcherEnabled: true, billMatcherConfidence: 70, autoCategorizeEnabled: true };
    const res = await request(makeApp()).put('/system/automation').send(body);
    expect(res.status).toBe(200);
    expect(res.body.ruleEngineEnabled).toBe(false);
    expect(prisma.userPreference.upsert).toHaveBeenCalled();
  });

  it('rejects invalid billMatcherConfidence', async () => {
    const res = await request(makeApp()).put('/system/automation').send({ billMatcherConfidence: 150 });
    expect(res.status).toBe(400);
  });
});

describe('GET /system/integrations', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns defaults when no preference stored', async () => {
    vi.mocked(prisma.userPreference.findUnique).mockResolvedValue(null);
    const res = await request(makeApp()).get('/system/integrations');
    expect(res.status).toBe(200);
    expect(res.body.imapEnabled).toBe(false);
    expect(res.body.digestSchedule).toBe('weekly');
  });
});

describe('GET /system/ai', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns defaults when no preference stored', async () => {
    vi.mocked(prisma.userPreference.findUnique).mockResolvedValue(null);
    const res = await request(makeApp()).get('/system/ai');
    expect(res.status).toBe(200);
    expect(res.body.proactiveAiEnabled).toBe(true);
    expect(res.body.proactiveAiFrequency).toBe('daily');
  });
});

describe('PUT /system/integrations', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('saves valid config and returns it', async () => {
    vi.mocked(prisma.userPreference.upsert).mockResolvedValue({} as any);
    const body = {
      imapEnabled: true,
      imapHost: 'imap.gmail.com',
      imapPort: 993,
      imapUser: 'test@gmail.com',
      imapPass: 'secret',
      digestEnabled: false,
      digestSchedule: 'weekly',
      webhooksEnabled: true,
    };
    const res = await request(makeApp()).put('/system/integrations').send(body);
    expect(res.status).toBe(200);
    expect(res.body.imapEnabled).toBe(true);
    expect(prisma.userPreference.upsert).toHaveBeenCalled();
  });

  it('rejects invalid imapPort', async () => {
    const res = await request(makeApp()).put('/system/integrations').send({ imapPort: 99999 });
    expect(res.status).toBe(400);
  });
});

describe('PUT /system/ai', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('saves valid config and returns it', async () => {
    vi.mocked(prisma.userPreference.upsert).mockResolvedValue({} as any);
    const body = {
      proactiveAiEnabled: false,
      proactiveAiFrequency: 'weekly',
      investmentIntelEnabled: true,
      wealthAnalysisEnabled: false,
    };
    const res = await request(makeApp()).put('/system/ai').send(body);
    expect(res.status).toBe(200);
    expect(res.body.proactiveAiEnabled).toBe(false);
    expect(prisma.userPreference.upsert).toHaveBeenCalled();
  });
});
