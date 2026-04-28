import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { toCSV, setCsvHeaders } from '../lib/csvExport';

const router = Router();

function parseDateRange(startDate: unknown, endDate: unknown): { start: Date; end: Date } | null {
  if (typeof startDate !== 'string' || typeof endDate !== 'string') return null;
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;
  return { start, end };
}

// ─── Helper: group transactions by groupBy key (spending or income) ───────────

type GroupMode = 'spending' | 'income';

async function fetchGroupedTransactions(
  householdId: string,
  start: Date,
  end: Date,
  groupBy: string,
  mode: GroupMode,
) {
  const amountWhere = mode === 'spending' ? { lt: 0 } : { gt: 0 };

  const rawTransactions = await prisma.transaction.findMany({
    where: {
      householdId,
      date: { gte: start, lte: end },
      amount: amountWhere,
      isHidden: false,
        isTransfer: false,
      ...(mode === 'income' ? { isRefund: false } : {}),
    },
    include: {
      category: { select: { id: true, name: true, emoji: true, type: true } },
      merchant: { select: { id: true, displayName: true } },
      account: { select: { id: true, name: true } },
      tags: { include: { tag: { select: { id: true, name: true, color: true } } } },
    },
  });

  const transactions = mode === 'income'
    ? rawTransactions.filter(t => !t.categoryId || (t.category?.type ?? 'income') === 'income')
    : rawTransactions;

  const groupMap = new Map<string, { id: string; name: string; icon: string | null; amount: number }>();

  function addToGroup(id: string, name: string, icon: string | null, amount: number) {
    const abs = Math.abs(amount);
    const existing = groupMap.get(id);
    if (existing) {
      existing.amount += abs;
    } else {
      groupMap.set(id, { id, name, icon, amount: abs });
    }
  }

  for (const t of transactions) {
    if (groupBy === 'category') {
      addToGroup(t.categoryId ?? '__uncategorized__', t.category?.name ?? 'Uncategorized', t.category?.emoji ?? null, t.amount);
    } else if (groupBy === 'merchant') {
      addToGroup(t.merchantId ?? '__unknown__', t.merchant?.displayName ?? t.description, null, t.amount);
    } else if (groupBy === 'account') {
      addToGroup(t.accountId, t.account.name, null, t.amount);
    } else {
      // tag
      if (t.tags.length === 0) {
        addToGroup('__untagged__', 'Untagged', null, t.amount);
      } else {
        for (const tt of t.tags) {
          addToGroup(tt.tag.id, tt.tag.name, null, t.amount);
        }
      }
    }
  }

  return groupMap;
}

// GET /api/v1/reports/spending/compare
router.get('/spending/compare', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const { startDate, endDate, groupBy = 'category' } = req.query;

    const range = parseDateRange(startDate, endDate);
    if (!range) return res.status(400).json({ error: 'startDate and endDate are required (ISO format)' });

    const validGroupBy = ['category', 'merchant', 'account', 'tag'];
    if (!validGroupBy.includes(groupBy as string)) {
      return res.status(400).json({ error: 'groupBy must be one of: category, merchant, account, tag' });
    }

    // Compute prior period of same duration
    const durationMs = range.end.getTime() - range.start.getTime() + 86400000; // +1 day
    const priorEnd = new Date(range.start.getTime() - 86400000);
    const priorStart = new Date(priorEnd.getTime() - durationMs + 86400000);

    const [currentMap, priorMap] = await Promise.all([
      fetchGroupedTransactions(householdId, range.start, range.end, groupBy as string, 'spending'),
      fetchGroupedTransactions(householdId, priorStart, priorEnd, groupBy as string, 'spending'),
    ]);

    // Merge keys from both periods
    const allKeys = new Set([...currentMap.keys(), ...priorMap.keys()]);
    const items = Array.from(allKeys).map((key) => {
      const cur = currentMap.get(key);
      const pri = priorMap.get(key);
      const id = cur?.id ?? pri?.id ?? key;
      const name = cur?.name ?? pri?.name ?? key;
      const icon = cur?.icon ?? pri?.icon ?? null;
      const current = Math.round((cur?.amount ?? 0) * 100) / 100;
      const prior = Math.round((pri?.amount ?? 0) * 100) / 100;
      const delta = Math.round((current - prior) * 100) / 100;
      const deltaPercent = prior !== 0 ? Math.round((delta / prior) * 10000) / 100 : 0;
      return { id, name, icon, current, prior, delta, deltaPercent };
    }).sort((a, b) => b.current - a.current);

    const currentTotal = Math.round(Array.from(currentMap.values()).reduce((s, v) => s + v.amount, 0) * 100) / 100;
    const priorTotal = Math.round(Array.from(priorMap.values()).reduce((s, v) => s + v.amount, 0) * 100) / 100;
    const totalDelta = Math.round((currentTotal - priorTotal) * 100) / 100;

    return res.json({ items, currentTotal, priorTotal, totalDelta });
  } catch (err) {
    req.log.error({ err }, 'reports/spending/compare');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/reports/income/compare
router.get('/income/compare', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const { startDate, endDate, groupBy = 'category' } = req.query;

    const range = parseDateRange(startDate, endDate);
    if (!range) return res.status(400).json({ error: 'startDate and endDate are required (ISO format)' });

    const validGroupBy = ['category', 'merchant', 'account', 'tag'];
    if (!validGroupBy.includes(groupBy as string)) {
      return res.status(400).json({ error: 'groupBy must be one of: category, merchant, account, tag' });
    }

    const durationMs = range.end.getTime() - range.start.getTime() + 86400000;
    const priorEnd = new Date(range.start.getTime() - 86400000);
    const priorStart = new Date(priorEnd.getTime() - durationMs + 86400000);

    const [currentMap, priorMap] = await Promise.all([
      fetchGroupedTransactions(householdId, range.start, range.end, groupBy as string, 'income'),
      fetchGroupedTransactions(householdId, priorStart, priorEnd, groupBy as string, 'income'),
    ]);

    const allKeys = new Set([...currentMap.keys(), ...priorMap.keys()]);
    const items = Array.from(allKeys).map((key) => {
      const cur = currentMap.get(key);
      const pri = priorMap.get(key);
      const id = cur?.id ?? pri?.id ?? key;
      const name = cur?.name ?? pri?.name ?? key;
      const icon = cur?.icon ?? pri?.icon ?? null;
      const current = Math.round((cur?.amount ?? 0) * 100) / 100;
      const prior = Math.round((pri?.amount ?? 0) * 100) / 100;
      const delta = Math.round((current - prior) * 100) / 100;
      const deltaPercent = prior !== 0 ? Math.round((delta / prior) * 10000) / 100 : 0;
      return { id, name, icon, current, prior, delta, deltaPercent };
    }).sort((a, b) => b.current - a.current);

    const currentTotal = Math.round(Array.from(currentMap.values()).reduce((s, v) => s + v.amount, 0) * 100) / 100;
    const priorTotal = Math.round(Array.from(priorMap.values()).reduce((s, v) => s + v.amount, 0) * 100) / 100;
    const totalDelta = Math.round((currentTotal - priorTotal) * 100) / 100;

    return res.json({ items, currentTotal, priorTotal, totalDelta });
  } catch (err) {
    req.log.error({ err }, 'reports/income/compare');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/reports/spending/monthly
router.get('/spending/monthly', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const { startDate, endDate, groupBy = 'category' } = req.query;

    const range = parseDateRange(startDate, endDate);
    if (!range) return res.status(400).json({ error: 'startDate and endDate are required (ISO format)' });

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
        isTransfer: false,
      },
      include: {
        category: { select: { id: true, name: true, emoji: true } },
        merchant: { select: { id: true, displayName: true } },
        account: { select: { id: true, name: true } },
        tags: { include: { tag: { select: { id: true, name: true } } } },
      },
    });

    // Build sorted month list in range
    const monthSet = new Set<string>();
    const cur = new Date(range.start.getFullYear(), range.start.getMonth(), 1);
    while (cur <= range.end) {
      monthSet.add(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`);
      cur.setMonth(cur.getMonth() + 1);
    }
    const sortedMonths = Array.from(monthSet).sort();

    const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const months = sortedMonths.map((m) => {
      const [y, mo] = m.split('-');
      return `${MONTH_ABBR[parseInt(mo) - 1]} ${y}`;
    });

    // seriesMap: groupId -> { meta, monthKey -> amount }
    type SeriesEntry = { id: string; name: string; icon: string | null; byMonth: Map<string, number> };
    const seriesMap = new Map<string, SeriesEntry>();

    function addToSeries(id: string, name: string, icon: string | null, monthKey: string, absAmount: number) {
      if (!seriesMap.has(id)) {
        seriesMap.set(id, { id, name, icon, byMonth: new Map() });
      }
      const entry = seriesMap.get(id)!;
      entry.byMonth.set(monthKey, (entry.byMonth.get(monthKey) ?? 0) + absAmount);
    }

    for (const t of transactions) {
      const d = new Date(t.date);
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const abs = Math.abs(t.amount);

      if ((groupBy as string) === 'category') {
        addToSeries(t.categoryId ?? '__uncategorized__', t.category?.name ?? 'Uncategorized', t.category?.emoji ?? null, monthKey, abs);
      } else if ((groupBy as string) === 'merchant') {
        addToSeries(t.merchantId ?? '__unknown__', t.merchant?.displayName ?? t.description, null, monthKey, abs);
      } else if ((groupBy as string) === 'account') {
        addToSeries(t.accountId, t.account.name, null, monthKey, abs);
      } else {
        if (t.tags.length === 0) {
          addToSeries('__untagged__', 'Untagged', null, monthKey, abs);
        } else {
          for (const tt of t.tags) {
            addToSeries(tt.tag.id, tt.tag.name, null, monthKey, abs);
          }
        }
      }
    }

    const series = Array.from(seriesMap.values()).map((s) => ({
      id: s.id,
      name: s.name,
      icon: s.icon,
      data: sortedMonths.map((mk) => Math.round((s.byMonth.get(mk) ?? 0) * 100) / 100),
    }));

    return res.json({ months, series });
  } catch (err) {
    req.log.error({ err }, 'reports/spending/monthly');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/reports/income/monthly
router.get('/income/monthly', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const { startDate, endDate, groupBy = 'category' } = req.query;

    const range = parseDateRange(startDate, endDate);
    if (!range) return res.status(400).json({ error: 'startDate and endDate are required (ISO format)' });

    const validGroupBy = ['category', 'merchant', 'account', 'tag'];
    if (!validGroupBy.includes(groupBy as string)) {
      return res.status(400).json({ error: 'groupBy must be one of: category, merchant, account, tag' });
    }

    const rawTransactions = await prisma.transaction.findMany({
      where: {
        householdId,
        date: { gte: range.start, lte: range.end },
        amount: { gt: 0 },
        isHidden: false,
        isTransfer: false,
        isRefund: false,
      },
      include: {
        category: { select: { id: true, name: true, emoji: true, type: true } },
        merchant: { select: { id: true, displayName: true } },
        account: { select: { id: true, name: true } },
        tags: { include: { tag: { select: { id: true, name: true } } } },
      },
    });

    const transactions = rawTransactions.filter(t => !t.categoryId || (t.category?.type ?? 'income') === 'income');

    const monthSet = new Set<string>();
    const cur = new Date(range.start.getFullYear(), range.start.getMonth(), 1);
    while (cur <= range.end) {
      monthSet.add(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`);
      cur.setMonth(cur.getMonth() + 1);
    }
    const sortedMonths = Array.from(monthSet).sort();

    const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const months = sortedMonths.map((m) => {
      const [y, mo] = m.split('-');
      return `${MONTH_ABBR[parseInt(mo) - 1]} ${y}`;
    });

    type SeriesEntry = { id: string; name: string; icon: string | null; byMonth: Map<string, number> };
    const seriesMap = new Map<string, SeriesEntry>();

    function addToSeries(id: string, name: string, icon: string | null, monthKey: string, amount: number) {
      if (!seriesMap.has(id)) {
        seriesMap.set(id, { id, name, icon, byMonth: new Map() });
      }
      const entry = seriesMap.get(id)!;
      entry.byMonth.set(monthKey, (entry.byMonth.get(monthKey) ?? 0) + amount);
    }

    for (const t of transactions) {
      const d = new Date(t.date);
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

      if ((groupBy as string) === 'category') {
        addToSeries(t.categoryId ?? '__uncategorized__', t.category?.name ?? 'Uncategorized', t.category?.emoji ?? null, monthKey, t.amount);
      } else if ((groupBy as string) === 'merchant') {
        addToSeries(t.merchantId ?? '__unknown__', t.merchant?.displayName ?? t.description, null, monthKey, t.amount);
      } else if ((groupBy as string) === 'account') {
        addToSeries(t.accountId, t.account.name, null, monthKey, t.amount);
      } else {
        if (t.tags.length === 0) {
          addToSeries('__untagged__', 'Untagged', null, monthKey, t.amount);
        } else {
          for (const tt of t.tags) {
            addToSeries(tt.tag.id, tt.tag.name, null, monthKey, t.amount);
          }
        }
      }
    }

    const series = Array.from(seriesMap.values()).map((s) => ({
      id: s.id,
      name: s.name,
      icon: s.icon,
      data: sortedMonths.map((mk) => Math.round((s.byMonth.get(mk) ?? 0) * 100) / 100),
    }));

    return res.json({ months, series });
  } catch (err) {
    req.log.error({ err }, 'reports/income/monthly');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/reports/spending
router.get('/spending', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const { startDate, endDate, groupBy = 'category', categoryIds, accountIds, tagIds, minAmount, maxAmount } = req.query;

    const range = parseDateRange(startDate, endDate);
    if (!range) {
      return res.status(400).json({ error: 'startDate and endDate are required (ISO format)' });
    }

    const validGroupBy = ['category', 'merchant', 'account', 'tag'];
    if (!validGroupBy.includes(groupBy as string)) {
      return res.status(400).json({ error: 'groupBy must be one of: category, merchant, account, tag' });
    }

    // Build spending amount filter (amounts are negative; abs(amount) between min and max)
    let amountWhere: Record<string, number> = { lt: 0 };
    if (minAmount) amountWhere = { ...amountWhere, lte: -(parseFloat(minAmount as string)) };
    if (maxAmount) amountWhere = { ...amountWhere, gte: -(parseFloat(maxAmount as string)) };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: Record<string, any> = {
      householdId,
      date: { gte: range.start, lte: range.end },
      amount: amountWhere,
      isHidden: false,
        isTransfer: false,
    };
    if (categoryIds) where.categoryId = { in: (categoryIds as string).split(',') };
    if (accountIds) where.accountId = { in: (accountIds as string).split(',') };
    if (tagIds) where.tags = { some: { tag: { id: { in: (tagIds as string).split(',') } } } };

    const transactions = await prisma.transaction.findMany({
      where,
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
      const color: string | null = null;

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

    // First / last transaction dates for spending
    const spendingDates = transactions.map(t => t.date.getTime()).sort((a, b) => a - b);
    const firstDate = spendingDates.length > 0 ? new Date(spendingDates[0]).toISOString() : null;
    const lastDate = spendingDates.length > 0 ? new Date(spendingDates[spendingDates.length - 1]).toISOString() : null;

    return res.json({
      total: Math.round(total * 100) / 100,
      startDate: range.start.toISOString(),
      endDate: range.end.toISOString(),
      groupBy,
      items,
      largest,
      average: Math.round(average * 100) / 100,
      transactionCount,
      firstDate,
      lastDate,
    });
  } catch (err) {
    req.log.error({ err }, 'reports/spending');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/reports/income
router.get('/income', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const { startDate, endDate, groupBy = 'category', categoryIds, accountIds, tagIds, minAmount, maxAmount } = req.query;

    const range = parseDateRange(startDate, endDate);
    if (!range) {
      return res.status(400).json({ error: 'startDate and endDate are required (ISO format)' });
    }

    const validGroupBy = ['category', 'merchant', 'account', 'tag'];
    if (!validGroupBy.includes(groupBy as string)) {
      return res.status(400).json({ error: 'groupBy must be one of: category, merchant, account, tag' });
    }

    // Build income amount filter (amounts are positive)
    let amountWhere: Record<string, number> = { gt: 0 };
    if (minAmount) amountWhere = { ...amountWhere, gte: parseFloat(minAmount as string) };
    if (maxAmount) amountWhere = { ...amountWhere, lte: parseFloat(maxAmount as string) };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: Record<string, any> = {
      householdId,
      date: { gte: range.start, lte: range.end },
      amount: amountWhere,
      isHidden: false,
        isTransfer: false,
    };
    if (categoryIds) where.categoryId = { in: (categoryIds as string).split(',') };
    if (accountIds) where.accountId = { in: (accountIds as string).split(',') };
    if (tagIds) where.tags = { some: { tag: { id: { in: (tagIds as string).split(',') } } } };
    where.isRefund = false;

    const rawTransactions = await prisma.transaction.findMany({
      where,
      include: {
        category: { select: { id: true, name: true, emoji: true, type: true } },
        merchant: { select: { id: true, displayName: true } },
        account: { select: { id: true, name: true } },
        tags: { include: { tag: { select: { id: true, name: true, color: true } } } },
      },
    });

    const transactions = rawTransactions.filter(t => !t.categoryId || (t.category?.type ?? 'income') === 'income');

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
      let id: string;
      let name: string;
      let icon: string | null = null;
      const color: string | null = null;

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

      const key = id;
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

    // First / last transaction dates for income
    const incomeDates = transactions.map(t => t.date.getTime()).sort((a, b) => a - b);
    const firstDate = incomeDates.length > 0 ? new Date(incomeDates[0]).toISOString() : null;
    const lastDate = incomeDates.length > 0 ? new Date(incomeDates[incomeDates.length - 1]).toISOString() : null;

    return res.json({
      total: Math.round(total * 100) / 100,
      startDate: range.start.toISOString(),
      endDate: range.end.toISOString(),
      groupBy,
      items,
      largest,
      average: Math.round(average * 100) / 100,
      transactionCount,
      firstDate,
      lastDate,
    });
  } catch (err) {
    req.log.error({ err }, 'reports/income');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/reports/cashflow
router.get('/cashflow', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const { startDate, endDate, categoryIds, accountIds, tagIds, minAmount, maxAmount } = req.query;

    const range = parseDateRange(startDate, endDate);
    if (!range) {
      return res.status(400).json({ error: 'startDate and endDate are required (ISO format)' });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: Record<string, any> = {
      householdId,
      date: { gte: range.start, lte: range.end },
      isHidden: false,
        isTransfer: false,
    };
    if (categoryIds) where.categoryId = { in: (categoryIds as string).split(',') };
    if (accountIds) where.accountId = { in: (accountIds as string).split(',') };
    if (tagIds) where.tags = { some: { tag: { id: { in: (tagIds as string).split(',') } } } };
    // For cashflow, amount filter applies to abs(amount); approximate with OR
    if (minAmount || maxAmount) {
      const min = minAmount ? parseFloat(minAmount as string) : 0;
      const max = maxAmount ? parseFloat(maxAmount as string) : Number.MAX_SAFE_INTEGER;
      where.OR = [
        { amount: { gte: min, lte: max } },     // income side
        { amount: { gte: -max, lte: -min } },    // spending side (negative)
      ];
    }

    const transactions = await prisma.transaction.findMany({
      where,
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

    const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    const byMonth = Array.from(monthMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, v]) => ({
        year: v.year,
        month: v.month,
        income: Math.round(v.income * 100) / 100,
        expenses: Math.round(v.expenses * 100) / 100,
        net: Math.round((v.income - v.expenses) * 100) / 100,
      }));

    // monthly: human-readable label used by grouped bar chart
    const monthly = byMonth.map(m => ({
      month: `${MONTH_ABBR[m.month - 1]} ${m.year}`,
      income: m.income,
      expenses: m.expenses,
      net: m.net,
    }));

    return res.json({
      startDate: range.start.toISOString(),
      endDate: range.end.toISOString(),
      income: Math.round(income * 100) / 100,
      expenses: Math.round(expenses * 100) / 100,
      net: Math.round(net * 100) / 100,
      savingsRate: Math.round(savingsRate * 100) / 100,
      byMonth,
      monthly,
    });
  } catch (err) {
    req.log.error({ err }, 'reports/cashflow');
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
        isTransfer: false,
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
    req.log.error({ err }, 'reports/trends');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/v1/reports/export/csv
// Query params: type (spending|income|cashflow), startDate, endDate
// ---------------------------------------------------------------------------
router.get('/export/csv', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const { type, startDate, endDate } = req.query as Record<string, string | undefined>;

    const validTypes = ['spending', 'income', 'cashflow'];
    if (!type || !validTypes.includes(type)) {
      return res.status(400).json({ error: 'type must be one of: spending, income, cashflow' });
    }

    const range = parseDateRange(startDate, endDate);
    if (!range) {
      return res.status(400).json({ error: 'startDate and endDate are required (ISO format)' });
    }

    const filename = `report-${type}-${new Date().toISOString().slice(0, 10)}.csv`;
    setCsvHeaders(res, filename);

    if (type === 'cashflow') {
      const transactions = await prisma.transaction.findMany({
        where: {
          householdId,
          date: { gte: range.start, lte: range.end },
          isHidden: false,
        isTransfer: false,
        },
        select: { amount: true, date: true },
      });

      const monthMap = new Map<string, { month: string; income: number; expenses: number }>();

      for (const t of transactions) {
        const d = new Date(t.date);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        if (!monthMap.has(key)) monthMap.set(key, { month: key, income: 0, expenses: 0 });
        const entry = monthMap.get(key)!;
        if (t.amount > 0) entry.income += t.amount;
        else entry.expenses += Math.abs(t.amount);
      }

      const rows = Array.from(monthMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([, v]) => ({
          month: v.month,
          income: Math.round(v.income * 100) / 100,
          expenses: Math.round(v.expenses * 100) / 100,
          net: Math.round((v.income - v.expenses) * 100) / 100,
        }));

      const columns = [
        { key: 'month',    header: 'Month' },
        { key: 'income',   header: 'Income' },
        { key: 'expenses', header: 'Expenses' },
        { key: 'net',      header: 'Net' },
      ];

      return res.send(toCSV(rows, columns));
    }

    // spending or income
    const amountFilter = type === 'spending' ? { lt: 0 } : { gt: 0 };

    const transactions = await prisma.transaction.findMany({
      where: {
        householdId,
        date: { gte: range.start, lte: range.end },
        amount: amountFilter,
        isHidden: false,
        isTransfer: false,
      },
      include: {
        category: { select: { name: true } },
      },
    });

    const totalAbs = transactions.reduce((s, t) => s + Math.abs(t.amount), 0);
    const groupMap = new Map<string, { category: string; amount: number }>();

    for (const t of transactions) {
      const name = t.category?.name ?? 'Uncategorized';
      const existing = groupMap.get(name);
      if (existing) {
        existing.amount += Math.abs(t.amount);
      } else {
        groupMap.set(name, { category: name, amount: Math.abs(t.amount) });
      }
    }

    const rows = Array.from(groupMap.values())
      .sort((a, b) => b.amount - a.amount)
      .map(g => ({
        category: g.category,
        amount: Math.round(g.amount * 100) / 100,
        percentage: totalAbs > 0 ? Math.round((g.amount / totalAbs) * 10000) / 100 : 0,
      }));

    const columns = [
      { key: 'category',   header: 'Category' },
      { key: 'amount',     header: 'Amount' },
      { key: 'percentage', header: 'Percentage' },
    ];

    return res.send(toCSV(rows, columns));
  } catch (err) {
    req.log.error({ err }, 'reports/export/csv');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Saved Reports ────────────────────────────────────────────────────────────

const SavedReportSchema = z.object({
  name: z.string().min(1, 'name is required').max(100),
  filters: z.object({
    tab: z.enum(['cashflow', 'spending', 'income']).optional(),
    datePreset: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
  }),
});

// GET /api/v1/reports/saved
router.get('/saved', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const saved = await prisma.savedReport.findMany({
      where: { householdId },
      orderBy: { createdAt: 'desc' },
    });
    return res.json(saved);
  } catch (err) {
    req.log.error({ err }, 'reports/saved GET');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/v1/reports/saved
router.post('/saved', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const parsed = SavedReportSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0]?.message ?? 'Invalid input' });
    }
    const { name, filters } = parsed.data;
    const saved = await prisma.savedReport.create({
      data: { householdId, name, filters },
    });
    return res.status(201).json(saved);
  } catch (err) {
    req.log.error({ err }, 'reports/saved POST');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/v1/reports/saved/:id
router.delete('/saved/:id', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const { id } = req.params;
    const existing = await prisma.savedReport.findFirst({ where: { id, householdId } });
    if (!existing) return res.status(404).json({ error: 'Saved report not found' });
    await prisma.savedReport.delete({ where: { id } });
    return res.json({ message: 'Deleted' });
  } catch (err) {
    req.log.error({ err }, 'reports/saved DELETE');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/reports/tax-summary?year=2025
router.get('/tax-summary', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const yearParam = req.query.year;
    const year = yearParam ? parseInt(yearParam as string, 10) : new Date().getFullYear();

    if (isNaN(year) || year < 2000 || year > 2100) {
      return res.status(400).json({ error: 'year must be a valid 4-digit year' });
    }

    const start = new Date(year, 0, 1);
    const end = new Date(year, 11, 31, 23, 59, 59);

    const transactions = await prisma.transaction.findMany({
      where: {
        householdId,
        isHidden: false,
        isTransfer: false,
        date: { gte: start, lte: end },
        category: { isTaxDeductible: true },
      },
      include: {
        category: { select: { id: true, name: true, emoji: true } },
      },
    });

    // Group by category
    const categoryMap = new Map<string, { id: string; name: string; icon: string | null; amount: number; transactionCount: number }>();
    for (const t of transactions) {
      if (!t.category) continue;
      const key = t.category.id;
      const existing = categoryMap.get(key);
      if (existing) {
        existing.amount += Math.abs(t.amount);
        existing.transactionCount += 1;
      } else {
        categoryMap.set(key, {
          id: t.category.id,
          name: t.category.name,
          icon: t.category.emoji ?? null,
          amount: Math.abs(t.amount),
          transactionCount: 1,
        });
      }
    }

    const categories = Array.from(categoryMap.values()).sort((a, b) => b.amount - a.amount);
    const totalDeductible = categories.reduce((sum, c) => sum + c.amount, 0);

    return res.json({ year, totalDeductible, categories });
  } catch (err) {
    req.log.error({ err }, 'reports/tax-summary GET');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/reports/budget-variance?from=&to=
router.get('/budget-variance', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const { from, to } = req.query;

    const range = parseDateRange(from, to);
    if (!range) return res.status(400).json({ error: 'from and to query params are required (ISO format)' });

    // Fetch all budgets for household with their category
    const budgets = await prisma.budget.findMany({
      where: { householdId },
      include: { category: { select: { id: true, name: true, emoji: true } } },
    });

    // Fetch spending transactions in the date range grouped by category
    const transactions = await prisma.transaction.findMany({
      where: {
        householdId,
        date: { gte: range.start, lte: range.end },
        amount: { lt: 0 },
        isHidden: false,
        isTransfer: false,
        isSplit: false,
      },
      select: { categoryId: true, amount: true, category: { select: { id: true, name: true, emoji: true } } },
    });

    // Build spending map: categoryId -> { name, emoji, actual }
    const spendingMap = new Map<string, { name: string; emoji: string | null; actual: number }>();
    for (const t of transactions) {
      const key = t.categoryId ?? '__uncategorized__';
      const name = t.category?.name ?? 'Uncategorized';
      const emoji = t.category?.emoji ?? null;
      const existing = spendingMap.get(key);
      if (existing) {
        existing.actual += Math.abs(t.amount);
      } else {
        spendingMap.set(key, { name, emoji, actual: Math.abs(t.amount) });
      }
    }

    // Build budget map: categoryId -> budgeted amount
    const budgetMap = new Map<string, { name: string; emoji: string | null; budgeted: number }>();
    for (const b of budgets) {
      if (b.categoryId) {
        budgetMap.set(b.categoryId, {
          name: b.category?.name ?? 'Uncategorized',
          emoji: b.category?.emoji ?? null,
          budgeted: b.amount,
        });
      }
    }

    // Merge: all budgeted categories + categories with spending but no budget
    const allCategoryIds = new Set([...budgetMap.keys(), ...spendingMap.keys()]);
    const categories = Array.from(allCategoryIds).map((catId) => {
      const budget = budgetMap.get(catId);
      const spending = spendingMap.get(catId);
      const name = budget?.name ?? spending?.name ?? 'Uncategorized';
      const emoji = budget?.emoji ?? spending?.emoji ?? null;
      const budgeted = Math.round((budget?.budgeted ?? 0) * 100) / 100;
      const actual = Math.round((spending?.actual ?? 0) * 100) / 100;
      const variance = Math.round((budgeted - actual) * 100) / 100;
      const variancePct = budgeted !== 0 ? Math.round((variance / budgeted) * 10000) / 100 : 0;
      return { categoryId: catId, name, emoji, budgeted, actual, variance, variancePct };
    }).sort((a, b) => Math.abs(b.actual) - Math.abs(a.actual));

    const totals = {
      budgeted: Math.round(categories.reduce((s, c) => s + c.budgeted, 0) * 100) / 100,
      actual: Math.round(categories.reduce((s, c) => s + c.actual, 0) * 100) / 100,
      variance: Math.round(categories.reduce((s, c) => s + c.variance, 0) * 100) / 100,
    };

    return res.json({ categories, totals });
  } catch (err) {
    req.log.error({ err }, 'reports/budget-variance');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/v1/reports/benchmarks
// Returns BLS Consumer Expenditure Survey averages vs. household actuals.
// Query params: startDate, endDate (ISO dates, default = last 12 months)
// ---------------------------------------------------------------------------

// BLS Consumer Expenditure Survey 2023 annual averages (USD/month per household)
const BLS_BENCHMARKS: Record<string, { label: string; monthlyAvg: number; pctOfIncome: number }> = {
  housing:       { label: 'Housing',          monthlyAvg: 2025, pctOfIncome: 33.0 },
  transportation:{ label: 'Transportation',   monthlyAvg:  985, pctOfIncome: 16.1 },
  food:          { label: 'Food',             monthlyAvg:  770, pctOfIncome: 12.6 },
  healthcare:    { label: 'Healthcare',       monthlyAvg:  470, pctOfIncome:  7.7 },
  entertainment: { label: 'Entertainment',    monthlyAvg:  270, pctOfIncome:  4.4 },
  personal:      { label: 'Personal Care',    monthlyAvg:   75, pctOfIncome:  1.2 },
  education:     { label: 'Education',        monthlyAvg:  115, pctOfIncome:  1.9 },
  clothing:      { label: 'Clothing',         monthlyAvg:  130, pctOfIncome:  2.1 },
  utilities:     { label: 'Utilities',        monthlyAvg:  370, pctOfIncome:  6.0 },
  misc:          { label: 'Miscellaneous',    monthlyAvg:  175, pctOfIncome:  2.9 },
};

// Map common category names → benchmark keys (case-insensitive prefix match)
const CATEGORY_MAP: [RegExp, string][] = [
  [/hous|rent|mortg/i, 'housing'],
  [/transport|auto|car|gas|fuel|parking|uber|lyft|rideshare/i, 'transportation'],
  [/food|grocer|restaur|dining|fast.?food|coffee|cafe/i, 'food'],
  [/health|medical|pharma|drug|dental|vision|doctor/i, 'healthcare'],
  [/entertain|netflix|spotify|hulu|subscri|stream|movie|theater/i, 'entertainment'],
  [/personal|hair|salon|gym|fitness/i, 'personal'],
  [/educat|tuition|school|book/i, 'education'],
  [/cloth|apparel|fashion/i, 'clothing'],
  [/util|electric|water|internet|phone|cable/i, 'utilities'],
];

function mapCategory(name: string): string {
  for (const [re, key] of CATEGORY_MAP) {
    if (re.test(name)) return key;
  }
  return 'misc';
}

router.get('/benchmarks', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const now = new Date();
    const defaultEnd = now.toISOString().slice(0, 10);
    const defaultStart = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()).toISOString().slice(0, 10);

    const startDate = (req.query.startDate as string) || defaultStart;
    const endDate   = (req.query.endDate   as string) || defaultEnd;

    const months = Math.max(
      1,
      Math.round((new Date(endDate).getTime() - new Date(startDate).getTime()) / (30 * 24 * 3600 * 1000)),
    );

    // Pull spending by category for the period (expenses only, no transfers)
    const rows = await prisma.transaction.groupBy({
      by: ['categoryId'],
      where: {
        householdId,
        amount: { lt: 0 },
        isHidden: false,
        isTransfer: false,
        date: { gte: new Date(startDate), lte: new Date(endDate) },
      },
      _sum: { amount: true },
    });

    // Resolve category names
    const categoryIds = rows.map((r) => r.categoryId).filter(Boolean) as string[];
    const categories = await prisma.category.findMany({
      where: { id: { in: categoryIds } },
      select: { id: true, name: true },
    });
    const catMap = Object.fromEntries(categories.map((c) => [c.id, c.name]));

    // Accumulate actuals per benchmark key
    const actuals: Record<string, number> = {};
    for (const row of rows) {
      const catName = row.categoryId ? catMap[row.categoryId] ?? 'Uncategorized' : 'Uncategorized';
      const key = mapCategory(catName);
      actuals[key] = (actuals[key] ?? 0) + Math.abs(row._sum.amount ?? 0);
    }

    // Build response
    const result = Object.entries(BLS_BENCHMARKS).map(([key, bls]) => ({
      key,
      label: bls.label,
      blsMonthlyAvg: bls.monthlyAvg,
      blsPctOfIncome: bls.pctOfIncome,
      actualTotal: Math.round((actuals[key] ?? 0) * 100) / 100,
      actualMonthlyAvg: Math.round(((actuals[key] ?? 0) / months) * 100) / 100,
    }));

    return res.json({ startDate, endDate, months, categories: result });
  } catch (err) {
    req.log.error({ err }, 'reports/benchmarks');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/reports/tags?start=YYYY-MM-DD&end=YYYY-MM-DD
// Returns income/expense totals grouped by tag for the given period.
router.get('/tags', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const start = req.query.start as string | undefined;
    const end   = req.query.end   as string | undefined;

    const dateFilter = start && end
      ? { gte: new Date(start), lte: new Date(end) }
      : undefined;

    const tags = await prisma.tag.findMany({
      where:   { householdId },
      orderBy: { name: 'asc' },
    });

    const results = await Promise.all(
      tags.map(async (tag) => {
        const [incomeAgg, expenseAgg, count] = await Promise.all([
          prisma.transaction.aggregate({
            where: {
              householdId,
              isHidden: false,
              amount:   { gt: 0 },
              tags:     { some: { tagId: tag.id } },
              ...(dateFilter ? { date: dateFilter } : {}),
            },
            _sum: { amount: true },
          }),
          prisma.transaction.aggregate({
            where: {
              householdId,
              isHidden: false,
              amount:   { lt: 0 },
              tags:     { some: { tagId: tag.id } },
              ...(dateFilter ? { date: dateFilter } : {}),
            },
            _sum: { amount: true },
          }),
          prisma.transaction.count({
            where: {
              householdId,
              isHidden: false,
              tags:     { some: { tagId: tag.id } },
              ...(dateFilter ? { date: dateFilter } : {}),
            },
          }),
        ]);

        return {
          id:       tag.id,
          name:     tag.name,
          color:    tag.color ?? null,
          income:   incomeAgg._sum.amount ?? 0,
          expenses: Math.abs(expenseAgg._sum.amount ?? 0),
          count,
        };
      })
    );

    return res.json(results.filter((r) => r.count > 0));
  } catch (err) {
    req.log.error({ err }, 'reports/tags');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/reports/no-category?start=YYYY-MM-DD&end=YYYY-MM-DD&limit=50&cursor=
// Returns paginated transactions that have no category assigned.
router.get('/no-category', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const start  = req.query.start  as string | undefined;
    const end    = req.query.end    as string | undefined;
    const limit  = Math.min(parseInt((req.query.limit as string) ?? '50', 10), 200);
    const cursor = req.query.cursor as string | undefined;

    const dateFilter = start && end
      ? { gte: new Date(start), lte: new Date(end) }
      : undefined;

    const baseWhere = {
      householdId,
      isHidden:   false,
      categoryId: null,
      ...(dateFilter ? { date: dateFilter } : {}),
    };

    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where:   baseWhere,
        orderBy: [{ date: 'desc' }, { id: 'desc' }],
        take:    limit + 1,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        select:  {
          id:          true,
          date:        true,
          description: true,
          amount:      true,
          account:     { select: { name: true } },
          merchant:    { select: { displayName: true } },
        },
      }),
      prisma.transaction.count({ where: baseWhere }),
    ]);

    const hasMore    = transactions.length > limit;
    const items      = hasMore ? transactions.slice(0, limit) : transactions;
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    return res.json({ items, nextCursor, total });
  } catch (err) {
    req.log.error({ err }, 'reports/no-category');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
