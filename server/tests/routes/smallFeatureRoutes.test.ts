import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { Readable } from 'stream';
import attachmentsRouter from '../../src/routes/attachments';
import objectGroupsRouter from '../../src/routes/objectGroups';
import schedulesRouter from '../../src/routes/schedules';
import transactionLinksRouter from '../../src/routes/transactionLinks';
import usersRouter from '../../src/routes/users';
import { prisma } from '../../src/lib/prisma';
import { deleteFile, getReadStream, storeFile } from '../../src/lib/storage';
import { createLink, deleteLink, getLinksForTransaction, listLinkTypes } from '../../src/lib/transactionLinks';
import { makeRouteTestApp } from '../integration/integrationHarness';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    transactionJournal: { findFirst: vi.fn() },
    attachment: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      delete: vi.fn(),
    },
    objectGroup: {
      findMany: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    account: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    category: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    budget: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    reportSchedule: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('../../src/lib/storage', () => ({
  storeFile: vi.fn(),
  getReadStream: vi.fn(),
  deleteFile: vi.fn(),
}));

vi.mock('../../src/lib/transactionLinks', () => ({
  listLinkTypes: vi.fn(),
  createLink: vi.fn(),
  deleteLink: vi.fn(),
  getLinksForTransaction: vi.fn(),
}));

function app(router: any) {
  return makeRouteTestApp(router, { householdId: 'household-1', userId: 'user-1' });
}

describe('attachment routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uploads an allowed attachment for a household transaction', async () => {
    vi.mocked(prisma.transactionJournal.findFirst).mockResolvedValue({ id: 'tx-1' } as any);
    vi.mocked(storeFile).mockResolvedValue({ filename: 'receipt.pdf', storagePath: 'household-1/tx-1/receipt.pdf' });
    vi.mocked(prisma.attachment.create).mockResolvedValue({
      id: 'att-1',
      filename: 'receipt.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 7,
    } as any);

    const res = await request(app(attachmentsRouter))
      .post('/transactions/tx-1/attachments')
      .attach('file', Buffer.from('receipt'), { filename: 'receipt.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(201);
    expect(storeFile).toHaveBeenCalledWith('household-1', 'tx-1', 'receipt.pdf', expect.any(Buffer));
    expect(prisma.attachment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        householdId: 'household-1',
        transactionId: 'tx-1',
        filename: 'receipt.pdf',
        mimeType: 'application/pdf',
      }),
    });
  });

  it('lists, downloads, and deletes household attachments', async () => {
    vi.mocked(prisma.transactionJournal.findFirst).mockResolvedValue({ id: 'tx-1' } as any);
    vi.mocked(prisma.attachment.findMany).mockResolvedValue([
      { id: 'att-1', filename: 'receipt.txt', mimeType: 'text/plain', sizeBytes: 5, uploadedAt: new Date() },
    ] as any);

    const listRes = await request(app(attachmentsRouter)).get('/transactions/tx-1/attachments');

    expect(listRes.status).toBe(200);
    expect(prisma.attachment.findMany).toHaveBeenCalledWith({
      where: { transactionId: 'tx-1', householdId: 'household-1' },
      orderBy: { uploadedAt: 'asc' },
      select: { id: true, filename: true, mimeType: true, sizeBytes: true, uploadedAt: true },
    });

    vi.mocked(prisma.attachment.findFirst).mockResolvedValue({
      id: 'att-1',
      filename: 'receipt.txt',
      mimeType: 'text/plain',
      sizeBytes: 5,
      storagePath: 'receipt.txt',
    } as any);
    vi.mocked(getReadStream).mockReturnValue(Readable.from(['hello']) as any);

    const downloadRes = await request(app(attachmentsRouter)).get('/attachments/att-1/download');

    expect(downloadRes.status).toBe(200);
    expect(downloadRes.headers['content-type']).toContain('text/plain');
    expect(downloadRes.text).toBe('hello');

    vi.mocked(deleteFile).mockResolvedValue(undefined);
    vi.mocked(prisma.attachment.delete).mockResolvedValue({} as any);

    const deleteRes = await request(app(attachmentsRouter)).delete('/attachments/att-1');

    expect(deleteRes.status).toBe(200);
    expect(deleteFile).toHaveBeenCalledWith('receipt.txt');
    expect(prisma.attachment.delete).toHaveBeenCalledWith({ where: { id: 'att-1' } });
  });

  it('rejects missing transactions and disallowed upload types', async () => {
    vi.mocked(prisma.transactionJournal.findFirst).mockResolvedValue(null);

    const notFound = await request(app(attachmentsRouter))
      .post('/transactions/missing/attachments')
      .attach('file', Buffer.from('x'), { filename: 'receipt.txt', contentType: 'text/plain' });

    expect(notFound.status).toBe(404);
    expect(storeFile).not.toHaveBeenCalled();

    vi.mocked(prisma.transactionJournal.findFirst).mockResolvedValue({ id: 'tx-1' } as any);
    const badType = await request(app(attachmentsRouter))
      .post('/transactions/tx-1/attachments')
      .attach('file', Buffer.from('x'), { filename: 'script.sh', contentType: 'application/x-sh' });

    expect(badType.status).toBe(400);
    expect(badType.body.error).toContain('not allowed');
  });
});

describe('object group routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates, updates, assigns, and deletes household object groups', async () => {
    vi.mocked(prisma.objectGroup.findMany).mockResolvedValue([{ id: 'group-1', name: 'Daily', entityType: 'account' }] as any);
    const listRes = await request(app(objectGroupsRouter)).get('/?entityType=account');
    expect(listRes.status).toBe(200);
    expect(prisma.objectGroup.findMany).toHaveBeenCalledWith({
      where: { householdId: 'household-1', entityType: 'account' },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    vi.mocked(prisma.objectGroup.create).mockResolvedValue({ id: 'group-1', name: 'Daily' } as any);
    const createRes = await request(app(objectGroupsRouter))
      .post('/')
      .send({ name: 'Daily', entityType: 'account', color: '#00aa55', sortOrder: 1 });
    expect(createRes.status).toBe(201);
    expect(prisma.objectGroup.create).toHaveBeenCalledWith({
      data: { householdId: 'household-1', name: 'Daily', entityType: 'account', color: '#00aa55', sortOrder: 1 },
    });

    vi.mocked(prisma.objectGroup.findFirst).mockResolvedValue({ id: 'group-1' } as any);
    vi.mocked(prisma.account.findFirst).mockResolvedValue({ id: 'account-1' } as any);
    vi.mocked(prisma.account.update).mockResolvedValue({} as any);
    const assignRes = await request(app(objectGroupsRouter))
      .patch('/assign')
      .send({ entityType: 'account', entityId: 'account-1', groupId: 'group-1' });
    expect(assignRes.status).toBe(200);
    expect(prisma.account.update).toHaveBeenCalledWith({
      where: { id: 'account-1', householdId: 'household-1' },
      data: { objectGroupId: 'group-1' },
    });

    vi.mocked(prisma.objectGroup.update).mockResolvedValue({ id: 'group-1', name: 'Daily Banking' } as any);
    const updateRes = await request(app(objectGroupsRouter)).put('/group-1').send({ name: 'Daily Banking' });
    expect(updateRes.status).toBe(200);

    vi.mocked(prisma.objectGroup.delete).mockResolvedValue({} as any);
    const deleteRes = await request(app(objectGroupsRouter)).delete('/group-1');
    expect(deleteRes.status).toBe(200);
    expect(prisma.objectGroup.delete).toHaveBeenCalledWith({ where: { id: 'group-1' } });
  });

  it('validates object group inputs before writes', async () => {
    const res = await request(app(objectGroupsRouter)).post('/').send({ name: '', entityType: 'account' });

    expect(res.status).toBe(400);
    expect(prisma.objectGroup.create).not.toHaveBeenCalled();
  });
});

describe('schedule routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns defaults and upserts report schedule settings', async () => {
    vi.mocked(prisma.reportSchedule.findUnique).mockResolvedValue(null);
    const getRes = await request(app(schedulesRouter)).get('/report-schedule');
    expect(getRes.status).toBe(200);
    expect(getRes.body).toEqual({
      householdId: 'household-1',
      frequency: 'weekly',
      enabled: false,
      lastSentAt: null,
    });

    vi.mocked(prisma.reportSchedule.upsert).mockResolvedValue({
      householdId: 'household-1',
      userId: 'user-1',
      frequency: 'monthly',
      enabled: true,
    } as any);

    const putRes = await request(app(schedulesRouter))
      .put('/report-schedule')
      .send({ frequency: 'monthly', enabled: true });

    expect(putRes.status).toBe(200);
    expect(prisma.reportSchedule.upsert).toHaveBeenCalledWith({
      where: { householdId: 'household-1' },
      update: { frequency: 'monthly', enabled: true, userId: 'user-1' },
      create: { householdId: 'household-1', userId: 'user-1', frequency: 'monthly', enabled: true },
    });
  });
});

describe('transaction link routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists link types, creates links, lists transaction links, and deletes links', async () => {
    vi.mocked(listLinkTypes).mockResolvedValue([{ id: 'duplicate', label: 'Duplicate' }] as any);
    const typesRes = await request(app(transactionLinksRouter)).get('/transaction-link-types');
    expect(typesRes.status).toBe(200);
    expect(typesRes.body).toEqual([{ id: 'duplicate', label: 'Duplicate' }]);

    vi.mocked(createLink).mockResolvedValue({ id: 'link-1', fromId: 'tx-1', toId: 'tx-2' } as any);
    const createRes = await request(app(transactionLinksRouter))
      .post('/transaction-links')
      .send({ linkTypeId: 'duplicate', fromId: 'tx-1', toId: 'tx-2' });
    expect(createRes.status).toBe(201);
    expect(createLink).toHaveBeenCalledWith({
      householdId: 'household-1',
      linkTypeId: 'duplicate',
      fromId: 'tx-1',
      toId: 'tx-2',
    });

    vi.mocked(getLinksForTransaction).mockResolvedValue([{ id: 'link-1' }] as any);
    const listRes = await request(app(transactionLinksRouter)).get('/transactions/tx-1/links');
    expect(listRes.status).toBe(200);
    expect(getLinksForTransaction).toHaveBeenCalledWith({ householdId: 'household-1', transactionId: 'tx-1' });

    vi.mocked(deleteLink).mockResolvedValue({ id: 'link-1' } as any);
    const deleteRes = await request(app(transactionLinksRouter)).delete('/transaction-links/link-1');
    expect(deleteRes.status).toBe(200);
  });

  it('validates create requests and maps link domain errors', async () => {
    const invalidRes = await request(app(transactionLinksRouter)).post('/transaction-links').send({ fromId: 'tx-1' });
    expect(invalidRes.status).toBe(400);

    vi.mocked(createLink).mockRejectedValue(new Error('Cannot link a transaction to itself'));
    const domainRes = await request(app(transactionLinksRouter))
      .post('/transaction-links')
      .send({ linkTypeId: 'duplicate', fromId: 'tx-1', toId: 'tx-1' });
    expect(domainRes.status).toBe(400);
  });
});

describe('user routes', () => {
  beforeEach(() => vi.clearAllMocks());

  const user = {
    id: 'user-1',
    email: 'user@example.com',
    firstName: 'Ada',
    lastName: 'Lovelace',
    avatar: null,
    timezone: 'America/Toronto',
    theme: 'system',
  };

  it('returns and updates the current user DTO with household context', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(user as any);
    const getRes = await request(app(usersRouter)).get('/me');
    expect(getRes.status).toBe(200);
    expect(getRes.body).toMatchObject({ id: 'user-1', householdId: 'household-1' });

    vi.mocked(prisma.user.update).mockResolvedValue({ ...user, firstName: 'Grace', theme: 'dark' } as any);
    const putRes = await request(app(usersRouter)).put('/me').send({ firstName: 'Grace', theme: 'dark' });
    expect(putRes.status).toBe(200);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { firstName: 'Grace', theme: 'dark' },
    });
    expect(putRes.body).toMatchObject({ firstName: 'Grace', theme: 'dark', householdId: 'household-1' });
  });

  it('returns 404 when the authenticated user no longer exists', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    const res = await request(app(usersRouter)).get('/me');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'User not found' });
  });
});


