import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import rulesRouter from '../../src/routes/rules';
import { prisma } from '../../src/lib/prisma';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    rule: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      aggregate: vi.fn(),
    },
    ruleGroup: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      aggregate: vi.fn(),
    },
    ruleExecutionLog: {
      findMany: vi.fn(),
    },
    transactionJournal: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock('../../src/lib/audit', () => ({
  logAudit: vi.fn(),
}));

function makeApp(householdId = 'hh-1', userId = 'user-1') {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res: any, next: any) => {
    req.householdId = householdId;
    req.userId = userId;
    req.log = { error: vi.fn(), info: vi.fn(), child: () => req.log };
    next();
  });
  app.use('/rules', rulesRouter);
  return app;
}

const normalizedRule = {
  id: 'rule-1',
  householdId: 'hh-1',
  name: 'Coffee',
  conditions: [],
  actions: [],
  strict: false,
  stopProcessing: true,
  sortOrder: 1,
  isActive: true,
  ruleGroupId: null,
  triggers: [{ id: 'trigger-1', ruleId: 'rule-1', field: 'description', operator: 'contains', value: 'coffee', sortOrder: 1 }],
  ruleActions: [{ id: 'action-1', ruleId: 'rule-1', type: 'setCategory', value: 'cat-coffee', sortOrder: 1, stopProcessing: false }],
};

describe('rules normalized CRUD', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists rules with normalized triggers and actions while preserving legacy JSON fields', async () => {
    vi.mocked(prisma.rule.findMany).mockResolvedValue([normalizedRule] as any);

    const res = await request(makeApp()).get('/rules');

    expect(res.status).toBe(200);
    expect(prisma.rule.findMany).toHaveBeenCalledWith(expect.objectContaining({
      include: { triggers: true, ruleActions: true },
    }));
    expect(res.body[0]).toMatchObject({
      id: 'rule-1',
      triggers: [{ field: 'description', operator: 'contains', value: 'coffee', sortOrder: 1 }],
      ruleActions: [{ type: 'setCategory', value: 'cat-coffee', sortOrder: 1 }],
      conditions: [{ field: 'description', operator: 'contains', value: 'coffee' }],
      actions: [{ type: 'setCategory', value: 'cat-coffee' }],
    });
  });

  it('creates normalized trigger and action rows from Firefly-style payloads', async () => {
    vi.mocked(prisma.rule.aggregate).mockResolvedValue({ _max: { sortOrder: 2 } } as any);
    vi.mocked(prisma.rule.create).mockResolvedValue({ ...normalizedRule, id: 'rule-new' } as any);

    const res = await request(makeApp())
      .post('/rules')
      .send({
        name: 'Coffee',
        strict: false,
        stopProcessing: true,
        triggers: [{ field: 'description', operator: 'contains', value: 'coffee' }],
        ruleActions: [{ type: 'setCategory', value: 'cat-coffee' }],
      });

    expect(res.status).toBe(201);
    expect(prisma.rule.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        householdId: 'hh-1',
        name: 'Coffee',
        conditions: [{ field: 'description', operator: 'contains', value: 'coffee' }],
        actions: [{ type: 'setCategory', value: 'cat-coffee' }],
        strict: false,
        stopProcessing: true,
        sortOrder: 3,
        triggers: { create: [{ field: 'description', operator: 'contains', value: 'coffee', sortOrder: 1 }] },
        ruleActions: { create: [{ type: 'setCategory', value: 'cat-coffee', sortOrder: 1, stopProcessing: false }] },
      }),
      include: { triggers: true, ruleActions: true },
    });
  });

  it('generates a useful rule name when one is not provided', async () => {
    vi.mocked(prisma.rule.aggregate).mockResolvedValue({ _max: { sortOrder: 0 } } as any);
    vi.mocked(prisma.rule.create).mockImplementation((async ({ data }: any) => ({
      ...normalizedRule,
      name: data.name,
      conditions: data.conditions,
      actions: data.actions,
      triggers: data.triggers.create,
      ruleActions: data.ruleActions.create,
    }) as any) as any);

    const res = await request(makeApp())
      .post('/rules')
      .send({
        conditions: [{ field: 'merchantName', operator: 'contains', value: 'Netflix' }],
        actions: [{ type: 'setCategory', value: 'cat-subscriptions' }],
      });

    expect(res.status).toBe(201);
    expect(prisma.rule.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        name: 'Merchant name contains "Netflix" -> Set category',
      }),
    }));
    expect(res.body.name).toBe('Merchant name contains "Netflix" -> Set category');
  });

  it('falls back to generated names for existing blank rules', async () => {
    vi.mocked(prisma.rule.findMany).mockResolvedValue([{ ...normalizedRule, name: '' }] as any);

    const res = await request(makeApp()).get('/rules');

    expect(res.status).toBe(200);
    expect(res.body[0].name).toBe('Description contains "coffee" -> Set category');
  });
});

describe('rules journal simulation and application', () => {
  beforeEach(() => vi.clearAllMocks());

  it('simulates a rule against explicit match input without mutating journals', async () => {
    vi.mocked(prisma.rule.findFirst).mockResolvedValue(normalizedRule as any);

    const res = await request(makeApp())
      .post('/rules/rule-1/test')
      .send({ matchInput: { description: 'Morning coffee', amount: -5 } });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      matched: true,
      ruleId: 'rule-1',
      actions: [{ type: 'setCategory', value: 'cat-coffee', sortOrder: 1, stopProcessing: false }],
    });
    expect(prisma.transactionJournal.findFirst).not.toHaveBeenCalled();
  });

  it('applies one rule to matching journal entries instead of flat transactions', async () => {
    vi.mocked(prisma.rule.findFirst).mockResolvedValue(normalizedRule as any);
    vi.mocked(prisma.transactionJournal.findMany).mockResolvedValue([
      {
        id: 'journal-1',
        householdId: 'hh-1',
        transactionType: 'withdrawal',
        description: 'Morning coffee',
        amountDecimal: 5,
        categoryId: null,
        notes: null,
        entries: [{ accountId: 'checking-1', amountDecimal: -5 }],
      },
    ] as any);
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => fn({
      transactionJournal: { updateMany: vi.fn() },
      transactionEntry: { updateMany: vi.fn() },
      journalTag: { upsert: vi.fn(), deleteMany: vi.fn() },
      ruleExecutionLog: { create: vi.fn() },
    }));

    const res = await request(makeApp()).post('/rules/rule-1/apply');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ matched: 1, journalsMatched: ['journal-1'], checkpointId: '' });
    expect(prisma.transactionJournal.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ householdId: 'hh-1', isDeleted: false }),
    }));
  });

  it('lists rule execution logs for the household', async () => {
    vi.mocked(prisma.ruleExecutionLog.findMany).mockResolvedValue([
      {
        id: 'log-1',
        householdId: 'hh-1',
        ruleId: 'rule-1',
        journalId: 'journal-1',
        status: 'applied',
        actionsApplied: 1,
        message: null,
        createdAt: new Date('2026-05-06T01:02:03.000Z'),
        rule: { id: 'rule-1', name: 'Coffee' },
        journal: { id: 'journal-1', description: 'Morning coffee', date: new Date('2026-05-06T00:00:00.000Z') },
      },
    ] as any);

    const res = await request(makeApp()).get('/rules/execution-logs');

    expect(res.status).toBe(200);
    expect(res.body.items[0]).toMatchObject({
      id: 'log-1',
      ruleId: 'rule-1',
      journalId: 'journal-1',
      ruleName: 'Coffee',
      journalDescription: 'Morning coffee',
    });
  });
});


