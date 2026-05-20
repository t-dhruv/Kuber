import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { logAudit } from '../lib/audit';
import { getPeriodKey, getOrCreateBudgetLimit, recalcSpentAmount, rolloverPreviousPeriod } from '../lib/budgetLimits';

const router = Router();

type BudgetType = 'FIXED' | 'FLEXIBLE' | 'NON_MONTHLY';

const budgetCreateSchema = z.object({
  categoryId: z.string().optional(),
  name: z.string().min(1).optional(),
  amount: z.number().nonnegative(),
  budgetType: z.enum(['FIXED', 'FLEXIBLE', 'NON_MONTHLY']).optional(),
}).refine(data => data.categoryId || data.name, {
  message: 'Provide either categoryId (category budget) or name (catch-all budget)',
});

const budgetUpdateSchema = z.object({
  amount: z.number().nonnegative().optional(),
  budgetType: z.enum(['FIXED', 'FLEXIBLE', 'NON_MONTHLY']).optional(),
}).refine(data => data.amount !== undefined || data.budgetType !== undefined, {
  message: 'At least one of budgetType or amount is required',
});

function getMonthBounds(year: number, month: number): { start: Date; end: Date } {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 1);
  return { start, end };
}

// GET /api/v1/budgets/categories
// Must be defined before /:id to avoid route conflict
router.get('/categories', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;

    const categories = await prisma.category.findMany({
      where: { householdId },
      include: {
        group: true,
      },
      orderBy: [{ groupId: 'asc' }, { sortOrder: 'asc' }],
    });

    // Group by categoryGroup
    const groupMap = new Map<
      string,
      {
        groupId: string;
        groupName: string;
        type: string;
        sortOrder: number;
        categories: Array<{ id: string; name: string; icon: string | null; color: string | null }>;
      }
    >();

    // Handle categories without a group
    const ungroupedIncome: Array<{ id: string; name: string; icon: string | null; color: string | null }> = [];
    const ungroupedExpense: Array<{ id: string; name: string; icon: string | null; color: string | null }> = [];

    for (const cat of categories) {
      const catEntry = {
        id: cat.id,
        name: cat.name,
        icon: cat.icon ?? null,
        color: null,
      };

      if (!cat.groupId || !cat.group) {
        if (cat.type?.toUpperCase() === 'INCOME') {
          ungroupedIncome.push(catEntry);
        } else {
          ungroupedExpense.push(catEntry);
        }
        continue;
      }

      if (!groupMap.has(cat.groupId)) {
        groupMap.set(cat.groupId, {
          groupId: cat.group.id,
          groupName: cat.group.name,
          type: cat.group.type,
          sortOrder: cat.group.sortOrder,
          categories: [],
        });
      }
      groupMap.get(cat.groupId)!.categories.push(catEntry);
    }

    const result = Array.from(groupMap.values())
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(({ sortOrder: _s, ...g }) => g);

    // Prepend ungrouped income/expense synthetic groups if needed
    if (ungroupedIncome.length > 0) {
      result.unshift({
        groupId: '__ungrouped_income',
        groupName: 'Income',
        type: 'INCOME',
        categories: ungroupedIncome,
      });
    }
    if (ungroupedExpense.length > 0) {
      result.push({
        groupId: '__ungrouped_expense',
        groupName: 'Uncategorized',
        type: 'EXPENSE',
        categories: ungroupedExpense,
      });
    }

    return res.json(result);
  } catch (err) {
    req.log.error({ err }, 'budgets/categories');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/budgets
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const now = new Date();
    const year = parseInt(req.query.year as string) || now.getFullYear();
    const month = parseInt(req.query.month as string) || now.getMonth() + 1;

    if (month < 1 || month > 12) {
      return res.status(400).json({ error: 'month must be between 1 and 12' });
    }

    const { start, end } = getMonthBounds(year, month);

    // Fetch all budgets for the household with their categories and groups
    const budgets = await prisma.budget.findMany({
      where: { householdId, isDeleted: false },
      include: {
        category: {
          include: {
            group: true,
          },
        },
      },
    });

    // Fetch all journals for the specified month
    const journals = await prisma.transactionJournal.findMany({
      where: {
        householdId,
        date: { gte: start, lt: end },
        isHidden: false,
        transactionType: { not: 'transfer' },
        isDeleted: false,
      },
      select: { categoryId: true, amountDecimal: true },
    });

    // Also get all categories (to detect unbudgeted spend)
    const allCategories = await prisma.category.findMany({
      where: { householdId },
      include: { group: true },
    });

    // Sum actuals by categoryId
    const actualByCategory = new Map<string, number>();
    for (const j of journals) {
      if (j.categoryId) {
        actualByCategory.set(
          j.categoryId,
          (actualByCategory.get(j.categoryId) ?? 0) + Number(j.amountDecimal),
        );
      }
    }

    // Build a map of categoryId -> budget record
    const budgetByCategory = new Map<string, { amount: number; budgetType: string }>();
    for (const b of budgets) {
      if (b.categoryId) budgetByCategory.set(b.categoryId, { amount: b.amount, budgetType: b.budgetType });
    }

    const categoryById = new Map(allCategories.map(c => [c.id, c]));

    // Set of categoryIds that have a budget row
    const budgetedCategoryIds = new Set(budgets.map(b => b.categoryId).filter(Boolean));

    // Collect all category IDs to include in main budget view: those with budget rows + actual spend
    const allCategoryIds = new Set<string>([
      ...budgets.map(b => b.categoryId).filter((id): id is string => !!id),
      ...Array.from(actualByCategory.keys()),
    ]);

    type CategoryRow = {
      id: string;
      name: string;
      icon: string | null;
      budgeted: number;
      actual: number;
      remaining: number;
      percent: number;
      budgetType: string;
    };

    type ExpenseGroup = {
      name: string;
      budgeted: number;
      actual: number;
      categories: CategoryRow[];
    };

    const incomeCategories: CategoryRow[] = [];
    const expenseGroupMap = new Map<string, ExpenseGroup>();
    const unbudgeted: CategoryRow[] = [];

    for (const catId of allCategoryIds) {
      const cat = categoryById.get(catId);
      if (!cat) continue;

      const budgetEntry = budgetByCategory.get(catId);
      const budgeted = budgetEntry?.amount ?? 0;
      const budgetType = budgetEntry?.budgetType ?? 'FLEXIBLE';
      const rawActual = actualByCategory.get(catId) ?? 0;

      let actual: number;
      if (cat.type?.toUpperCase() === 'INCOME') {
        // income: positive amounts
        actual = rawActual > 0 ? rawActual : Math.abs(rawActual);
      } else {
        // expense: stored as negative, display as positive
        actual = rawActual < 0 ? Math.abs(rawActual) : rawActual;
      }

      actual = Math.round(actual * 100) / 100;
      const remaining = Math.round((budgeted - actual) * 100) / 100;
      const percent = budgeted > 0
        ? Math.round((actual / budgeted) * 10000) / 100
        : actual > 0 ? 100 : 0;

      const row: CategoryRow = {
        id: cat.id,
        name: cat.name,
        icon: cat.icon ?? null,
        budgeted,
        actual,
        remaining,
        percent,
        budgetType,
      };

      if (cat.type?.toUpperCase() === 'INCOME') {
        incomeCategories.push(row);
      } else {
        // If the category has actual spend but NO budget row, add to unbudgeted
        if (!budgetedCategoryIds.has(catId) && actual > 0) {
          unbudgeted.push(row);
          continue;
        }
        const groupId = cat.groupId ?? '__ungrouped';
        const groupName = cat.group?.name ?? 'Uncategorized';
        if (!expenseGroupMap.has(groupId)) {
          expenseGroupMap.set(groupId, {
            name: groupName,
            budgeted: 0,
            actual: 0,
            categories: [],
          });
        }
        const group = expenseGroupMap.get(groupId)!;
        group.categories.push(row);
        group.budgeted += budgeted;
        group.actual += actual;
      }
    }

    const r2 = (n: number) => Math.round(n * 100) / 100;

    const incomeBudgeted = r2(incomeCategories.reduce((s, c) => s + c.budgeted, 0));
    const incomeActual = r2(incomeCategories.reduce((s, c) => s + c.actual, 0));

    const expenseGroups = Array.from(expenseGroupMap.values());
    const expensesBudgeted = r2(expenseGroups.reduce((s, g) => s + g.budgeted, 0));
    const expensesActual = r2(expenseGroups.reduce((s, g) => s + g.actual, 0));

    // Build byType breakdown: flatten all budgeted expense categories
    const allBudgetedExpenseRows = expenseGroups.flatMap(g => g.categories);
    const byType = {
      fixed: allBudgetedExpenseRows.filter(r => r.budgetType === 'FIXED'),
      flexible: allBudgetedExpenseRows.filter(r => r.budgetType === 'FLEXIBLE'),
      nonMonthly: allBudgetedExpenseRows.filter(r => r.budgetType === 'NON_MONTHLY'),
    };

    const leftToBudget = r2(incomeActual - expensesActual);
    const savingsRate = incomeActual > 0
      ? Math.min(100, Math.max(0, Math.round((leftToBudget / incomeActual) * 10000) / 100))
      : 0;

    return res.json({
      month,
      year,
      income: {
        budgeted: incomeBudgeted,
        actual: incomeActual,
        categories: incomeCategories,
      },
      expenses: {
        budgeted: expensesBudgeted,
        actual: expensesActual,
        groups: expenseGroups,
        byType,
      },
      unbudgeted,
      leftToBudget,
      savingsRate,
    });
  } catch (err) {
    req.log.error({ err }, 'budgets/GET');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/v1/budgets
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const parse = budgetCreateSchema.safeParse(req.body);
    if (!parse.success) return res.status(400).json({ error: parse.error.errors[0]?.message });
    const { categoryId, name, amount, budgetType } = parse.data;

    // If categoryId provided, verify it belongs to this household
    if (categoryId) {
      const category = await prisma.category.findFirst({ where: { id: categoryId, householdId } });
      if (!category) {
        return res.status(400).json({ error: 'Category not found or does not belong to this household' });
      }
    }

    const resolvedBudgetType = (budgetType as BudgetType) ?? 'FLEXIBLE';

    // Upsert by categoryId if present, otherwise create new
    let budget;
    if (categoryId) {
      const existing = await prisma.budget.findFirst({ where: { householdId, categoryId } });
      if (existing) {
        budget = await prisma.budget.update({
          where: { id: existing.id },
          data: { amount, budgetType: resolvedBudgetType },
          include: { category: { select: { id: true, name: true, icon: true, type: true } } },
        });
      } else {
        budget = await prisma.budget.create({
          data: { householdId, categoryId, amount, period: 'monthly', budgetType: resolvedBudgetType },
          include: { category: { select: { id: true, name: true, icon: true, type: true } } },
        });
      }
    } else {
      budget = await prisma.budget.create({
        data: { householdId, name: name!, amount, period: 'monthly', budgetType: resolvedBudgetType },
        include: { category: { select: { id: true, name: true, icon: true, type: true } } },
      });
    }

    logAudit({ householdId, userId: req.userId!, action: 'CREATE', entity: 'BUDGET', entityId: budget.id, after: { categoryId, name, amount, budgetType: resolvedBudgetType } });
    return res.json(budget);
  } catch (err) {
    req.log.error({ err }, 'budgets/POST');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/v1/budgets/:id
router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const { id } = req.params;
    const parse = budgetUpdateSchema.safeParse(req.body);
    if (!parse.success) return res.status(400).json({ error: parse.error.errors[0]?.message });
    const { budgetType, amount } = parse.data;

    const existing = await prisma.budget.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Budget not found' });
    }
    if (existing.householdId !== householdId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const updateData: { budgetType?: string; amount?: number; updatedAt: Date } = {
      updatedAt: new Date(),
    };
    if (budgetType !== undefined) updateData.budgetType = budgetType;
    if (amount !== undefined) updateData.amount = amount;

    const budget = await prisma.budget.update({
      where: { id },
      data: updateData,
      include: {
        category: { select: { id: true, name: true, icon: true, type: true } },
      },
    });

    logAudit({
      householdId,
      userId: req.userId!,
      action: 'UPDATE',
      entity: 'BUDGET',
      entityId: id,
      before: { budgetType: existing.budgetType, amount: existing.amount },
      after: { budgetType: budget.budgetType, amount: budget.amount },
    });
    return res.json(budget);
  } catch (err) {
    req.log.error({ err }, 'budgets/PUT');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/v1/budgets/:id
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const { id } = req.params;

    const budget = await prisma.budget.findUnique({ where: { id } });
    if (!budget) {
      return res.status(404).json({ error: 'Budget not found' });
    }
    if (budget.householdId !== householdId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    await prisma.budget.update({
      where: { id },
      data: { isDeleted: true },
    });
    logAudit({ householdId, userId: req.userId!, action: 'DELETE', entity: 'BUDGET', entityId: id, before: { amount: budget.amount } });

    return res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, 'budgets/DELETE');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// BudgetLimit endpoints
// ---------------------------------------------------------------------------

const budgetLimitQuerySchema = z.object({
  periodKey: z.string().optional(), // override; defaults to current period
});

// GET /api/v1/budgets/:id/limits — list all period limits for a budget
router.get('/:id/limits', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const { id } = req.params;

    const budget = await prisma.budget.findUnique({ where: { id } });
    if (!budget || budget.householdId !== householdId) {
      return res.status(404).json({ error: 'Budget not found' });
    }

    const limits = await prisma.budgetLimit.findMany({
      where: { budgetId: id },
      orderBy: { periodKey: 'desc' },
    });

    return res.json(limits.map(l => ({
      id: l.id,
      periodKey: l.periodKey,
      limitAmount: Number(l.limitAmount),
      spentAmount: Number(l.spentAmount),
      rolloverAmount: Number(l.rolloverAmount),
      effectiveLimit: Number(l.limitAmount) + Number(l.rolloverAmount),
      remaining: Number(l.limitAmount) + Number(l.rolloverAmount) - Number(l.spentAmount),
      createdAt: l.createdAt,
      updatedAt: l.updatedAt,
    })));
  } catch (err) {
    req.log.error({ err }, 'budgets/limits/GET');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/v1/budgets/:id/limits/current — get-or-create limit for current period
router.post('/:id/limits/current', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const { id } = req.params;
    const { periodKey: overridePeriodKey } = budgetLimitQuerySchema.parse(req.query);

    const budget = await prisma.budget.findUnique({ where: { id } });
    if (!budget || budget.householdId !== householdId) {
      return res.status(404).json({ error: 'Budget not found' });
    }

    const periodKey = overridePeriodKey ?? getPeriodKey(new Date(), budget.period);
    const baseLimit = budget.amountDecimal ?? budget.amount;
    const { Prisma: PrismaNamespace } = await import('@prisma/client');
    const limit = await getOrCreateBudgetLimit(id, householdId, periodKey, new PrismaNamespace.Decimal(Number(baseLimit)));

    return res.json({
      id: limit.id,
      periodKey: limit.periodKey,
      limitAmount: Number(limit.limitAmount),
      spentAmount: Number(limit.spentAmount),
      rolloverAmount: Number(limit.rolloverAmount),
      effectiveLimit: Number(limit.limitAmount) + Number(limit.rolloverAmount),
      remaining: Number(limit.limitAmount) + Number(limit.rolloverAmount) - Number(limit.spentAmount),
    });
  } catch (err) {
    req.log.error({ err }, 'budgets/limits/current/POST');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/v1/budgets/:id/limits/recalc — recompute spentAmount from transactions
router.post('/:id/limits/recalc', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const { id } = req.params;
    const { periodKey: overridePeriodKey } = budgetLimitQuerySchema.parse(req.query);

    const budget = await prisma.budget.findUnique({ where: { id } });
    if (!budget || budget.householdId !== householdId) {
      return res.status(404).json({ error: 'Budget not found' });
    }

    const periodKey = overridePeriodKey ?? getPeriodKey(new Date(), budget.period);
    const spent = await recalcSpentAmount(id, periodKey, budget.period);

    return res.json({ periodKey, spentAmount: Number(spent) });
  } catch (err) {
    req.log.error({ err }, 'budgets/limits/recalc/POST');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/v1/budgets/:id/limits/rollover — apply rollover from prev period to next
const rolloverSchema = z.object({
  prevPeriodKey: z.string(),
  nextPeriodKey: z.string(),
});

router.post('/:id/limits/rollover', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const { id } = req.params;
    const { prevPeriodKey, nextPeriodKey } = rolloverSchema.parse(req.body);

    const budget = await prisma.budget.findUnique({ where: { id } });
    if (!budget || budget.householdId !== householdId) {
      return res.status(404).json({ error: 'Budget not found' });
    }

    if (!budget.rollover) {
      return res.status(400).json({ error: 'Rollover is not enabled for this budget' });
    }

    await rolloverPreviousPeriod(id, prevPeriodKey, nextPeriodKey, budget.period);

    const nextLimit = await prisma.budgetLimit.findUnique({
      where: { budgetId_periodKey: { budgetId: id, periodKey: nextPeriodKey } },
    });

    return res.json(nextLimit ? {
      periodKey: nextLimit.periodKey,
      limitAmount: Number(nextLimit.limitAmount),
      rolloverAmount: Number(nextLimit.rolloverAmount),
      spentAmount: Number(nextLimit.spentAmount),
      effectiveLimit: Number(nextLimit.limitAmount) + Number(nextLimit.rolloverAmount),
    } : { periodKey: nextPeriodKey });
  } catch (err) {
    req.log.error({ err }, 'budgets/limits/rollover/POST');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
