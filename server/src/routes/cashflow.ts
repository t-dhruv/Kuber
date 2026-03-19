import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';

const router = Router();

function getYearBounds(year: number): { start: Date; end: Date } {
  return {
    start: new Date(year, 0, 1),
    end: new Date(year + 1, 0, 1),
  };
}

function getMonthBounds(year: number, month: number): { start: Date; end: Date } {
  return {
    start: new Date(year, month - 1, 1),
    end: new Date(year, month, 1),
  };
}

// GET /api/v1/cashflow
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const now = new Date();
    const year = parseInt(req.query.year as string) || now.getFullYear();

    const { start, end } = getYearBounds(year);

    const transactions = await prisma.transaction.findMany({
      where: {
        householdId,
        date: { gte: start, lt: end },
        isHidden: false,
      },
      select: { date: true, amount: true },
    });

    // Aggregate by month
    const monthMap = new Map<number, { income: number; expenses: number }>();

    for (const t of transactions) {
      const m = new Date(t.date).getMonth() + 1; // 1-based
      if (!monthMap.has(m)) {
        monthMap.set(m, { income: 0, expenses: 0 });
      }
      const entry = monthMap.get(m)!;
      if (t.amount > 0) {
        entry.income += t.amount;
      } else {
        entry.expenses += Math.abs(t.amount);
      }
    }

    const months = Array.from({ length: 12 }, (_, i) => {
      const m = i + 1;
      const entry = monthMap.get(m) ?? { income: 0, expenses: 0 };
      const net = entry.income - entry.expenses;
      const savingsRate = entry.income > 0
        ? Math.min(100, Math.max(0, (net / entry.income) * 100))
        : 0;
      return { month: m, year, income: entry.income, expenses: entry.expenses, net, savingsRate };
    });

    // YTD: only include months up to current month if current year, else all 12
    const ytdMonths = year < now.getFullYear()
      ? months
      : months.slice(0, now.getMonth() + 1);

    const ytdIncome = ytdMonths.reduce((s, m) => s + m.income, 0);
    const ytdExpenses = ytdMonths.reduce((s, m) => s + m.expenses, 0);
    const ytdNet = ytdIncome - ytdExpenses;
    const ytdSavingsRate = ytdIncome > 0
      ? Math.min(100, Math.max(0, (ytdNet / ytdIncome) * 100))
      : 0;

    const monthsWithActivity = ytdMonths.filter(m => m.income > 0 || m.expenses > 0);
    const divisor = monthsWithActivity.length || 1;
    const averageMonthlyIncome = ytdIncome / divisor;
    const averageMonthlyExpenses = ytdExpenses / divisor;

    return res.json({
      data: {
        year,
        months,
        ytdIncome,
        ytdExpenses,
        ytdNet,
        ytdSavingsRate,
        averageMonthlyIncome,
        averageMonthlyExpenses,
      },
    });
  } catch (err) {
    console.error('[cashflow/GET]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/cashflow/month
router.get('/month', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const now = new Date();
    const year = parseInt(req.query.year as string) || now.getFullYear();
    const month = parseInt(req.query.month as string) || now.getMonth() + 1;

    if (month < 1 || month > 12) {
      return res.status(400).json({ error: 'month must be between 1 and 12' });
    }

    const { start, end } = getMonthBounds(year, month);

    const transactions = await prisma.transaction.findMany({
      where: {
        householdId,
        date: { gte: start, lt: end },
        isHidden: false,
      },
      select: {
        date: true,
        amount: true,
        categoryId: true,
        category: {
          select: { id: true, name: true, emoji: true, type: true, groupId: true, group: true },
        },
      },
    });

    // Separate income vs expense
    const incomeByCategory = new Map<
      string,
      { categoryId: string; categoryName: string; categoryIcon: string | null; amount: number }
    >();
    const expenseByCategory = new Map<
      string,
      { categoryId: string; categoryName: string; categoryIcon: string | null; amount: number; groupName: string; groupId: string }
    >();

    const dailyIncome = new Map<number, number>();
    const dailyExpenses = new Map<number, number>();

    for (const t of transactions) {
      const day = new Date(t.date).getDate();

      if (t.amount > 0) {
        dailyIncome.set(day, (dailyIncome.get(day) ?? 0) + t.amount);
      } else {
        dailyExpenses.set(day, (dailyExpenses.get(day) ?? 0) + Math.abs(t.amount));
      }

      const catId = t.categoryId ?? '__uncategorized';
      const catName = t.category?.name ?? 'Uncategorized';
      const catIcon = t.category?.emoji ?? null;
      const catType = t.category?.type ?? 'EXPENSE';

      if (catType === 'INCOME' || t.amount > 0) {
        const existing = incomeByCategory.get(catId);
        if (existing) {
          existing.amount += t.amount > 0 ? t.amount : Math.abs(t.amount);
        } else {
          incomeByCategory.set(catId, {
            categoryId: catId,
            categoryName: catName,
            categoryIcon: catIcon,
            amount: t.amount > 0 ? t.amount : Math.abs(t.amount),
          });
        }
      } else {
        const groupName = t.category?.group?.name ?? 'Uncategorized';
        const groupId = t.category?.groupId ?? '__ungrouped';
        const existing = expenseByCategory.get(catId);
        if (existing) {
          existing.amount += Math.abs(t.amount);
        } else {
          expenseByCategory.set(catId, {
            categoryId: catId,
            categoryName: catName,
            categoryIcon: catIcon,
            amount: Math.abs(t.amount),
            groupName,
            groupId,
          });
        }
      }
    }

    const totalIncome = Array.from(incomeByCategory.values()).reduce((s, c) => s + c.amount, 0);
    const totalExpenses = Array.from(expenseByCategory.values()).reduce((s, c) => s + c.amount, 0);

    // Build income by category with percent
    const incomeBycat = Array.from(incomeByCategory.values())
      .map(c => ({ ...c, percent: totalIncome > 0 ? (c.amount / totalIncome) * 100 : 0 }))
      .sort((a, b) => b.amount - a.amount);

    const expenseByCat = Array.from(expenseByCategory.values())
      .map(c => ({ ...c, percent: totalExpenses > 0 ? (c.amount / totalExpenses) * 100 : 0 }))
      .sort((a, b) => b.amount - a.amount);

    // Group expenses by group
    const expenseGroupMap = new Map<
      string,
      { groupName: string; amount: number; categories: typeof expenseByCat }
    >();
    for (const cat of expenseByCat) {
      const { groupId, groupName } = cat as typeof cat & { groupId: string; groupName: string };
      const existing = expenseGroupMap.get(groupId);
      if (existing) {
        existing.amount += cat.amount;
        existing.categories.push(cat);
      } else {
        expenseGroupMap.set(groupId, {
          groupName,
          amount: cat.amount,
          categories: [cat],
        });
      }
    }

    const byGroup = Array.from(expenseGroupMap.values())
      .map(g => ({
        groupName: g.groupName,
        amount: g.amount,
        percent: totalExpenses > 0 ? (g.amount / totalExpenses) * 100 : 0,
        categories: g.categories,
      }))
      .sort((a, b) => b.amount - a.amount);

    // Top 5 expense categories
    const topExpenseCategories = expenseByCat.slice(0, 5).map(c => ({
      name: c.categoryName,
      amount: c.amount,
      percent: c.percent,
    }));

    // Daily flow: iterate all days in month
    const daysInMonth = new Date(year, month, 0).getDate();
    const dailyFlow = Array.from({ length: daysInMonth }, (_, i) => {
      const day = i + 1;
      return {
        day,
        income: dailyIncome.get(day) ?? 0,
        expenses: dailyExpenses.get(day) ?? 0,
      };
    });

    const net = totalIncome - totalExpenses;
    const savingsRate = totalIncome > 0
      ? Math.min(100, Math.max(0, (net / totalIncome) * 100))
      : 0;

    return res.json({
      data: {
        month,
        year,
        income: {
          total: totalIncome,
          byCategory: incomeBycat,
        },
        expenses: {
          total: totalExpenses,
          byCategory: expenseByCat,
          byGroup,
        },
        net,
        savingsRate,
        topExpenseCategories,
        dailyFlow,
      },
    });
  } catch (err) {
    console.error('[cashflow/month]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/cashflow/sankey
router.get('/sankey', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const { startDate: startDateStr, endDate: endDateStr } = req.query as {
      startDate?: string;
      endDate?: string;
    };

    if (!startDateStr || !endDateStr) {
      return res.status(400).json({ error: 'startDate and endDate are required (YYYY-MM-DD)' });
    }

    const startDate = new Date(startDateStr);
    const endDate = new Date(endDateStr);
    // endDate is inclusive — advance to start of next day
    endDate.setDate(endDate.getDate() + 1);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD.' });
    }

    const transactions = await prisma.transaction.findMany({
      where: {
        householdId,
        date: { gte: startDate, lt: endDate },
        isHidden: false,
      },
      select: {
        amount: true,
        categoryId: true,
        category: {
          select: {
            id: true,
            name: true,
            type: true,
            groupId: true,
            group: { select: { id: true, name: true } },
          },
        },
      },
    });

    // Aggregate income by category and expenses by category/group
    const incomeByCategory = new Map<string, { id: string; name: string; amount: number }>();
    const expenseByCategoryGroup = new Map<string, { id: string; name: string; amount: number }>();
    const expenseByCategoryFull = new Map<
      string,
      { id: string; name: string; amount: number; groupId: string }
    >();

    for (const t of transactions) {
      const catId = t.categoryId ?? '__uncategorized';
      const catName = t.category?.name ?? 'Uncategorized';
      const catType = t.category?.type ?? 'EXPENSE';

      if (catType === 'INCOME' || t.amount > 0) {
        const amt = t.amount > 0 ? t.amount : Math.abs(t.amount);
        const existing = incomeByCategory.get(catId);
        if (existing) {
          existing.amount += amt;
        } else {
          incomeByCategory.set(catId, { id: catId, name: catName, amount: amt });
        }
      } else {
        const amt = Math.abs(t.amount);
        const groupId = t.category?.groupId ?? '__ungrouped';
        const groupName = t.category?.group?.name ?? 'Uncategorized';

        // Group level
        const existingGroup = expenseByCategoryGroup.get(groupId);
        if (existingGroup) {
          existingGroup.amount += amt;
        } else {
          expenseByCategoryGroup.set(groupId, { id: groupId, name: groupName, amount: amt });
        }

        // Category level
        const existingCat = expenseByCategoryFull.get(catId);
        if (existingCat) {
          existingCat.amount += amt;
        } else {
          expenseByCategoryFull.set(catId, { id: catId, name: catName, amount: amt, groupId });
        }
      }
    }

    // Build nodes
    type SankeyNode = { id: string; name: string; type: 'income' | 'expense_group' | 'expense_category' };
    const nodes: SankeyNode[] = [];
    const links: Array<{ source: string; target: string; value: number }> = [];

    for (const inc of incomeByCategory.values()) {
      nodes.push({ id: `income_${inc.id}`, name: inc.name, type: 'income' });
    }
    for (const grp of expenseByCategoryGroup.values()) {
      nodes.push({ id: `group_${grp.id}`, name: grp.name, type: 'expense_group' });
    }
    for (const cat of expenseByCategoryFull.values()) {
      nodes.push({ id: `cat_${cat.id}`, name: cat.name, type: 'expense_category' });
    }

    // Total income and total expenses for proportional distribution
    const totalIncome = Array.from(incomeByCategory.values()).reduce((s, c) => s + c.amount, 0);
    const totalExpenses = Array.from(expenseByCategoryGroup.values()).reduce((s, g) => s + g.amount, 0);

    // Links: income categories → expense groups (proportional)
    for (const inc of incomeByCategory.values()) {
      for (const grp of expenseByCategoryGroup.values()) {
        // Proportional: income source contributes proportionally to each expense group
        const value = totalIncome > 0
          ? (inc.amount / totalIncome) * grp.amount
          : 0;
        if (value > 0) {
          links.push({
            source: `income_${inc.id}`,
            target: `group_${grp.id}`,
            value,
          });
        }
      }
    }

    // Links: expense groups → expense categories
    for (const cat of expenseByCategoryFull.values()) {
      const groupId = cat.groupId;
      if (cat.amount > 0) {
        links.push({
          source: `group_${groupId}`,
          target: `cat_${cat.id}`,
          value: cat.amount,
        });
      }
    }

    return res.json({ data: { nodes, links } });
  } catch (err) {
    console.error('[cashflow/sankey]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
