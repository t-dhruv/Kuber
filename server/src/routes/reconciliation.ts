import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { createJournalFromLegacyTransaction, getVirtualAccountsByType } from '../lib/legacyToJournalMigration';

const router = Router();

const reconcileSchema = z.object({
  statementDate:         z.string().datetime(),
  statementBalance:      z.number(),
  clearedTransactionIds: z.array(z.string()),
});

// GET /api/v1/accounts/:accountId/reconcile
router.get('/:accountId/reconcile', async (req: AuthRequest, res: Response) => {
  try {
    const account = await prisma.account.findFirst({
      where: { id: req.params.accountId, householdId: req.householdId! },
    });
    if (!account) return res.status(404).json({ error: 'Account not found' });

    const uncleared = await prisma.transaction.findMany({
      where:   { accountId: req.params.accountId, householdId: req.householdId!, isCleared: false },
      orderBy: { date: 'desc' },
      take:    200,
    });

    const clearedAgg = await prisma.transaction.aggregate({
      where: { accountId: req.params.accountId, householdId: req.householdId!, isCleared: true },
      _sum:  { amount: true },
    });

    return res.json({
      unclearedTransactions: uncleared,
      clearedBalance: clearedAgg._sum.amount ?? 0,
    });
  } catch (err) {
    req.log.error({ err }, 'reconcile/preview');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/v1/accounts/:accountId/reconcile
router.post('/:accountId/reconcile', async (req: AuthRequest, res: Response) => {
  try {
    const account = await prisma.account.findFirst({
      where: { id: req.params.accountId, householdId: req.householdId! },
    });
    if (!account) return res.status(404).json({ error: 'Account not found' });

    const parsed = reconcileSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });
    const { statementDate, statementBalance, clearedTransactionIds } = parsed.data;

    await prisma.transaction.updateMany({
      where: { id: { in: clearedTransactionIds }, accountId: req.params.accountId, householdId: req.householdId! },
      data:  { isCleared: true, clearedDate: new Date(statementDate) },
    });

    const clearedAgg = await prisma.transaction.aggregate({
      where: { accountId: req.params.accountId, householdId: req.householdId!, isCleared: true },
      _sum:  { amount: true },
    });
    const clearedTotal = clearedAgg._sum.amount ?? 0;
    const difference   = statementBalance - clearedTotal;

    if (Math.abs(difference) > 0.001) {
      // Create reconciliation adjustment as journal transaction
      const virtualAccounts = await getVirtualAccountsByType(req.householdId!);
      const expenseAccountId = difference < 0 ? virtualAccounts.expenseAccountId : virtualAccounts.revenueAccountId;

      if (!expenseAccountId) {
        throw new Error('Missing virtual account for reconciliation adjustment');
      }

      await prisma.$transaction(async (tx) => {
        await createJournalFromLegacyTransaction(
          tx,
          {
            householdId: req.householdId!,
            accountId: req.params.accountId,
            description: 'Reconciliation Adjustment',
            amount: difference,
            date: new Date(statementDate),
          },
          difference < 0 ? expenseAccountId : undefined,
          difference > 0 ? expenseAccountId : undefined,
        );
      });
    }

    const prevReconcile = await prisma.reconciliation.findFirst({
      where:   { accountId: req.params.accountId, householdId: req.householdId! },
      orderBy: { createdAt: 'desc' },
    });

    const reconcile = await prisma.reconciliation.create({
      data: {
        householdId:      req.householdId!,
        accountId:        req.params.accountId,
        statementDate:    new Date(statementDate),
        statementBalance: statementBalance,
        openingBalance:   prevReconcile ? Number(prevReconcile.statementBalance) : 0,
        difference:       difference,
      },
    });

    return res.status(201).json({
      reconciliation: {
        ...reconcile,
        statementBalance: Number(reconcile.statementBalance),
        openingBalance:   Number(reconcile.openingBalance),
        difference:       Number(reconcile.difference),
      },
      difference,
      adjustmentCreated: Math.abs(difference) > 0.001,
    });
  } catch (err) {
    req.log.error({ err }, 'reconcile/commit');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/accounts/:accountId/reconcile/history
router.get('/:accountId/reconcile/history', async (req: AuthRequest, res: Response) => {
  try {
    const account = await prisma.account.findFirst({
      where: { id: req.params.accountId, householdId: req.householdId! },
    });
    if (!account) return res.status(404).json({ error: 'Account not found' });

    const history = await prisma.reconciliation.findMany({
      where:   { accountId: req.params.accountId, householdId: req.householdId! },
      orderBy: { createdAt: 'desc' },
      take:    20,
    });
    return res.json(history.map(r => ({
      ...r,
      statementBalance: Number(r.statementBalance),
      openingBalance:   Number(r.openingBalance),
      difference:       Number(r.difference),
    })));
  } catch (err) {
    req.log.error({ err }, 'reconcile/history');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
