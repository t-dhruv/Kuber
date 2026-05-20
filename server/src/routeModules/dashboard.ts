import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { queryJournalAmounts } from '../lib/transactionJournalService';
import { NOT_DELETED } from '../lib/softDeleteWhere';

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

    // Net worth: sum all non-excluded account balances; investment accounts use holdings value
    const accounts = await prisma.account.findMany({
      where: { householdId, isHidden: false, excludeFromNetWorth: false, ...NOT_DELETED },
      select: {
        balance: true,
        type: true,
        investmentHoldings: { select: { shares: true, currentPrice: true } },
      },
    });

    const LIABILITY_TYPES = new Set(['credit_card', 'loan']);
    let cashValue = 0, investmentValue = 0, otherAssetsValue = 0, liabilitiesTotal = 0;
    for (const a of accounts) {
      const t = a.type.toLowerCase();
      if (LIABILITY_TYPES.has(t)) { liabilitiesTotal += Math.abs(a.balance); continue; }
      let val = a.balance;
      if (t.includes('investment') && a.investmentHoldings.length > 0) {
        val = a.investmentHoldings.reduce((s, h) => s + h.shares * h.currentPrice, 0);
        investmentValue += val;
      } else if (t === 'checking' || t === 'savings') {
        cashValue += val;
      } else {
        otherAssetsValue += val;
      }
    }
    const r2 = (n: number) => Math.round(n * 100) / 100;
    cashValue = r2(cashValue); investmentValue = r2(investmentValue); otherAssetsValue = r2(otherAssetsValue);
    const netWorthCurrent = r2(cashValue + investmentValue + otherAssetsValue - liabilitiesTotal);

    // Transactions this month and last month from journal (scoped to household)
    const [thisMonthTxns, lastMonthTxns] = await Promise.all([
      queryJournalAmounts({
        householdId,
        dateFrom: thisMonth.start,
        dateTo: thisMonth.end,
      }),
      queryJournalAmounts({
        householdId,
        dateFrom: lastMonth.start,
        dateTo: lastMonth.end,
      }),
    ]);

    const incomeThisMonth = r2(thisMonthTxns.filter(t => Number(t.amountDecimal) > 0).reduce((s, t) => s + Number(t.amountDecimal), 0));
    const expensesThisMonth = r2(thisMonthTxns.filter(t => Number(t.amountDecimal) < 0).reduce((s, t) => s + Math.abs(Number(t.amountDecimal)), 0));
    const incomeLastMonth = r2(lastMonthTxns.filter(t => Number(t.amountDecimal) > 0).reduce((s, t) => s + Number(t.amountDecimal), 0));
    const expensesLastMonth = r2(lastMonthTxns.filter(t => Number(t.amountDecimal) < 0).reduce((s, t) => s + Math.abs(Number(t.amountDecimal)), 0));

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
        cashValue,
        investmentValue,
        otherAssetsValue,
        liabilities: r2(liabilitiesTotal),
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
    req.log.error({ err }, 'dashboard/summary');
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
      queryJournalAmounts({
        householdId,
        dateFrom: thisMonth.start,
        dateTo: thisMonth.end,
        amountLt: 0,
      }),
      queryJournalAmounts({
        householdId,
        dateFrom: lastMonth.start,
        dateTo: lastMonth.end,
        amountLt: 0,
      }),
    ]);

    // Group by day
    const groupByDay = (txns: any[]): Array<{ day: number; amount: number }> => {
      const map = new Map<number, number>();
      for (const t of txns) {
        const day = new Date(t.date).getDate();
        map.set(day, (map.get(day) ?? 0) + Math.abs(Number(t.amountDecimal)));
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
    req.log.error({ err }, 'dashboard/spending-chart');
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
      where: { householdId, ...NOT_DELETED },
      include: {
        category: {
          select: { id: true, name: true, icon: true },
        },
      },
    });

    if (budgets.length === 0) {
      return res.json({ totalBudget: 0, totalSpent: 0, categories: [] });
    }

    const categoryIds = budgets.map(b => b.categoryId).filter((id): id is string => !!id);

    const transactions = await queryJournalAmounts({
      householdId,
      categoryIds,
      dateFrom: thisMonth.start,
      dateTo: thisMonth.end,
      amountLt: 0,
    });

    // Sum spending per category
    const spentByCategory = new Map<string, number>();
    for (const t of transactions) {
      if (t.categoryId) {
        spentByCategory.set(t.categoryId, (spentByCategory.get(t.categoryId) ?? 0) + Math.abs(Number(t.amountDecimal)));
      }
    }

    let totalBudget = 0;
    let totalSpent = 0;

    const categories = budgets.map(b => {
      const budget = b.amount;
      const spent = (b.categoryId ? spentByCategory.get(b.categoryId) : undefined) ?? 0;
      const remaining = Math.max(0, budget - spent);
      const percent = budget > 0 ? (spent / budget) * 100 : 0;
      totalBudget += budget;
      totalSpent += spent;
      return {
        id: b.categoryId ?? null,
        name: b.category?.name ?? b.name ?? 'Uncategorized',
        icon: b.category?.icon ?? null,
        color: null,
        budget,
        spent,
        remaining,
        percent,
      };
    });

    return res.json({ totalBudget, totalSpent, categories });
  } catch (err) {
    req.log.error({ err }, 'dashboard/budget-summary');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/dashboard/recent-transactions
router.get('/recent-transactions', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;

    const journals = await prisma.transactionJournal.findMany({
      where: { householdId, isHidden: false, isDeleted: false },
      orderBy: { date: 'desc' },
      take: 5,
      include: {
        category: { select: { name: true, icon: true } },
        entries: {
          orderBy: { createdAt: 'asc' },
          include: { account: { select: { name: true } } },
        },
      },
    });

    const data = journals.map(j => {
      const mainEntry = j.entries?.[0];
      return {
        id: j.id,
        date: j.date.toISOString(),
        merchantName: j.description,
        amount: Number(j.amountDecimal),
        categoryName: j.category?.name ?? null,
        categoryIcon: j.category?.icon ?? null,
        categoryColor: null,
        accountName: mainEntry?.account?.name ?? 'Unknown',
      };
    });

    return res.json(data);
  } catch (err) {
    req.log.error({ err }, 'dashboard/recent-transactions');
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
      where: { householdId, isActive: true, ...NOT_DELETED },
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
    req.log.error({ err }, 'dashboard/recurring-summary');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/dashboard/net-worth-chart
router.get('/net-worth-chart', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const months = Number(req.query.months) || 12;
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - months + 1);
    cutoff.setDate(1);
    cutoff.setHours(0, 0, 0, 0);

    const snapshots = await prisma.netWorthSnapshot.findMany({
      where: { householdId, date: { gte: cutoff } },
      orderBy: { date: 'asc' },
      select: { date: true, netWorth: true, cashValue: true, investmentValue: true, otherAssetsValue: true, liabilities: true, assets: true },
    });

    return res.json(snapshots.map((s) => ({
      date: s.date.toISOString().slice(0, 10),
      value: s.netWorth,
      cashValue: s.cashValue,
      investmentValue: s.investmentValue,
      otherAssetsValue: s.otherAssetsValue,
      liabilities: s.liabilities,
      assets: s.assets,
    })));
  } catch (err) {
    req.log.error({ err }, 'dashboard/net-worth-chart');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/dashboard/goals-summary
router.get('/goals-summary', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const now = new Date();

    const goals = await prisma.goal.findMany({
      where: { householdId, ...NOT_DELETED },
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
        if (monthsLeft === 0) {
          status = remaining <= 0 ? 'completed' : 'at_risk';
        } else {
          const effectiveMonthly = g.monthlyContribution > 0
            ? g.monthlyContribution
            : remaining / monthsLeft;
          status = effectiveMonthly * monthsLeft >= remaining ? 'on_track' : 'at_risk';
        }
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
    req.log.error({ err }, 'dashboard/goals-summary');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/dashboard/weekly-recap
router.get('/weekly-recap', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const now = new Date();

    const last7Start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const prev7Start = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    // Format period label e.g. "Mar 15 – Mar 21"
    const fmtShort = (d: Date) =>
      d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const periodLabel = `${fmtShort(last7Start)} – ${fmtShort(now)}`;

    // Spending: last 7 days vs prev 7 days
    const [last7Txns, prev7Txns] = await Promise.all([
      queryJournalAmounts({
        householdId,
        dateFrom: last7Start,
        dateTo: now,
        amountLt: 0,
      }),
      queryJournalAmounts({
        householdId,
        dateFrom: prev7Start,
        dateTo: last7Start,
        amountLt: 0,
      }),
    ]);

    const spendingTotal = last7Txns.reduce((s, t) => s + Math.abs(Number(t.amountDecimal)), 0);
    const spendingPrev = prev7Txns.reduce((s, t) => s + Math.abs(Number(t.amountDecimal)), 0);
    const spendingChange = spendingTotal - spendingPrev;
    const spendingChangePercent = spendingPrev !== 0 ? (spendingChange / spendingPrev) * 100 : 0;

    // Net worth: diff two most recent snapshots
    const snapshots = await prisma.netWorthSnapshot.findMany({
      where: { householdId },
      orderBy: { date: 'desc' },
      take: 2,
      select: { netWorth: true },
    });

    const accounts = await prisma.account.findMany({
      where: { householdId, isHidden: false, excludeFromNetWorth: false, ...NOT_DELETED },
      select: { balance: true },
    });
    const netWorthCurrent = accounts.reduce((s, a) => s + a.balance, 0);
    const netWorthChange = snapshots.length >= 2 ? snapshots[0].netWorth - snapshots[1].netWorth : 0;
    const netWorthChangePercent =
      snapshots.length >= 2 && snapshots[1].netWorth !== 0
        ? (netWorthChange / Math.abs(snapshots[1].netWorth)) * 100
        : 0;

    // Top category by spending last 7 days
    let topCategory: { name: string; amount: number; icon: string | null } | null = null;
    if (last7Txns.length > 0) {
      const byCategory = new Map<string, { amount: number; icon: string | null }>();
      for (const t of last7Txns) {
        if (t.categoryId && t.categoryId in byCategory === false) {
          byCategory.set(t.categoryId, { amount: Math.abs(Number(t.amountDecimal)), icon: null });
        } else if (t.categoryId) {
          const entry = byCategory.get(t.categoryId)!;
          entry.amount += Math.abs(Number(t.amountDecimal));
        }
      }
      if (byCategory.size > 0) {
        const [topCatId, topCatData] = [...byCategory.entries()].sort((a, b) => b[1].amount - a[1].amount)[0];
        const cat = await prisma.category.findFirst({
          where: { id: topCatId, householdId, ...NOT_DELETED },
          select: { name: true, icon: true },
        });
        if (cat) {
          topCategory = { name: cat.name, amount: topCatData.amount, icon: cat.icon ?? null };
        }
      }
    }

    // Upcoming bills: RecurringItem nextDate between now and now+7days
    const next7End = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const upcomingItems = await prisma.recurringItem.findMany({
      where: {
        householdId,
        isActive: true,
        ...NOT_DELETED,
        nextDate: { gte: now, lte: next7End },
      },
      select: { name: true, amount: true, nextDate: true },
      orderBy: { nextDate: 'asc' },
    });

    const upcoming = upcomingItems.map(item => {
      const daysUntilDue = Math.ceil(
        (new Date(item.nextDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );
      return {
        name: item.name,
        amount: Math.abs(item.amount),
        dueDate: new Date(item.nextDate).toISOString(),
        daysUntilDue,
      };
    });

    return res.json({
      period: { start: last7Start.toISOString(), end: now.toISOString(), label: periodLabel },
      spending: {
        total: spendingTotal,
        change: spendingChange,
        changePercent: spendingChangePercent,
      },
      netWorth: {
        current: netWorthCurrent,
        change: netWorthChange,
        changePercent: netWorthChangePercent,
      },
      topCategory,
      upcoming,
    });
  } catch (err) {
    req.log.error({ err }, 'dashboard/weekly-recap');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/dashboard/health-score
router.get('/health-score', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const now = new Date();
    const thisMonth = getMonthBounds(now);

    // ── Savings rate (30 pts) ──
    const monthTxns = await queryJournalAmounts({
      householdId,
      dateFrom: thisMonth.start,
      dateTo: thisMonth.end,
    });
    const incomeThisMonth = monthTxns.filter(t => Number(t.amountDecimal) > 0).reduce((s, t) => s + Number(t.amountDecimal), 0);
    const expensesThisMonth = monthTxns.filter(t => Number(t.amountDecimal) < 0).reduce((s, t) => s + Math.abs(Number(t.amountDecimal)), 0);
    const savingsRate = incomeThisMonth > 0 ? (incomeThisMonth - expensesThisMonth) / incomeThisMonth : 0;
    const savingsScore = Math.round(Math.min(1, Math.max(0, savingsRate)) * 30);

    // ── Budget adherence (25 pts) ──
    const budgets = await prisma.budget.findMany({ where: { householdId, ...NOT_DELETED }, select: { categoryId: true, amount: true } });
    let budgetScore = 0;
    if (budgets.length > 0) {
      const catIds = budgets.map(b => b.categoryId).filter((id): id is string => !!id);
      const budgetTxns = await queryJournalAmounts({
        householdId,
        categoryIds: catIds,
        dateFrom: thisMonth.start,
        dateTo: thisMonth.end,
        amountLt: 0,
      });
      const spentMap = new Map<string, number>();
      for (const t of budgetTxns) {
        if (t.categoryId) spentMap.set(t.categoryId, (spentMap.get(t.categoryId) ?? 0) + Math.abs(Number(t.amountDecimal)));
      }
      const underBudget = budgets.filter(b => b.categoryId && (spentMap.get(b.categoryId) ?? 0) <= b.amount).length;
      budgetScore = Math.round((underBudget / budgets.length) * 25);
    }

    // ── Goal progress (25 pts) ──
    const goals = await prisma.goal.findMany({ where: { householdId, ...NOT_DELETED }, select: { targetAmount: true, currentAmount: true } });
    let goalScore = 0;
    if (goals.length > 0) {
      const avgPct = goals.reduce((s, g) => s + (g.targetAmount > 0 ? Math.min(1, g.currentAmount / g.targetAmount) : 0), 0) / goals.length;
      goalScore = Math.round(avgPct * 25);
    }

    // ── Emergency fund (20 pts) ──
    const liquidAccounts = await prisma.account.findMany({
      where: { householdId, type: { in: ['CHECKING', 'SAVINGS'] }, isHidden: false, ...NOT_DELETED },
      select: { balance: true },
    });
    const liquidBalance = liquidAccounts.reduce((s, a) => s + a.balance, 0);
    const monthlyExpenses = expensesThisMonth > 0 ? expensesThisMonth : 1;
    const emergencyRatio = liquidBalance / (monthlyExpenses * 3);
    const emergencyScore = Math.round(Math.min(1, Math.max(0, emergencyRatio)) * 20);

    const total = savingsScore + budgetScore + goalScore + emergencyScore;

    let summary: string;
    if (total >= 80) summary = 'Your finances are in great shape.';
    else if (total >= 60) summary = 'Good progress — a few areas to improve.';
    else if (total >= 40) summary = 'Some areas need attention.';
    else summary = 'Focus on budgeting and building savings.';

    return res.json({
      score: total,
      breakdown: { savingsScore, budgetScore, goalScore, emergencyScore },
      summary,
    });
  } catch (err) {
    req.log.error({ err }, 'dashboard/health-score');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
