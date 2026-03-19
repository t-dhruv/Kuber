import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';

const router = Router();

type GoalStatus = 'on_track' | 'at_risk' | 'completed';

function computeGoalStatus(
  currentAmount: number,
  targetAmount: number,
  targetDate: Date | null,
  monthlyContribution: number,
): GoalStatus {
  const percent = targetAmount > 0 ? currentAmount / targetAmount : 0;
  if (percent >= 1) return 'completed';
  if (!targetDate) return 'on_track';

  const now = new Date();
  const remaining = targetAmount - currentAmount;
  const monthsLeft = Math.max(
    0,
    (targetDate.getFullYear() - now.getFullYear()) * 12 +
      (targetDate.getMonth() - now.getMonth()),
  );
  const projected = monthlyContribution * monthsLeft;
  return projected >= remaining ? 'on_track' : 'at_risk';
}

function formatGoal(g: {
  id: string;
  name: string;
  type: string;
  targetAmount: number;
  currentAmount: number;
  targetDate: Date | null;
  monthlyContribution: number;
  imageUrl: string | null;
  icon: string | null;
}) {
  const percent = g.targetAmount > 0
    ? Math.min(100, Math.round((g.currentAmount / g.targetAmount) * 10000) / 100)
    : 0;
  const remaining = Math.max(0, g.targetAmount - g.currentAmount);
  const isCompleted = g.currentAmount >= g.targetAmount;
  const status = computeGoalStatus(g.currentAmount, g.targetAmount, g.targetDate, g.monthlyContribution);

  const now = new Date();
  let monthsRemaining: number | null = null;
  if (g.targetDate && !isCompleted) {
    monthsRemaining = Math.max(
      0,
      (g.targetDate.getFullYear() - now.getFullYear()) * 12 +
        (g.targetDate.getMonth() - now.getMonth()),
    );
  }

  return {
    id: g.id,
    name: g.name,
    type: g.type,
    targetAmount: g.targetAmount,
    currentAmount: g.currentAmount,
    targetDate: g.targetDate ? g.targetDate.toISOString() : null,
    monthlyContribution: g.monthlyContribution,
    imageUrl: g.imageUrl,
    isCompleted,
    percent,
    remaining: Math.round(remaining * 100) / 100,
    status,
    monthsRemaining,
  };
}

// GET /api/v1/goals
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;

    const goals = await prisma.goal.findMany({
      where: { householdId },
      orderBy: { createdAt: 'asc' },
    });

    return res.json(goals.map(formatGoal));
  } catch (err) {
    console.error('[goals/GET]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/v1/goals
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const {
      name,
      type,
      targetAmount,
      currentAmount,
      targetDate,
      monthlyContribution,
      imageUrl,
      accountId,
    } = req.body;

    if (!name || !type || targetAmount === undefined) {
      return res.status(400).json({ error: 'name, type, and targetAmount are required' });
    }

    if (accountId) {
      const account = await prisma.account.findFirst({ where: { id: accountId, householdId } });
      if (!account) return res.status(400).json({ error: 'Invalid accountId' });
    }

    const goal = await prisma.goal.create({
      data: {
        householdId,
        name,
        type,
        targetAmount: parseFloat(targetAmount),
        currentAmount: currentAmount !== undefined ? parseFloat(currentAmount) : 0,
        targetDate: targetDate ? new Date(targetDate) : null,
        monthlyContribution: monthlyContribution !== undefined ? parseFloat(monthlyContribution) : 0,
        imageUrl: imageUrl ?? null,
        accountId: accountId ?? null,
      },
    });

    return res.status(201).json(formatGoal(goal));
  } catch (err) {
    console.error('[goals/POST]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/v1/goals/:id
router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const { id } = req.params;

    const existing = await prisma.goal.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Not found' });
    if (existing.householdId !== householdId) return res.status(403).json({ error: 'Forbidden' });

    const {
      name,
      type,
      targetAmount,
      currentAmount,
      targetDate,
      monthlyContribution,
      imageUrl,
      accountId,
    } = req.body;

    if (accountId && accountId !== existing.accountId) {
      const account = await prisma.account.findFirst({ where: { id: accountId, householdId } });
      if (!account) return res.status(400).json({ error: 'Invalid accountId' });
    }

    const updated = await prisma.goal.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(type !== undefined && { type }),
        ...(targetAmount !== undefined && { targetAmount: parseFloat(targetAmount) }),
        ...(currentAmount !== undefined && { currentAmount: parseFloat(currentAmount) }),
        ...(targetDate !== undefined && { targetDate: targetDate ? new Date(targetDate) : null }),
        ...(monthlyContribution !== undefined && { monthlyContribution: parseFloat(monthlyContribution) }),
        ...(imageUrl !== undefined && { imageUrl: imageUrl ?? null }),
        ...(accountId !== undefined && { accountId: accountId ?? null }),
      },
    });

    return res.json(formatGoal(updated));
  } catch (err) {
    console.error('[goals/PUT]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/v1/goals/:id
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const { id } = req.params;

    const existing = await prisma.goal.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Not found' });
    if (existing.householdId !== householdId) return res.status(403).json({ error: 'Forbidden' });

    await prisma.goal.delete({ where: { id } });

    return res.json({ success: true });
  } catch (err) {
    console.error('[goals/DELETE]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/v1/goals/:id/contribute
router.post('/:id/contribute', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const { id } = req.params;
    const { amount } = req.body;

    if (amount === undefined || typeof amount !== 'number' || amount <= 0) {
      return res.status(400).json({ error: 'amount must be a positive number' });
    }

    const existing = await prisma.goal.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Not found' });
    if (existing.householdId !== householdId) return res.status(403).json({ error: 'Forbidden' });

    const newAmount = existing.currentAmount + amount;

    const updated = await prisma.goal.update({
      where: { id },
      data: { currentAmount: newAmount },
    });

    return res.json(formatGoal(updated));
  } catch (err) {
    console.error('[goals/contribute]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
