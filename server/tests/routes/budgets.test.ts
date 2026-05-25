import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import budgetsRouter from '../../src/routes/budgets';
import { prisma } from '../../src/lib/prisma';
import { makeRouteTestApp } from '../integration/integrationHarness';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    budget: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    budgetLimit: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    category: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    transactionJournal: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock('../../src/lib/audit', () => ({
  logAudit: vi.fn(),
}));

vi.mock('../../src/lib/budgetLimits', () => ({
  getPeriodKey: vi.fn(() => '2026-05'),
  getOrCreateBudgetLimit: vi.fn(),
  recalcSpentAmount: vi.fn(),
  rolloverPreviousPeriod: vi.fn(),
}));

const groceriesCategory = {
  id: 'cat-groceries',
  householdId: 'household-1',
  name: 'Groceries',
  icon: 'cart',
  type: 'expense',
  groupId: 'group-needs',
  group: {
    id: 'group-needs',
    name: 'Needs',
    sortOrder: 1,
  },
};

const baseBudget = {
  id: 'budget-1',
  householdId: 'household-1',
  categoryId: 'cat-groceries',
  name: null,
  amount: 400,
  amountDecimal: null,
  period: 'monthly',
  rollover: false,
  budgetType: 'FLEXIBLE',
  isDeleted: false,
  category: {
    id: 'cat-groceries',
    name: 'Groceries',
    icon: 'cart',
    type: 'expense',
    group: groceriesCategory.group,
  },
};

function makeApp(householdId = 'household-1') {
  return makeRouteTestApp(budgetsRouter, { householdId, userId: 'user-1' });
}

describe('budgets route integration', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists active household budgets and monthly actuals', async () => {
    vi.mocked(prisma.budget.findMany).mockResolvedValue([baseBudget] as any);
    vi.mocked(prisma.transactionJournal.findMany).mockResolvedValue([
      { categoryId: 'cat-groceries', amountDecimal: -125.5 },
    ] as any);
    vi.mocked(prisma.category.findMany).mockResolvedValue([groceriesCategory] as any);

    const res = await request(makeApp()).get('/?year=2026&month=5');

    expect(res.status).toBe(200);
    expect(prisma.budget.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { householdId: 'household-1', isDeleted: false },
    }));
    expect(prisma.transactionJournal.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        householdId: 'household-1',
        isDeleted: false,
        isHidden: false,
      }),
    }));
    expect(res.body.expenses).toMatchObject({
      budgeted: 400,
      actual: 125.5,
    });
    expect(res.body.expenses.groups[0].categories[0]).toMatchObject({
      id: 'cat-groceries',
      name: 'Groceries',
      budgeted: 400,
      actual: 125.5,
      remaining: 274.5,
      percent: 31.37,
    });
  });

  it('derives budget category group type from categories, not category groups', async () => {
    vi.mocked(prisma.category.findMany).mockResolvedValue([
      {
        ...groceriesCategory,
        group: { id: 'group-needs', name: 'Needs', sortOrder: 1 },
      },
    ] as any);

    const res = await request(makeApp()).get('/categories');

    expect(res.status).toBe(200);
    expect(res.body[0]).toMatchObject({
      groupId: 'group-needs',
      groupName: 'Needs',
      type: 'expense',
    });
  });

  it('creates a category budget only when the category belongs to the household', async () => {
    vi.mocked(prisma.category.findFirst).mockResolvedValue(groceriesCategory as any);
    vi.mocked(prisma.budget.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.budget.create).mockResolvedValue(baseBudget as any);

    const res = await request(makeApp())
      .post('/')
      .send({ categoryId: 'cat-groceries', amount: 400, budgetType: 'FIXED' });

    expect(res.status).toBe(200);
    expect(prisma.category.findFirst).toHaveBeenCalledWith({
      where: { id: 'cat-groceries', householdId: 'household-1' },
    });
    expect(prisma.budget.create).toHaveBeenCalledWith(expect.objectContaining({
      data: {
        householdId: 'household-1',
        categoryId: 'cat-groceries',
        amount: 400,
        period: 'monthly',
        budgetType: 'FIXED',
      },
    }));
  });

  it('rejects budget creation for another household category', async () => {
    vi.mocked(prisma.category.findFirst).mockResolvedValue(null);

    const res = await request(makeApp())
      .post('/')
      .send({ categoryId: 'cat-other', amount: 100 });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Category not found or does not belong to this household' });
    expect(prisma.budget.create).not.toHaveBeenCalled();
    expect(prisma.budget.update).not.toHaveBeenCalled();
  });

  it('forbids updating another household budget', async () => {
    vi.mocked(prisma.budget.findUnique).mockResolvedValue({
      ...baseBudget,
      householdId: 'other-household',
    } as any);

    const res = await request(makeApp())
      .put('/budget-1')
      .send({ amount: 450 });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Forbidden' });
    expect(prisma.budget.update).not.toHaveBeenCalled();
  });

  it('soft-deletes a budget instead of hard-deleting it', async () => {
    vi.mocked(prisma.budget.findUnique).mockResolvedValue(baseBudget as any);
    vi.mocked(prisma.budget.update).mockResolvedValue({
      ...baseBudget,
      isDeleted: true,
    } as any);

    const res = await request(makeApp()).delete('/budget-1');

    expect(res.status).toBe(200);
    expect(prisma.budget.update).toHaveBeenCalledWith({
      where: { id: 'budget-1' },
      data: { isDeleted: true },
    });
    expect(prisma.budget.delete).not.toHaveBeenCalled();
  });
});
