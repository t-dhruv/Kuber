import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/v1/transactions/duplicates
// Returns potential duplicate transaction pairs from the last 90 days.
// ---------------------------------------------------------------------------
router.get('/duplicates', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const since = new Date();
    since.setDate(since.getDate() - 90);

    // Fetch all eligible transactions from the last 90 days
    const transactions = await prisma.transaction.findMany({
      where: {
        householdId,
        isHidden: false,
        isSplit: false,
        date: { gte: since },
      },
      include: {
        account: { select: { id: true, name: true } },
        category: { select: { id: true, name: true, emoji: true } },
        merchant: { select: { name: true, displayName: true } },
      },
      orderBy: [{ amount: 'asc' }, { date: 'asc' }],
      take: 1000, // Guard: cap at 1 000 transactions to keep O(n²) scan bounded
    });

    // Fetch already-dismissed pairs
    const dismissals = await prisma.duplicateDismissal.findMany({
      where: { householdId },
      select: { transactionId1: true, transactionId2: true },
    });
    const dismissedSet = new Set(
      dismissals.map((d) => `${d.transactionId1}:${d.transactionId2}`)
    );

    // Build candidate pairs
    type TxWithRelations = (typeof transactions)[number];
    interface DuplicateGroup {
      transactions: [TxWithRelations, TxWithRelations];
      confidence: 'high' | 'medium';
    }

    const groups: DuplicateGroup[] = [];

    for (let i = 0; i < transactions.length; i++) {
      for (let j = i + 1; j < transactions.length; j++) {
        const t1 = transactions[i];
        const t2 = transactions[j];

        // Must be same sign (both income or both expense)
        if ((t1.amount >= 0) !== (t2.amount >= 0)) continue;

        // Amount within $0.01
        if (Math.abs(Math.abs(t1.amount) - Math.abs(t2.amount)) > 0.01) {
          // Since sorted by amount, once diff is too large we can skip remaining j's
          if (Math.abs(t2.amount) - Math.abs(t1.amount) > 0.01) break;
          continue;
        }

        // Date within 3 days
        const daysDiff =
          Math.abs(t1.date.getTime() - t2.date.getTime()) / (1000 * 60 * 60 * 24);
        if (daysDiff > 3) continue;

        // Ensure canonical ordering (lower id first) so dismissal lookup is consistent
        const [a, b] = t1.id < t2.id ? [t1, t2] : [t2, t1];

        // Skip if already dismissed
        if (dismissedSet.has(`${a.id}:${b.id}`)) continue;

        // Classify confidence
        const merchantA = a.merchant?.displayName || a.merchant?.name || a.description;
        const merchantB = b.merchant?.displayName || b.merchant?.name || b.description;
        const sameMerchant =
          merchantA.trim().toLowerCase() === merchantB.trim().toLowerCase();

        const confidence: 'high' | 'medium' =
          sameMerchant && daysDiff <= 1 ? 'high' : 'medium';

        groups.push({ transactions: [a, b], confidence });
      }
    }

    // Sort: high confidence first
    groups.sort((a, b) => (a.confidence === 'high' && b.confidence !== 'high' ? -1 : 1));

    // Shape the response
    const formatted = groups.map((g) => ({
      confidence: g.confidence,
      transactions: g.transactions.map((t) => ({
        id: t.id,
        date: t.date.toISOString(),
        description: t.description,
        merchantName:
          t.merchant?.displayName || t.merchant?.name || t.description,
        amount: t.amount,
        accountId: t.accountId,
        accountName: t.account.name,
        categoryId: t.categoryId ?? null,
        categoryName: t.category?.name ?? null,
        categoryIcon: t.category?.emoji ?? null,
        isSplit: t.isSplit,
      })),
    }));

    res.json({ count: formatted.length, groups: formatted });
  } catch (err) {
    req.log.error({ err }, 'GET error');
    res.status(500).json({ error: 'Failed to fetch duplicates' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/v1/transactions/duplicates/dismiss
// ---------------------------------------------------------------------------
const DismissSchema = z.object({
  transactionId1: z.string().min(1),
  transactionId2: z.string().min(1),
});

router.post('/duplicates/dismiss', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const parsed = DismissSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0]?.message ?? 'Invalid body' });
    }

    const { transactionId1, transactionId2 } = parsed.data;

    // Validate both belong to this household
    const txns = await prisma.transaction.findMany({
      where: {
        id: { in: [transactionId1, transactionId2] },
        householdId,
      },
      select: { id: true },
    });
    if (txns.length !== 2) {
      return res.status(404).json({ error: 'One or both transactions not found' });
    }

    // Canonical ordering
    const [id1, id2] = [transactionId1, transactionId2].sort();

    await prisma.duplicateDismissal.upsert({
      where: { transactionId1_transactionId2: { transactionId1: id1, transactionId2: id2 } },
      create: { householdId, transactionId1: id1, transactionId2: id2 },
      update: {},
    });

    res.json({ message: 'Dismissed' });
  } catch (err) {
    req.log.error({ err }, 'dismiss error');
    res.status(500).json({ error: 'Failed to dismiss duplicate' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/v1/transactions/duplicates/merge
// ---------------------------------------------------------------------------
const MergeSchema = z.object({
  keepId: z.string().min(1),
  removeId: z.string().min(1),
});

router.post('/duplicates/merge', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const parsed = MergeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0]?.message ?? 'Invalid body' });
    }

    const { keepId, removeId } = parsed.data;

    // Validate both belong to this household
    const txns = await prisma.transaction.findMany({
      where: {
        id: { in: [keepId, removeId] },
        householdId,
      },
    });
    if (txns.length !== 2) {
      return res.status(404).json({ error: 'One or both transactions not found' });
    }

    const keep = txns.find((t) => t.id === keepId)!;
    const remove = txns.find((t) => t.id === removeId)!;

    if (keep.isSplit || remove.isSplit) {
      return res
        .status(400)
        .json({ error: 'Cannot merge split transactions' });
    }

    // Soft-delete the duplicate
    await prisma.transaction.update({
      where: { id: removeId },
      data: { isHidden: true },
    });

    // Also record as dismissed so it doesn't reappear
    const [id1, id2] = [keepId, removeId].sort();
    await prisma.duplicateDismissal.upsert({
      where: { transactionId1_transactionId2: { transactionId1: id1, transactionId2: id2 } },
      create: { householdId, transactionId1: id1, transactionId2: id2 },
      update: {},
    });

    const kept = await prisma.transaction.findUnique({
      where: { id: keepId },
      include: {
        account: { select: { id: true, name: true } },
        category: { select: { id: true, name: true, emoji: true } },
        merchant: { select: { name: true, displayName: true } },
      },
    });

    res.json(kept);
  } catch (err) {
    req.log.error({ err }, 'merge error');
    res.status(500).json({ error: 'Failed to merge transactions' });
  }
});

export default router;
