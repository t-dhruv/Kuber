import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { logAudit } from '../lib/audit';

const router = Router();

const VALID_BUDGET_TYPES = ['FIXED', 'FLEXIBLE', 'NON_MONTHLY'] as const;
type BudgetType = (typeof VALID_BUDGET_TYPES)[number];

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
        icon: cat.emoji ?? null,
        color: null,
      };

      if (!cat.groupId || !cat.group) {
        if (cat.type === 'INCOME') {
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
    console.error('[budgets/categories]', err);
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
      where: { householdId },
      include: {
        category: {
          include: {
            group: true,
          },
        },
      },
    });

    // Fetch all transactions for the specified month
    const transactions = await prisma.transaction.findMany({
      where: {
        householdId,
        date: { gte: start, lt: end },
        isHidden: false,
      },
      select: { categoryId: true, amount: true },
    });

    // Also get all categories (to detect unbudgeted spend)
    const allCategories = await prisma.category.findMany({
      where: { householdId },
      include: { group: true },
    });

    // Sum actuals by categoryId
    const actualByCategory = new Map<string, number>();
    for (const t of transactions) {
      if (t.categoryId) {
        actualByCategory.set(
          t.categoryId,
          (actualByCategory.get(t.categoryId) ?? 0) + t.amount,
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
      if (cat.type === 'INCOME') {
        // income: positive amounts
        actual = rawActual > 0 ? rawActual : Math.abs(rawActual);
      } else {
        // expense: stored as negative, display as positive
        actual = rawActual < 0 ? Math.abs(rawActual) : rawActual;
      }

      const remaining = budgeted - actual;
      const percent = budgeted > 0 ? (actual / budgeted) * 100 : actual > 0 ? 100 : 0;

      const row: CategoryRow = {
        id: cat.id,
        name: cat.name,
        icon: cat.emoji ?? null,
        budgeted,
        actual,
        remaining,
        percent,
        budgetType,
      };

      if (cat.type === 'INCOME') {
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

    const incomeBudgeted = incomeCategories.reduce((s, c) => s + c.budgeted, 0);
    const incomeActual = incomeCategories.reduce((s, c) => s + c.actual, 0);

    const expenseGroups = Array.from(expenseGroupMap.values());
    const expensesBudgeted = expenseGroups.reduce((s, g) => s + g.budgeted, 0);
    const expensesActual = expenseGroups.reduce((s, g) => s + g.actual, 0);

    // Build byType breakdown: flatten all budgeted expense categories
    const allBudgetedExpenseRows = expenseGroups.flatMap(g => g.categories);
    const byType = {
      fixed: allBudgetedExpenseRows.filter(r => r.budgetType === 'FIXED'),
      flexible: allBudgetedExpenseRows.filter(r => r.budgetType === 'FLEXIBLE'),
      nonMonthly: allBudgetedExpenseRows.filter(r => r.budgetType === 'NON_MONTHLY'),
    };

    const leftToBudget = incomeActual - expensesActual;
    const savingsRate = incomeActual > 0
      ? Math.min(100, Math.max(0, (leftToBudget / incomeActual) * 100))
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
    console.error('[budgets/GET]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/v1/budgets
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const { categoryId, name, amount, budgetType } = req.body as {
      categoryId?: string;
      name?: string;
      amount?: number;
      budgetType?: string;
    };

    if (!categoryId && !name) {
      return res.status(400).json({ error: 'Provide either categoryId (category budget) or name (catch-all budget)' });
    }
    if (amount === undefined || amount === null || typeof amount !== 'number' || amount < 0) {
      return res.status(400).json({ error: 'amount must be a non-negative number' });
    }
    if (budgetType !== undefined && !VALID_BUDGET_TYPES.includes(budgetType as BudgetType)) {
      return res.status(400).json({ error: `budgetType must be one of: ${VALID_BUDGET_TYPES.join(', ')}` });
    }

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
          include: { category: { select: { id: true, name: true, emoji: true, type: true } } },
        });
      } else {
        budget = await prisma.budget.create({
          data: { householdId, categoryId, amount, period: 'monthly', budgetType: resolvedBudgetType },
          include: { category: { select: { id: true, name: true, emoji: true, type: true } } },
        });
      }
    } else {
      budget = await prisma.budget.create({
        data: { householdId, name: name!, amount, period: 'monthly', budgetType: resolvedBudgetType },
        include: { category: { select: { id: true, name: true, emoji: true, type: true } } },
      });
    }

    logAudit({ householdId, userId: req.userId!, action: 'CREATE', entity: 'BUDGET', entityId: budget.id, after: { categoryId, name, amount, budgetType: resolvedBudgetType } });
    return res.json(budget);
  } catch (err) {
    console.error('[budgets/POST]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/v1/budgets/:id
router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const { id } = req.params;
    const { budgetType, amount } = req.body as { budgetType?: string; amount?: number };

    if (budgetType !== undefined && !VALID_BUDGET_TYPES.includes(budgetType as BudgetType)) {
      return res.status(400).json({ error: `budgetType must be one of: ${VALID_BUDGET_TYPES.join(', ')}` });
    }
    if (amount !== undefined && (typeof amount !== 'number' || amount < 0)) {
      return res.status(400).json({ error: 'amount must be a non-negative number' });
    }
    if (budgetType === undefined && amount === undefined) {
      return res.status(400).json({ error: 'At least one of budgetType or amount is required' });
    }

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
        category: { select: { id: true, name: true, emoji: true, type: true } },
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
    console.error('[budgets/PUT]', err);
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

    await prisma.budget.delete({ where: { id } });
    logAudit({ householdId, userId: req.userId!, action: 'DELETE', entity: 'BUDGET', entityId: id, before: { amount: budget.amount } });

    return res.json({ success: true });
  } catch (err) {
    console.error('[budgets/DELETE]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
