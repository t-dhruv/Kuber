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
      year,
      months,
      ytdIncome,
      ytdExpenses,
      ytdNet,
      ytdSavingsRate,
      averageMonthlyIncome,
      averageMonthlyExpenses,
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
        description: true,
        categoryId: true,
        category: {
          select: { id: true, name: true, emoji: true, type: true, groupId: true, group: true },
        },
        merchantId: true,
        merchant: {
          select: { id: true, name: true, displayName: true },
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

    // Merchant breakdown maps
    const incomeByMerchantMap = new Map<
      string,
      { merchantId: string | null; merchantName: string; amount: number; transactionCount: number }
    >();
    const expenseByMerchantMap = new Map<
      string,
      { merchantId: string | null; merchantName: string; amount: number; transactionCount: number }
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

      // Merchant key: use merchantId if present, else fall back to description
      const mKey = t.merchantId ?? `__desc_${t.description}`;
      const mName = t.merchant
        ? (t.merchant.displayName || t.merchant.name)
        : t.description;
      const mId = t.merchantId ?? null;

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

        const mExisting = incomeByMerchantMap.get(mKey);
        if (mExisting) {
          mExisting.amount += t.amount > 0 ? t.amount : Math.abs(t.amount);
          mExisting.transactionCount += 1;
        } else {
          incomeByMerchantMap.set(mKey, {
            merchantId: mId,
            merchantName: mName,
            amount: t.amount > 0 ? t.amount : Math.abs(t.amount),
            transactionCount: 1,
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

        const mExisting = expenseByMerchantMap.get(mKey);
        if (mExisting) {
          mExisting.amount += Math.abs(t.amount);
          mExisting.transactionCount += 1;
        } else {
          expenseByMerchantMap.set(mKey, {
            merchantId: mId,
            merchantName: mName,
            amount: Math.abs(t.amount),
            transactionCount: 1,
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

    // Merchant breakdowns
    const expenseByMerchant = Array.from(expenseByMerchantMap.values())
      .map(m => ({
        ...m,
        percentage: totalExpenses > 0 ? (m.amount / totalExpenses) * 100 : 0,
      }))
      .sort((a, b) => b.amount - a.amount);

    const incomeByMerchant = Array.from(incomeByMerchantMap.values())
      .map(m => ({
        ...m,
        percentage: totalIncome > 0 ? (m.amount / totalIncome) * 100 : 0,
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
      month,
      year,
      income: {
        total: totalIncome,
        byCategory: incomeBycat,
        byMerchant: incomeByMerchant,
      },
      expenses: {
        total: totalExpenses,
        byCategory: expenseByCat,
        byGroup,
        byMerchant: expenseByMerchant,
      },
      net,
      savingsRate,
      topExpenseCategories,
      dailyFlow,
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
            emoji: true,
            type: true,
            bucketType: true,
          },
        },
      },
    });

    // --- Income sources: group by category ---
    type IncomeSource = { id: string; name: string; icon: string; amount: number };
    const incomeMap = new Map<string, IncomeSource>();

    // --- Expense categories: group by category, track bucketType ---
    type ExpenseCategory = { id: string; name: string; icon: string; amount: number; bucketType: string };
    const expenseCatMap = new Map<string, ExpenseCategory>();

    for (const t of transactions) {
      const catId = t.categoryId ?? '__uncategorized';
      const catName = t.category?.name ?? 'Uncategorized';
      const catIcon = t.category?.emoji ?? '';
      const catType = t.category?.type ?? 'EXPENSE';
      const bucketType = t.category?.bucketType ?? 'uncategorized';

      if (catType === 'INCOME' || t.amount > 0) {
        const amt = Math.abs(t.amount);
        const existing = incomeMap.get(catId);
        if (existing) {
          existing.amount += amt;
        } else {
          incomeMap.set(catId, { id: catId, name: catName, icon: catIcon, amount: amt });
        }
      } else if (t.amount < 0) {
        const amt = Math.abs(t.amount);
        const existing = expenseCatMap.get(catId);
        if (existing) {
          existing.amount += amt;
        } else {
          expenseCatMap.set(catId, {
            id: catId,
            name: catName,
            icon: catIcon,
            amount: amt,
            bucketType,
          });
        }
      }
    }

    // --- Build income sources sorted descending ---
    const incomeSources: IncomeSource[] = Array.from(incomeMap.values())
      .sort((a, b) => b.amount - a.amount);

    const totalIncome = incomeSources.reduce((s, c) => s + c.amount, 0);

    // --- Group expense categories into buckets ---
    const BUCKET_ORDER: Array<'Needs' | 'Wants' | 'Savings' | 'Uncategorized'> = [
      'Needs', 'Wants', 'Savings', 'Uncategorized',
    ];

    const bucketNameMap: Record<string, 'Needs' | 'Wants' | 'Savings' | 'Uncategorized'> = {
      needs: 'Needs',
      wants: 'Wants',
      savings: 'Savings',
      uncategorized: 'Uncategorized',
    };

    type Bucket = {
      name: 'Needs' | 'Wants' | 'Savings' | 'Uncategorized';
      amount: number;
      categories: Array<{ id: string; name: string; icon: string; amount: number }>;
    };

    const bucketMap = new Map<string, Bucket>();

    for (const cat of expenseCatMap.values()) {
      const bucketLabel = bucketNameMap[cat.bucketType] ?? 'Uncategorized';
      const existing = bucketMap.get(bucketLabel);
      const catEntry = { id: cat.id, name: cat.name, icon: cat.icon, amount: cat.amount };
      if (existing) {
        existing.amount += cat.amount;
        existing.categories.push(catEntry);
      } else {
        bucketMap.set(bucketLabel, {
          name: bucketLabel,
          amount: cat.amount,
          categories: [catEntry],
        });
      }
    }

    // Sort categories within each bucket descending, then order buckets
    const buckets: Bucket[] = BUCKET_ORDER
      .filter(name => bucketMap.has(name))
      .map(name => {
        const bucket = bucketMap.get(name)!;
        bucket.categories.sort((a, b) => b.amount - a.amount);
        return bucket;
      });

    const totalSpending = buckets.reduce((s, b) => s + b.amount, 0);
    const net = totalIncome - totalSpending;

    return res.json({
      totalIncome,
      totalSpending,
      net,
      incomeSources,
      buckets,
    });
  } catch (err) {
    console.error('[cashflow/sankey]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/cashflow/forecast?days=30|60|90
router.get('/forecast', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const daysParam = parseInt(req.query.days as string) || 30;
    const days = [30, 60, 90].includes(daysParam) ? daysParam : 30;

    const now = new Date();
    // 1. Current balance: sum of all non-hidden accounts
    const balanceAgg = await prisma.account.aggregate({
      _sum: { balance: true },
      where: { householdId, isHidden: false },
    });
    const currentBalance = balanceAgg._sum.balance ?? 0;

    // 2. Historical daily averages from last 90 days
    const historyStart = new Date(now);
    historyStart.setDate(historyStart.getDate() - 90);

    const historicalTxns = await prisma.transaction.findMany({
      where: {
        householdId,
        date: { gte: historyStart, lte: now },
        isHidden: false,
      },
      select: { amount: true },
    });

    let totalIncome = 0;
    let totalExpenses = 0;
    for (const t of historicalTxns) {
      if (t.amount > 0) totalIncome += t.amount;
      else totalExpenses += Math.abs(t.amount);
    }

    const avgDailyIncome = historicalTxns.length > 0 ? totalIncome / 90 : 0;
    const avgDailyExpense = historicalTxns.length > 0 ? totalExpenses / 90 : 0;

    // 3. Known recurring items in the forecast window
    const recurringItems = await prisma.recurringItem.findMany({
      where: { householdId, isActive: true },
    });

    // Build a map of date -> adjustment
    const recurringMap = new Map<string, number>();
    const forecastEnd = new Date(now);
    forecastEnd.setDate(forecastEnd.getDate() + days);

    for (const item of recurringItems) {
      let cursor = new Date(item.nextDate);
      // Walk cursor backward if it's before today so we start from first future occurrence
      while (cursor < now) {
        cursor = advanceByFrequency(cursor, item.frequency);
      }
      // Now collect all occurrences within forecast window
      while (cursor <= forecastEnd) {
        const dateKey = cursor.toISOString().slice(0, 10);
        recurringMap.set(dateKey, (recurringMap.get(dateKey) ?? 0) + item.amount);
        cursor = advanceByFrequency(cursor, item.frequency);
      }
    }

    // 4. Project forward day by day
    const projections: Array<{ date: string; projected: number; dailyNet: number }> = [];
    let balance = currentBalance;
    let knownRecurringTotal = 0;

    for (let d = 1; d <= days; d++) {
      const date = new Date(now);
      date.setDate(date.getDate() + d);
      const dateKey = date.toISOString().slice(0, 10);

      const recurringAdj = recurringMap.get(dateKey) ?? 0;
      const dailyNet = avgDailyIncome - avgDailyExpense + recurringAdj;
      balance += dailyNet;
      knownRecurringTotal += recurringAdj;

      projections.push({
        date: dateKey,
        projected: Math.round(balance * 100) / 100,
        dailyNet: Math.round(dailyNet * 100) / 100,
      });
    }

    const projectedEndBalance = projections.length > 0
      ? projections[projections.length - 1].projected
      : currentBalance;

    return res.json({
      currentBalance: Math.round(currentBalance * 100) / 100,
      projections,
      summary: {
        days,
        projectedEndBalance: Math.round(projectedEndBalance * 100) / 100,
        avgMonthlyIncome: Math.round(avgDailyIncome * 30 * 100) / 100,
        avgMonthlyExpense: Math.round(avgDailyExpense * 30 * 100) / 100,
        knownRecurringTotal: Math.round(knownRecurringTotal * 100) / 100,
      },
    });
  } catch (err) {
    console.error('[cashflow/forecast]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

function advanceByFrequency(date: Date, frequency: string): Date {
  const next = new Date(date);
  switch (frequency.toLowerCase()) {
    case 'weekly':
      next.setDate(next.getDate() + 7);
      break;
    case 'biweekly':
      next.setDate(next.getDate() + 14);
      break;
    case 'monthly':
      next.setMonth(next.getMonth() + 1);
      break;
    case 'quarterly':
      next.setDate(next.getDate() + 90);
      break;
    case 'annually':
    case 'yearly':
      next.setFullYear(next.getFullYear() + 1);
      break;
    default:
      next.setMonth(next.getMonth() + 1);
  }
  return next;
}

export default router;
