import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';

const router = Router();

function getMonthBounds(date: Date): { start: Date; end: Date } {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 1);
  return { start, end };
}

function getPrevMonthBounds(date: Date): { start: Date; end: Date } {
  const start = new Date(date.getFullYear(), date.getMonth() - 1, 1);
  const end = new Date(date.getFullYear(), date.getMonth(), 1);
  return { start, end };
}

// GET /api/v1/dashboard/summary
router.get('/summary', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const now = new Date();
    const thisMonth = getMonthBounds(now);
    const lastMonth = getPrevMonthBounds(now);

    // Net worth: sum all non-excluded account balances
    const accounts = await prisma.account.findMany({
      where: { householdId, isHidden: false, excludeFromNetWorth: false },
      select: { balance: true },
    });
    const netWorthCurrent = accounts.reduce((sum, a) => sum + a.balance, 0);

    // Transactions this month and last month scoped to household
    const [thisMonthTxns, lastMonthTxns] = await Promise.all([
      prisma.transaction.findMany({
        where: {
          householdId,
          date: { gte: thisMonth.start, lt: thisMonth.end },
          isHidden: false,
        },
        select: { amount: true },
      }),
      prisma.transaction.findMany({
        where: {
          householdId,
          date: { gte: lastMonth.start, lt: lastMonth.end },
          isHidden: false,
        },
        select: { amount: true },
      }),
    ]);

    const incomeThisMonth = thisMonthTxns.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
    const expensesThisMonth = thisMonthTxns.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
    const incomeLastMonth = lastMonthTxns.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
    const expensesLastMonth = lastMonthTxns.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);

    const netWorthChangeAmount = incomeThisMonth - expensesThisMonth;
    const netWorthChangePercent = netWorthCurrent !== 0
      ? (netWorthChangeAmount / Math.abs(netWorthCurrent - netWorthChangeAmount)) * 100
      : 0;

    const spendingChangePercent = expensesLastMonth !== 0
      ? ((expensesThisMonth - expensesLastMonth) / expensesLastMonth) * 100
      : 0;

    const savingsAmount = incomeThisMonth - expensesThisMonth;
    const savingsRate = incomeThisMonth > 0
      ? Math.min(100, Math.max(0, (savingsAmount / incomeThisMonth) * 100))
      : 0;

    return res.json({
      netWorth: {
        current: netWorthCurrent,
        changeAmount: netWorthChangeAmount,
        changePercent: netWorthChangePercent,
      },
      spending: {
        thisMonth: expensesThisMonth,
        lastMonth: expensesLastMonth,
        changePercent: spendingChangePercent,
      },
      income: {
        thisMonth: incomeThisMonth,
        lastMonth: incomeLastMonth,
      },
      savings: {
        rate: savingsRate,
        amount: savingsAmount,
      },
    });
  } catch (err) {
    console.error('[dashboard/summary]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/dashboard/spending-chart
router.get('/spending-chart', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const now = new Date();
    const thisMonth = getMonthBounds(now);
    const lastMonth = getPrevMonthBounds(now);

    const [thisMonthTxns, lastMonthTxns] = await Promise.all([
      prisma.transaction.findMany({
        where: {
          householdId,
          date: { gte: thisMonth.start, lt: thisMonth.end },
          amount: { lt: 0 },
          isHidden: false,
        },
        select: { date: true, amount: true },
      }),
      prisma.transaction.findMany({
        where: {
          householdId,
          date: { gte: lastMonth.start, lt: lastMonth.end },
          amount: { lt: 0 },
          isHidden: false,
        },
        select: { date: true, amount: true },
      }),
    ]);

    // Group by day
    const groupByDay = (txns: Array<{ date: Date; amount: number }>): Array<{ day: number; amount: number }> => {
      const map = new Map<number, number>();
      for (const t of txns) {
        const day = new Date(t.date).getDate();
        map.set(day, (map.get(day) ?? 0) + Math.abs(t.amount));
      }
      return Array.from(map.entries())
        .map(([day, amount]) => ({ day, amount }))
        .sort((a, b) => a.day - b.day);
    };

    return res.json({
      thisMonth: groupByDay(thisMonthTxns),
      lastMonth: groupByDay(lastMonthTxns),
    });
  } catch (err) {
    console.error('[dashboard/spending-chart]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/dashboard/budget-summary
router.get('/budget-summary', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const now = new Date();
    const thisMonth = getMonthBounds(now);

    const budgets = await prisma.budget.findMany({
      where: { householdId },
      include: {
        category: {
          select: { id: true, name: true, emoji: true },
        },
      },
    });

    if (budgets.length === 0) {
      return res.json({ totalBudget: 0, totalSpent: 0, categories: [] });
    }

    const categoryIds = budgets.map(b => b.categoryId);

    const transactions = await prisma.transaction.findMany({
      where: {
        householdId,
        categoryId: { in: categoryIds },
        date: { gte: thisMonth.start, lt: thisMonth.end },
        amount: { lt: 0 },
        isHidden: false,
      },
      select: { categoryId: true, amount: true },
    });

    // Sum spending per category
    const spentByCategory = new Map<string, number>();
    for (const t of transactions) {
      if (t.categoryId) {
        spentByCategory.set(t.categoryId, (spentByCategory.get(t.categoryId) ?? 0) + Math.abs(t.amount));
      }
    }

    let totalBudget = 0;
    let totalSpent = 0;

    const categories = budgets.map(b => {
      const budget = b.amount;
      const spent = spentByCategory.get(b.categoryId) ?? 0;
      const remaining = Math.max(0, budget - spent);
      const percent = budget > 0 ? (spent / budget) * 100 : 0;
      totalBudget += budget;
      totalSpent += spent;
      return {
        id: b.categoryId,
        name: b.category.name,
        icon: b.category.emoji ?? null,
        color: null,
        budget,
        spent,
        remaining,
        percent,
      };
    });

    return res.json({ totalBudget, totalSpent, categories });
  } catch (err) {
    console.error('[dashboard/budget-summary]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/dashboard/recent-transactions
router.get('/recent-transactions', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;

    const transactions = await prisma.transaction.findMany({
      where: { householdId, isHidden: false },
      orderBy: { date: 'desc' },
      take: 5,
      include: {
        category: { select: { name: true, emoji: true } },
        merchant: { select: { displayName: true } },
        account: { select: { name: true } },
      },
    });

    const data = transactions.map(t => ({
      id: t.id,
      date: t.date.toISOString(),
      merchantName: t.merchant?.displayName ?? t.description,
      amount: t.amount,
      categoryName: t.category?.name ?? null,
      categoryIcon: t.category?.emoji ?? null,
      categoryColor: null,
      accountName: t.account.name,
    }));

    return res.json(data);
  } catch (err) {
    console.error('[dashboard/recent-transactions]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/dashboard/recurring-summary
router.get('/recurring-summary', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const now = new Date();
    const thisMonth = getMonthBounds(now);

    const items = await prisma.recurringItem.findMany({
      where: { householdId, isActive: true },
      select: { id: true, name: true, amount: true, nextDate: true },
    });

    const paid: Array<{ id: string; name: string; amount: number; paidDate: string | null }> = [];
    const upcoming: Array<{ id: string; name: string; amount: number; nextDate: string; daysUntil: number }> = [];

    for (const item of items) {
      const next = new Date(item.nextDate);
      if (next < now && next >= thisMonth.start) {
        // nextDate is in the past (this month) — treat as paid
        paid.push({
          id: item.id,
          name: item.name,
          amount: Math.abs(item.amount),
          paidDate: next.toISOString(),
        });
      } else if (next >= now && next < thisMonth.end) {
        // nextDate is still upcoming this month
        const daysUntil = Math.ceil((next.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        upcoming.push({
          id: item.id,
          name: item.name,
          amount: Math.abs(item.amount),
          nextDate: next.toISOString(),
          daysUntil,
        });
      }
    }

    const totalPaid = paid.reduce((s, i) => s + i.amount, 0);
    const totalUpcoming = upcoming.reduce((s, i) => s + i.amount, 0);
    const totalMonthly = items.reduce((s, i) => s + Math.abs(i.amount), 0);

    return res.json({ paid, upcoming, totalPaid, totalUpcoming, totalMonthly });
  } catch (err) {
    console.error('[dashboard/recurring-summary]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/dashboard/net-worth-chart
router.get('/net-worth-chart', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const now = new Date();

    // Current net worth
    const accounts = await prisma.account.findMany({
      where: { householdId, isHidden: false, excludeFromNetWorth: false },
      select: { balance: true },
    });
    const netWorthCurrent = accounts.reduce((sum, a) => sum + a.balance, 0);

    // Monthly savings rate estimate from last 3 months of transactions
    const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);
    const txns = await prisma.transaction.findMany({
      where: {
        householdId,
        date: { gte: threeMonthsAgo },
        isHidden: false,
      },
      select: { amount: true },
    });

    const totalIncome = txns.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
    const totalExpenses = txns.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
    const avgMonthlySavings = (totalIncome - totalExpenses) / 3;

    // Build 12 monthly data points going back 11 months from now
    const dataPoints: Array<{ date: string; value: number }> = [];
    for (let i = 11; i >= 0; i--) {
      const pointDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
      // Estimate: current net worth minus savings accumulated since that point
      const estimatedValue = netWorthCurrent - avgMonthlySavings * i;
      dataPoints.push({
        date: pointDate.toISOString().slice(0, 10),
        value: Math.round(estimatedValue * 100) / 100,
      });
    }

    return res.json(dataPoints);
  } catch (err) {
    console.error('[dashboard/net-worth-chart]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/dashboard/goals-summary
router.get('/goals-summary', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const now = new Date();

    const goals = await prisma.goal.findMany({
      where: { householdId },
      select: {
        id: true,
        name: true,
        targetAmount: true,
        currentAmount: true,
        targetDate: true,
        monthlyContribution: true,
      },
    });

    const data = goals.map(g => {
      const percent = g.targetAmount > 0
        ? Math.min(100, (g.currentAmount / g.targetAmount) * 100)
        : 0;

      let status: 'on_track' | 'at_risk' | 'completed';

      if (percent >= 100) {
        status = 'completed';
      } else if (!g.targetDate) {
        status = 'on_track';
      } else {
        const remaining = g.targetAmount - g.currentAmount;
        const monthsLeft = Math.max(
          0,
          (g.targetDate.getFullYear() - now.getFullYear()) * 12 +
            (g.targetDate.getMonth() - now.getMonth())
        );
        const projectedContribution = g.monthlyContribution * monthsLeft;
        status = projectedContribution >= remaining ? 'on_track' : 'at_risk';
      }

      return {
        id: g.id,
        name: g.name,
        targetAmount: g.targetAmount,
        currentAmount: g.currentAmount,
        targetDate: g.targetDate ? g.targetDate.toISOString() : null,
        percent,
        status,
      };
    });

    return res.json(data);
  } catch (err) {
    console.error('[dashboard/goals-summary]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
