import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { NOT_DELETED } from '../lib/softDeleteWhere';

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

    // Fetch all eligible journals from the last 90 days
    const journals = await prisma.transactionJournal.findMany({
      where: {
        householdId,
        isHidden: false,
        isSplit: false,
        ...NOT_DELETED,
        date: { gte: since },
      },
      include: {
        entries: {
          select: { account: { select: { id: true, name: true } } },
        },
        category: { select: { id: true, name: true, icon: true } },
        merchant: { select: { name: true, displayName: true } },
       },
       orderBy: [{ amountDecimal: 'asc' }, { date: 'asc' }],
       take: 1000,
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
    type JournalWithRelations = (typeof journals)[number];
    interface DuplicateGroup {
      journals: [JournalWithRelations, JournalWithRelations];
      confidence: 'high' | 'medium';
    }

    const groups: DuplicateGroup[] = [];

    for (let i = 0; i < journals.length; i++) {
      for (let j = i + 1; j < journals.length; j++) {
        const j1 = journals[i];
        const j2 = journals[j];

        // Convert Decimal to Number for comparison
        const amount1 = Number(j1.amountDecimal);
        const amount2 = Number(j2.amountDecimal);

        // Must be same sign (both income or both expense)
        if ((amount1 >= 0) !== (amount2 >= 0)) continue;

        // Amount within $0.01
        if (Math.abs(Math.abs(amount1) - Math.abs(amount2)) > 0.01) {
          // Since sorted by amount, once diff is too large we can skip remaining j's
          if (Math.abs(amount2) - Math.abs(amount1) > 0.01) break;
          continue;
        }

        // Date within 3 days
        const daysDiff =
          Math.abs(j1.date.getTime() - j2.date.getTime()) / (1000 * 60 * 60 * 24);
        if (daysDiff > 3) continue;

        // Ensure canonical ordering (lower id first) so dismissal lookup is consistent
        const [a, b] = j1.id < j2.id ? [j1, j2] : [j2, j1];

        // Skip if already dismissed
        if (dismissedSet.has(`${a.id}:${b.id}`)) continue;

        // Classify confidence
        const merchantA = a.merchant?.displayName || a.merchant?.name || a.description;
        const merchantB = b.merchant?.displayName || b.merchant?.name || b.description;
        const sameMerchant =
          merchantA.trim().toLowerCase() === merchantB.trim().toLowerCase();

        const confidence: 'high' | 'medium' =
          sameMerchant && daysDiff <= 1 ? 'high' : 'medium';

        groups.push({ journals: [a, b], confidence });
      }
    }

    // Sort: high confidence first
    groups.sort((a, b) => (a.confidence === 'high' && b.confidence !== 'high' ? -1 : 1));

    // Shape the response
    const formatted = groups.map((g) => ({
      confidence: g.confidence,
      transactions: g.journals.map((j) => {
        // Get account from first entry (real account, not virtual)
        const firstEntry = j.entries[0];
        return {
          id: j.id,
          date: j.date.toISOString(),
          description: j.description,
          merchantName:
            j.merchant?.displayName || j.merchant?.name || j.description,
          amount: Number(j.amountDecimal),
          accountId: firstEntry?.account.id ?? '',
          accountName: firstEntry?.account.name ?? '',
          categoryId: j.categoryId ?? null,
          categoryName: j.category?.name ?? null,
          categoryIcon: j.category?.icon ?? null,
          isSplit: j.isSplit,
        };
      }),
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
    const journals = await prisma.transactionJournal.findMany({
      where: {
        id: { in: [transactionId1, transactionId2] },
        householdId,
        isHidden: false,
        ...NOT_DELETED,
      },
      select: { id: true },
    });
    if (journals.length !== 2) {
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
    const journals = await prisma.transactionJournal.findMany({
      where: {
        id: { in: [keepId, removeId] },
        householdId,
        isHidden: false,
        ...NOT_DELETED,
      },
    });
    if (journals.length !== 2) {
      return res.status(404).json({ error: 'One or both transactions not found' });
    }

    const keep = journals.find((j) => j.id === keepId)!;
    const remove = journals.find((j) => j.id === removeId)!;

    if (keep.isSplit || remove.isSplit) {
      return res
        .status(400)
        .json({ error: 'Cannot merge split transactions' });
    }

    // Soft-delete the duplicate
    await prisma.transactionJournal.update({
      where: { id: removeId },
      data: { isHidden: true, isDeleted: true },
    });

    // Also record as dismissed so it doesn't reappear
    const [id1, id2] = [keepId, removeId].sort();
    await prisma.duplicateDismissal.upsert({
      where: { transactionId1_transactionId2: { transactionId1: id1, transactionId2: id2 } },
      create: { householdId, transactionId1: id1, transactionId2: id2 },
      update: {},
    });

    const kept = await prisma.transactionJournal.findUnique({
      where: { id: keepId },
       include: {
         entries: {
           select: { account: { select: { id: true, name: true } } },
         },
         category: { select: { id: true, name: true, icon: true } },
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
