import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import categoriesRouter from './categories';
import { prisma } from '../lib/prisma';
import { makeRouteTestApp } from '../test/integrationHarness';

vi.mock('../lib/prisma', () => ({
  prisma: {
    category: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

const baseCategory = {
  id: 'cat-1',
  householdId: 'household-1',
  name: 'Dining',
  icon: 'utensils',
  type: 'EXPENSE',
  groupId: 'group-1',
  group: { id: 'group-1', name: 'Wants' },
  bucketType: 'wants',
  isTaxDeductible: false,
  isSystem: false,
  isDeleted: false,
};

function makeApp(householdId = 'household-1') {
  return makeRouteTestApp(categoriesRouter, { householdId, userId: 'user-1' });
}

describe('categories route integration', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists active household categories for selectors', async () => {
    vi.mocked(prisma.category.findMany).mockResolvedValue([baseCategory] as any);

    const res = await request(makeApp()).get('/');

    expect(res.status).toBe(200);
    expect(prisma.category.findMany).toHaveBeenCalledWith({
      where: { householdId: 'household-1', isDeleted: false },
      include: { group: { select: { id: true, name: true } } },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    expect(res.body).toEqual([
      {
        id: 'cat-1',
        name: 'Dining',
        icon: 'utensils',
        type: 'EXPENSE',
        groupId: 'group-1',
        groupName: 'Wants',
      },
    ]);
  });

  it('creates a household-scoped custom category with trimmed name', async () => {
    vi.mocked(prisma.category.create).mockResolvedValue({
      ...baseCategory,
      name: 'Dining Out',
      icon: null,
      groupId: null,
      group: null,
      bucketType: 'wants',
      isTaxDeductible: true,
    } as any);

    const res = await request(makeApp())
      .post('/')
      .send({
        name: ' Dining Out ',
        type: 'EXPENSE',
        bucketType: 'wants',
        isTaxDeductible: true,
      });

    expect(res.status).toBe(201);
    expect(prisma.category.create).toHaveBeenCalledWith({
      data: {
        householdId: 'household-1',
        name: 'Dining Out',
        icon: null,
        type: 'EXPENSE',
        groupId: null,
        bucketType: 'wants',
        isTaxDeductible: true,
        isSystem: false,
      },
      include: { group: { select: { id: true, name: true } } },
    });
    expect(res.body).toMatchObject({
      id: 'cat-1',
      name: 'Dining Out',
      groupName: null,
    });
  });

  it('rejects invalid category payloads before writing', async () => {
    const res = await request(makeApp())
      .post('/')
      .send({ name: '', type: 'EXPENSE' });

    expect(res.status).toBe(400);
    expect(prisma.category.create).not.toHaveBeenCalled();
  });

  it('returns 404 when deleting another household category', async () => {
    vi.mocked(prisma.category.findFirst).mockResolvedValue(null);

    const res = await request(makeApp()).delete('/cat-other');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Category not found' });
    expect(prisma.category.update).not.toHaveBeenCalled();
    expect(prisma.category.delete).not.toHaveBeenCalled();
  });

  it('forbids deleting system categories', async () => {
    vi.mocked(prisma.category.findFirst).mockResolvedValue({
      ...baseCategory,
      isSystem: true,
    } as any);

    const res = await request(makeApp()).delete('/cat-1');

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Cannot delete system categories' });
    expect(prisma.category.update).not.toHaveBeenCalled();
  });

  it('soft-deletes custom categories instead of hard-deleting them', async () => {
    vi.mocked(prisma.category.findFirst).mockResolvedValue(baseCategory as any);
    vi.mocked(prisma.category.update).mockResolvedValue({
      ...baseCategory,
      isDeleted: true,
    } as any);

    const res = await request(makeApp()).delete('/cat-1');

    expect(res.status).toBe(200);
    expect(prisma.category.findFirst).toHaveBeenCalledWith({
      where: { id: 'cat-1', householdId: 'household-1', isDeleted: false },
    });
    expect(prisma.category.update).toHaveBeenCalledWith({
      where: { id: 'cat-1' },
      data: { isDeleted: true },
    });
    expect(prisma.category.delete).not.toHaveBeenCalled();
  });
});
