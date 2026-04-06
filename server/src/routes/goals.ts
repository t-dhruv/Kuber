import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { logAudit } from '../lib/audit';

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

interface LinkedAccount {
  id: string;
  name: string;
  balance: number;
  type: string;
  institution?: string | null;
}

function formatGoal(
  g: {
    id: string;
    name: string;
    type: string;
    targetAmount: number;
    currentAmount: number;
    targetDate: Date | null;
    monthlyContribution: number;
    imageUrl: string | null;
    icon: string | null;
    accountId?: string | null;
  },
  linkedAccount?: LinkedAccount | null,
) {
  // For debt goals with a linked account, compute live progress from balance
  let effectiveCurrent = g.currentAmount;
  if (g.type === 'debt' && linkedAccount) {
    // Negative balance = debt owed; paid off = targetAmount - abs(balance)
    const absBalance = Math.abs(linkedAccount.balance);
    effectiveCurrent = Math.max(0, Math.min(g.targetAmount, g.targetAmount - absBalance));
  }

  const percent = g.targetAmount > 0
    ? Math.min(100, Math.round((effectiveCurrent / g.targetAmount) * 10000) / 100)
    : 0;
  const remaining = Math.max(0, g.targetAmount - effectiveCurrent);
  const isCompleted = effectiveCurrent >= g.targetAmount;
  const status = computeGoalStatus(effectiveCurrent, g.targetAmount, g.targetDate, g.monthlyContribution);

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
    currentAmount: effectiveCurrent,
    targetDate: g.targetDate ? g.targetDate.toISOString() : null,
    monthlyContribution: g.monthlyContribution,
    imageUrl: g.imageUrl,
    accountId: g.accountId ?? null,
    isCompleted,
    percent,
    remaining: Math.round(remaining * 100) / 100,
    status,
    monthsRemaining,
    linkedAccount: linkedAccount ?? null,
  };
}

// GET /api/v1/goals/accounts-for-debt
// Must be defined BEFORE /:id routes
router.get('/accounts-for-debt', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const accounts = await prisma.account.findMany({
      where: {
        householdId,
        type: { in: ['CREDIT_CARD', 'LOAN'] },
        isHidden: false,
      },
      select: {
        id: true,
        name: true,
        type: true,
        balance: true,
        institution: true,
      },
      orderBy: { name: 'asc' },
    });
    return res.json(accounts);
  } catch (err) {
    console.error('[goals/accounts-for-debt]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/goals
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;

    const goals = await prisma.goal.findMany({
      where: { householdId },
      orderBy: { createdAt: 'asc' },
    });

    // Collect accountIds for debt goals to batch-fetch
    const debtAccountIds = goals
      .filter((g) => g.type === 'debt' && g.accountId)
      .map((g) => g.accountId as string);

    let accountMap: Record<string, LinkedAccount> = {};
    if (debtAccountIds.length > 0) {
      const accounts = await prisma.account.findMany({
        where: { id: { in: debtAccountIds }, householdId },
        select: { id: true, name: true, type: true, balance: true, institution: true },
      });
      accountMap = Object.fromEntries(accounts.map((a) => [a.id, a]));
    }

    return res.json(
      goals.map((g) => {
        const linked = g.type === 'debt' && g.accountId ? accountMap[g.accountId] ?? null : null;
        return formatGoal(g, linked);
      }),
    );
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

    const validTypes = ['savings', 'vacation', 'home', 'wedding', 'education', 'car', 'other', 'debt'];
    const normalizedType = typeof type === 'string' ? type.toLowerCase() : type;
    if (!validTypes.includes(normalizedType)) {
      return res.status(400).json({ error: `type must be one of: ${validTypes.join(', ')}` });
    }

    let linkedAccount: LinkedAccount | null = null;
    if (accountId) {
      const account = await prisma.account.findFirst({
        where: { id: accountId, householdId },
        select: { id: true, name: true, type: true, balance: true, institution: true },
      });
      if (!account) return res.status(400).json({ error: 'Invalid accountId' });
      linkedAccount = account;
    }

    const goal = await prisma.goal.create({
      data: {
        householdId,
        name,
        type: normalizedType,
        targetAmount: parseFloat(targetAmount),
        currentAmount: currentAmount !== undefined ? parseFloat(currentAmount) : 0,
        targetDate: targetDate ? new Date(targetDate) : null,
        monthlyContribution: monthlyContribution !== undefined ? parseFloat(monthlyContribution) : 0,
        imageUrl: imageUrl ?? null,
        accountId: accountId ?? null,
      },
    });

    logAudit({ householdId, userId: req.userId!, action: 'CREATE', entity: 'GOAL', entityId: goal.id, after: { name: goal.name, targetAmount: goal.targetAmount } });
    return res.status(201).json(formatGoal(goal, linkedAccount));
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

    let linkedAccount: LinkedAccount | null = null;
    if (accountId && accountId !== existing.accountId) {
      const account = await prisma.account.findFirst({
        where: { id: accountId, householdId },
        select: { id: true, name: true, type: true, balance: true, institution: true },
      });
      if (!account) return res.status(400).json({ error: 'Invalid accountId' });
      linkedAccount = account;
    } else if (existing.accountId && accountId !== null) {
      // Keep existing linked account
      const account = await prisma.account.findFirst({
        where: { id: existing.accountId, householdId },
        select: { id: true, name: true, type: true, balance: true, institution: true },
      });
      linkedAccount = account ?? null;
    }

    const updated = await prisma.goal.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(type !== undefined && { type: typeof type === 'string' ? type.toLowerCase() : type }),
        ...(targetAmount !== undefined && { targetAmount: parseFloat(targetAmount) }),
        ...(currentAmount !== undefined && { currentAmount: parseFloat(currentAmount) }),
        ...(targetDate !== undefined && { targetDate: targetDate ? new Date(targetDate) : null }),
        ...(monthlyContribution !== undefined && { monthlyContribution: parseFloat(monthlyContribution) }),
        ...(imageUrl !== undefined && { imageUrl: imageUrl ?? null }),
        ...(accountId !== undefined && { accountId: accountId ?? null }),
      },
    });

    logAudit({ householdId, userId: req.userId!, action: 'UPDATE', entity: 'GOAL', entityId: id, before: { name: existing.name }, after: { name: updated.name } });
    return res.json(formatGoal(updated, linkedAccount));
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
    logAudit({ householdId, userId: req.userId!, action: 'DELETE', entity: 'GOAL', entityId: id, before: { name: existing.name } });

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

    let linkedAccount: LinkedAccount | null = null;
    if (updated.type === 'debt' && updated.accountId) {
      const account = await prisma.account.findFirst({
        where: { id: updated.accountId, householdId },
        select: { id: true, name: true, type: true, balance: true, institution: true },
      });
      linkedAccount = account ?? null;
    }

    return res.json(formatGoal(updated, linkedAccount));
  } catch (err) {
    console.error('[goals/contribute]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
