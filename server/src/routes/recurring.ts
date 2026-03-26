import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';

const router = Router();

function daysUntil(date: Date): number {
  const now = new Date();
  return Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

// GET /api/v1/recurring
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const { month, year } = req.query;

    const where: Record<string, unknown> = { householdId, isActive: true };

    if (month && year) {
      const m = parseInt(month as string, 10);
      const y = parseInt(year as string, 10);
      if (!isNaN(m) && !isNaN(y)) {
        const start = new Date(y, m - 1, 1);
        const end = new Date(y, m, 1);
        where.nextDate = { gte: start, lt: end };
      }
    }

    const items = await prisma.recurringItem.findMany({
      where: where as any,
      include: {
        category: { select: { id: true, name: true, emoji: true } },
        account: { select: { id: true, name: true } },
      },
      orderBy: { nextDate: 'asc' },
    });

    const data = items.map(item => ({
      id: item.id,
      name: item.name,
      amount: item.amount,
      frequency: item.frequency,
      nextDate: item.nextDate.toISOString(),
      categoryId: item.categoryId ?? null,
      categoryName: item.category?.name ?? null,
      categoryIcon: item.category?.emoji ?? null,
      accountId: item.accountId,
      accountName: item.account.name,
      isActive: item.isActive,
      daysUntilNext: daysUntil(item.nextDate),
    }));

    return res.json(data);
  } catch (err) {
    console.error('[recurring/GET]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/recurring/monthly-summary
router.get('/monthly-summary', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const now = new Date();
    const monthParam = req.query.month ? parseInt(req.query.month as string, 10) : now.getMonth() + 1;
    const yearParam = req.query.year ? parseInt(req.query.year as string, 10) : now.getFullYear();

    const monthStart = new Date(yearParam, monthParam - 1, 1);
    const monthEnd = new Date(yearParam, monthParam, 1);

    const items = await prisma.recurringItem.findMany({
      where: { householdId },
      include: {
        category: { select: { id: true, name: true, emoji: true } },
        account: { select: { id: true, name: true } },
      },
    });

    // Load all transactions in that month to determine "isPaid"
    const monthTxns = await prisma.transaction.findMany({
      where: {
        householdId,
        date: { gte: monthStart, lt: monthEnd },
        isHidden: false,
      },
      include: {
        merchant: { select: { displayName: true } },
      },
    });

    // Helper: determine if a recurring item has a matching transaction this month
    function isPaid(item: { name: string; amount: number }): boolean {
      const nameLower = item.name.toLowerCase();
      const targetAmount = Math.abs(item.amount);
      return monthTxns.some(t => {
        const txnAmount = Math.abs(t.amount);
        const merchantMatch = t.merchant?.displayName.toLowerCase().includes(nameLower)
          || t.description.toLowerCase().includes(nameLower);
        const amountMatch = Math.abs(txnAmount - targetAmount) < 0.01;
        return merchantMatch && amountMatch;
      });
    }

    const incomeItems: Array<{ id: string; name: string; amount: number; nextDate: string; isActive: boolean }> = [];
    const expenseItems: Array<{ id: string; name: string; amount: number; nextDate: string; daysUntil: number; isPaid: boolean }> = [];

    for (const item of items) {
      if (item.amount > 0) {
        incomeItems.push({
          id: item.id,
          name: item.name,
          amount: item.amount,
          nextDate: item.nextDate.toISOString(),
          isActive: item.isActive,
        });
      } else {
        expenseItems.push({
          id: item.id,
          name: item.name,
          amount: item.amount,
          nextDate: item.nextDate.toISOString(),
          daysUntil: daysUntil(item.nextDate),
          isPaid: isPaid(item),
        });
      }
    }

    const totalIncome = incomeItems.reduce((s, i) => s + i.amount, 0);
    const totalExpenses = expenseItems.reduce((s, i) => s + Math.abs(i.amount), 0);
    const totalMonthly = totalExpenses - totalIncome;

    return res.json({
      month: monthParam,
      year: yearParam,
      income: incomeItems,
      expenses: expenseItems,
      totalIncome: Math.round(totalIncome * 100) / 100,
      totalExpenses: Math.round(totalExpenses * 100) / 100,
      totalMonthly: Math.round(totalMonthly * 100) / 100,
    });
  } catch (err) {
    console.error('[recurring/monthly-summary]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/v1/recurring
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const { name, amount, frequency, nextDate, categoryId, accountId } = req.body;

    if (!name || amount === undefined || !frequency || !nextDate || !accountId) {
      return res.status(400).json({ error: 'name, amount, frequency, nextDate, and accountId are required' });
    }

    // Verify account belongs to household
    const account = await prisma.account.findFirst({ where: { id: accountId, householdId } });
    if (!account) {
      return res.status(400).json({ error: 'Invalid accountId' });
    }

    const item = await prisma.recurringItem.create({
      data: {
        householdId,
        name,
        amount: parseFloat(amount),
        frequency,
        nextDate: new Date(nextDate),
        accountId,
        categoryId: categoryId || null,
      },
      include: {
        category: { select: { id: true, name: true, emoji: true } },
        account: { select: { id: true, name: true } },
      },
    });

    return res.status(201).json({
      id: item.id,
      name: item.name,
      amount: item.amount,
      frequency: item.frequency,
      nextDate: item.nextDate.toISOString(),
      categoryId: item.categoryId ?? null,
      categoryName: item.category?.name ?? null,
      categoryIcon: item.category?.emoji ?? null,
      accountId: item.accountId,
      accountName: item.account.name,
      isActive: item.isActive,
      daysUntilNext: daysUntil(item.nextDate),
    });
  } catch (err) {
    console.error('[recurring/POST]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/v1/recurring/:id
router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const { id } = req.params;

    const existing = await prisma.recurringItem.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Not found' });
    if (existing.householdId !== householdId) return res.status(403).json({ error: 'Forbidden' });

    const { name, amount, frequency, nextDate, categoryId, accountId, isActive } = req.body;

    // If accountId provided, verify it belongs to household
    if (accountId && accountId !== existing.accountId) {
      const account = await prisma.account.findFirst({ where: { id: accountId, householdId } });
      if (!account) return res.status(400).json({ error: 'Invalid accountId' });
    }

    const updated = await prisma.recurringItem.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(amount !== undefined && { amount: parseFloat(amount) }),
        ...(frequency !== undefined && { frequency }),
        ...(nextDate !== undefined && { nextDate: new Date(nextDate) }),
        ...(categoryId !== undefined && { categoryId: categoryId || null }),
        ...(accountId !== undefined && { accountId }),
        ...(isActive !== undefined && { isActive }),
      },
      include: {
        category: { select: { id: true, name: true, emoji: true } },
        account: { select: { id: true, name: true } },
      },
    });

    return res.json({
      id: updated.id,
      name: updated.name,
      amount: updated.amount,
      frequency: updated.frequency,
      nextDate: updated.nextDate.toISOString(),
      categoryId: updated.categoryId ?? null,
      categoryName: updated.category?.name ?? null,
      categoryIcon: updated.category?.emoji ?? null,
      accountId: updated.accountId,
      accountName: updated.account.name,
      isActive: updated.isActive,
      daysUntilNext: daysUntil(updated.nextDate),
    });
  } catch (err) {
    console.error('[recurring/PUT]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/v1/recurring/:id
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const { id } = req.params;

    const existing = await prisma.recurringItem.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Not found' });
    if (existing.householdId !== householdId) return res.status(403).json({ error: 'Forbidden' });

    await prisma.recurringItem.delete({ where: { id } });

    return res.json({ success: true });
  } catch (err) {
    console.error('[recurring/DELETE]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/v1/recurring/:id/toggle
router.post('/:id/toggle', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const { id } = req.params;
    const { isActive } = req.body;

    if (typeof isActive !== 'boolean') {
      return res.status(400).json({ error: 'isActive (boolean) is required' });
    }

    const existing = await prisma.recurringItem.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Not found' });
    if (existing.householdId !== householdId) return res.status(403).json({ error: 'Forbidden' });

    const updated = await prisma.recurringItem.update({
      where: { id },
      data: { isActive },
      select: { isActive: true },
    });

    return res.json({ isActive: updated.isActive });
  } catch (err) {
    console.error('[recurring/toggle]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
