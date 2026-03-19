import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';

const router = Router();

function parseDateRange(startDate: unknown, endDate: unknown): { start: Date; end: Date } | null {
  if (typeof startDate !== 'string' || typeof endDate !== 'string') return null;
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;
  return { start, end };
}

// GET /api/v1/reports/spending
router.get('/spending', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const { startDate, endDate, groupBy = 'category' } = req.query;

    const range = parseDateRange(startDate, endDate);
    if (!range) {
      return res.status(400).json({ error: 'startDate and endDate are required (ISO format)' });
    }

    const validGroupBy = ['category', 'merchant', 'account', 'tag'];
    if (!validGroupBy.includes(groupBy as string)) {
      return res.status(400).json({ error: 'groupBy must be one of: category, merchant, account, tag' });
    }

    const transactions = await prisma.transaction.findMany({
      where: {
        householdId,
        date: { gte: range.start, lte: range.end },
        amount: { lt: 0 },
        isHidden: false,
      },
      include: {
        category: { select: { id: true, name: true, emoji: true } },
        merchant: { select: { id: true, displayName: true } },
        account: { select: { id: true, name: true } },
        tags: { include: { tag: { select: { id: true, name: true, color: true } } } },
      },
    });

    const total = transactions.reduce((s, t) => s + Math.abs(t.amount), 0);
    const transactionCount = transactions.length;
    const average = transactionCount > 0 ? total / transactionCount : 0;

    // Find the largest single transaction
    let largest: { merchantName: string; amount: number; date: string } | null = null;
    if (transactions.length > 0) {
      const maxTxn = transactions.reduce((prev, curr) =>
        Math.abs(curr.amount) > Math.abs(prev.amount) ? curr : prev
      );
      largest = {
        merchantName: maxTxn.merchant?.displayName ?? maxTxn.description,
        amount: Math.abs(maxTxn.amount),
        date: maxTxn.date.toISOString(),
      };
    }

    // Group transactions
    const groupMap = new Map<string, { id: string; name: string; icon: string | null; color: string | null; amount: number; count: number }>();

    for (const t of transactions) {
      let key: string;
      let id: string;
      let name: string;
      let icon: string | null = null;
      let color: string | null = null;

      if (groupBy === 'category') {
        id = t.categoryId ?? '__uncategorized__';
        name = t.category?.name ?? 'Uncategorized';
        icon = t.category?.emoji ?? null;
      } else if (groupBy === 'merchant') {
        id = t.merchantId ?? '__unknown__';
        name = t.merchant?.displayName ?? t.description;
      } else if (groupBy === 'account') {
        id = t.accountId;
        name = t.account.name;
      } else {
        // tag — a transaction can have multiple tags; attribute full amount to each
        if (t.tags.length === 0) {
          id = '__untagged__';
          name = 'Untagged';
          key = id;
          const existing = groupMap.get(key);
          if (existing) {
            existing.amount += Math.abs(t.amount);
            existing.count += 1;
          } else {
            groupMap.set(key, { id, name, icon: null, color: null, amount: Math.abs(t.amount), count: 1 });
          }
          continue;
        }
        for (const tt of t.tags) {
          const tagId = tt.tag.id;
          const tagName = tt.tag.name;
          const tagColor = tt.tag.color;
          const existing = groupMap.get(tagId);
          if (existing) {
            existing.amount += Math.abs(t.amount);
            existing.count += 1;
          } else {
            groupMap.set(tagId, { id: tagId, name: tagName, icon: null, color: tagColor, amount: Math.abs(t.amount), count: 1 });
          }
        }
        continue;
      }

      key = id;
      const existing = groupMap.get(key);
      if (existing) {
        existing.amount += Math.abs(t.amount);
        existing.count += 1;
      } else {
        groupMap.set(key, { id, name, icon, color, amount: Math.abs(t.amount), count: 1 });
      }
    }

    const items = Array.from(groupMap.values())
      .sort((a, b) => b.amount - a.amount)
      .map(g => ({
        id: g.id,
        name: g.name,
        icon: g.icon,
        color: g.color,
        amount: Math.round(g.amount * 100) / 100,
        percent: total > 0 ? Math.round((g.amount / total) * 10000) / 100 : 0,
        transactionCount: g.count,
      }));

    return res.json({
      total: Math.round(total * 100) / 100,
      startDate: range.start.toISOString(),
      endDate: range.end.toISOString(),
      groupBy,
      items,
      largest,
      average: Math.round(average * 100) / 100,
      transactionCount,
    });
  } catch (err) {
    console.error('[reports/spending]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/reports/income
router.get('/income', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const { startDate, endDate, groupBy = 'category' } = req.query;

    const range = parseDateRange(startDate, endDate);
    if (!range) {
      return res.status(400).json({ error: 'startDate and endDate are required (ISO format)' });
    }

    const validGroupBy = ['category', 'merchant', 'account', 'tag'];
    if (!validGroupBy.includes(groupBy as string)) {
      return res.status(400).json({ error: 'groupBy must be one of: category, merchant, account, tag' });
    }

    const transactions = await prisma.transaction.findMany({
      where: {
        householdId,
        date: { gte: range.start, lte: range.end },
        amount: { gt: 0 },
        isHidden: false,
      },
      include: {
        category: { select: { id: true, name: true, emoji: true } },
        merchant: { select: { id: true, displayName: true } },
        account: { select: { id: true, name: true } },
        tags: { include: { tag: { select: { id: true, name: true, color: true } } } },
      },
    });

    const total = transactions.reduce((s, t) => s + t.amount, 0);
    const transactionCount = transactions.length;
    const average = transactionCount > 0 ? total / transactionCount : 0;

    let largest: { merchantName: string; amount: number; date: string } | null = null;
    if (transactions.length > 0) {
      const maxTxn = transactions.reduce((prev, curr) => curr.amount > prev.amount ? curr : prev);
      largest = {
        merchantName: maxTxn.merchant?.displayName ?? maxTxn.description,
        amount: maxTxn.amount,
        date: maxTxn.date.toISOString(),
      };
    }

    const groupMap = new Map<string, { id: string; name: string; icon: string | null; color: string | null; amount: number; count: number }>();

    for (const t of transactions) {
      let key: string;
      let id: string;
      let name: string;
      let icon: string | null = null;
      let color: string | null = null;

      if (groupBy === 'category') {
        id = t.categoryId ?? '__uncategorized__';
        name = t.category?.name ?? 'Uncategorized';
        icon = t.category?.emoji ?? null;
      } else if (groupBy === 'merchant') {
        id = t.merchantId ?? '__unknown__';
        name = t.merchant?.displayName ?? t.description;
      } else if (groupBy === 'account') {
        id = t.accountId;
        name = t.account.name;
      } else {
        if (t.tags.length === 0) {
          id = '__untagged__';
          name = 'Untagged';
          const existing = groupMap.get(id);
          if (existing) {
            existing.amount += t.amount;
            existing.count += 1;
          } else {
            groupMap.set(id, { id, name, icon: null, color: null, amount: t.amount, count: 1 });
          }
          continue;
        }
        for (const tt of t.tags) {
          const tagId = tt.tag.id;
          const existing = groupMap.get(tagId);
          if (existing) {
            existing.amount += t.amount;
            existing.count += 1;
          } else {
            groupMap.set(tagId, { id: tagId, name: tt.tag.name, icon: null, color: tt.tag.color, amount: t.amount, count: 1 });
          }
        }
        continue;
      }

      key = id;
      const existing = groupMap.get(key);
      if (existing) {
        existing.amount += t.amount;
        existing.count += 1;
      } else {
        groupMap.set(key, { id, name, icon, color, amount: t.amount, count: 1 });
      }
    }

    const items = Array.from(groupMap.values())
      .sort((a, b) => b.amount - a.amount)
      .map(g => ({
        id: g.id,
        name: g.name,
        icon: g.icon,
        color: g.color,
        amount: Math.round(g.amount * 100) / 100,
        percent: total > 0 ? Math.round((g.amount / total) * 10000) / 100 : 0,
        transactionCount: g.count,
      }));

    return res.json({
      total: Math.round(total * 100) / 100,
      startDate: range.start.toISOString(),
      endDate: range.end.toISOString(),
      groupBy,
      items,
      largest,
      average: Math.round(average * 100) / 100,
      transactionCount,
    });
  } catch (err) {
    console.error('[reports/income]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/reports/cashflow
router.get('/cashflow', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const { startDate, endDate } = req.query;

    const range = parseDateRange(startDate, endDate);
    if (!range) {
      return res.status(400).json({ error: 'startDate and endDate are required (ISO format)' });
    }

    const transactions = await prisma.transaction.findMany({
      where: {
        householdId,
        date: { gte: range.start, lte: range.end },
        isHidden: false,
      },
      select: { amount: true, date: true },
    });

    let income = 0;
    let expenses = 0;

    // byMonth map: "YYYY-MM" -> { year, month, income, expenses }
    const monthMap = new Map<string, { year: number; month: number; income: number; expenses: number }>();

    for (const t of transactions) {
      const d = new Date(t.date);
      const year = d.getFullYear();
      const month = d.getMonth() + 1;
      const key = `${year}-${String(month).padStart(2, '0')}`;

      if (!monthMap.has(key)) {
        monthMap.set(key, { year, month, income: 0, expenses: 0 });
      }
      const entry = monthMap.get(key)!;

      if (t.amount > 0) {
        income += t.amount;
        entry.income += t.amount;
      } else {
        expenses += Math.abs(t.amount);
        entry.expenses += Math.abs(t.amount);
      }
    }

    const net = income - expenses;
    const savingsRate = income > 0 ? Math.min(100, Math.max(0, (net / income) * 100)) : 0;

    const byMonth = Array.from(monthMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, v]) => ({
        year: v.year,
        month: v.month,
        income: Math.round(v.income * 100) / 100,
        expenses: Math.round(v.expenses * 100) / 100,
        net: Math.round((v.income - v.expenses) * 100) / 100,
      }));

    return res.json({
      startDate: range.start.toISOString(),
      endDate: range.end.toISOString(),
      income: Math.round(income * 100) / 100,
      expenses: Math.round(expenses * 100) / 100,
      net: Math.round(net * 100) / 100,
      savingsRate: Math.round(savingsRate * 100) / 100,
      byMonth,
    });
  } catch (err) {
    console.error('[reports/cashflow]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/reports/trends
router.get('/trends', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const monthsParam = req.query.months;
    const categoryId = req.query.categoryId as string | undefined;

    const months = monthsParam ? parseInt(monthsParam as string, 10) : 6;
    if (isNaN(months) || months < 1 || months > 36) {
      return res.status(400).json({ error: 'months must be between 1 and 36' });
    }

    const now = new Date();
    // Go back `months` months from the start of current month
    const start = new Date(now.getFullYear(), now.getMonth() - months + 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const whereClause: Record<string, unknown> = {
      householdId,
      date: { gte: start, lt: end },
      amount: { lt: 0 },
      isHidden: false,
    };
    if (categoryId) {
      whereClause.categoryId = categoryId;
    }

    const transactions = await prisma.transaction.findMany({
      where: whereClause as any,
      select: { amount: true, date: true },
    });

    // Aggregate by year+month
    const monthMap = new Map<string, { year: number; month: number; amount: number }>();

    // Pre-populate all months in range so months with no data appear as 0
    for (let i = 0; i < months; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - months + 1 + i, 1);
      const year = d.getFullYear();
      const month = d.getMonth() + 1;
      const key = `${year}-${String(month).padStart(2, '0')}`;
      monthMap.set(key, { year, month, amount: 0 });
    }

    for (const t of transactions) {
      const d = new Date(t.date);
      const year = d.getFullYear();
      const month = d.getMonth() + 1;
      const key = `${year}-${String(month).padStart(2, '0')}`;
      const entry = monthMap.get(key);
      if (entry) {
        entry.amount += Math.abs(t.amount);
      }
    }

    const sorted = Array.from(monthMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, v]) => ({ ...v, amount: Math.round(v.amount * 100) / 100 }));

    const result = sorted.map((m, i) => {
      const prev = i > 0 ? sorted[i - 1] : null;
      const changePercent =
        prev !== null && prev.amount !== 0
          ? Math.round(((m.amount - prev.amount) / prev.amount) * 10000) / 100
          : null;
      return { year: m.year, month: m.month, amount: m.amount, changePercent };
    });

    return res.json({ months: result });
  } catch (err) {
    console.error('[reports/trends]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
