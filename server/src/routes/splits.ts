import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { Prisma } from '@prisma/client';
import { AuthRequest } from '../middleware/auth';

const router = Router();

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const splitSchema = z.object({
  splits: z
    .array(
      z.object({
        categoryId: z.string().min(1),
        amount: z.number(),
        note: z.string().optional(),
      })
    )
    .min(2, 'At least 2 splits required'),
});

// ---------------------------------------------------------------------------
// POST /api/v1/transactions/:id/split
// ---------------------------------------------------------------------------

router.post('/:id/split', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const { id } = req.params;

    const parseResult = splitSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: parseResult.error.issues[0]?.message ?? 'Invalid body' });
    }

    const { splits } = parseResult.data;

    // Load the parent transaction, scoped to household
    const transaction = await prisma.transaction.findFirst({
      where: { id, householdId },
    });

    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    // Validate amounts sum to original (integer-cent comparison to avoid float issues)
    const originalCents = Math.round(Math.abs(transaction.amount) * 100);
    const splitsCents = Math.round(
      splits.reduce((sum, s) => sum + Math.abs(s.amount), 0) * 100
    );

    if (originalCents !== splitsCents) {
      return res.status(400).json({
        error: `Split amounts must sum to ${(originalCents / 100).toFixed(2)} (got ${(splitsCents / 100).toFixed(2)})`,
      });
    }

    // Validate all categoryIds belong to this household
    const categoryIds = splits.map((s) => s.categoryId);
    const validCategories = await prisma.category.findMany({
      where: { id: { in: categoryIds }, householdId },
      select: { id: true },
    });

    const validCategoryIdSet = new Set(validCategories.map((c) => c.id));
    const invalidCategoryId = categoryIds.find((cid) => !validCategoryIdSet.has(cid));
    if (invalidCategoryId) {
      return res.status(400).json({ error: `Category not found: ${invalidCategoryId}` });
    }

    // Update the transaction
    const updated = await prisma.transaction.update({
      where: { id },
      data: {
        isSplit: true,
        splitDetails: splits,
      },
      include: {
        category: { select: { id: true, name: true, emoji: true } },
        merchant: { select: { name: true, displayName: true } },
        account: { select: { id: true, name: true } },
        tags: { include: { tag: { select: { id: true, name: true, color: true } } } },
      },
    });

    return res.json(updated);
  } catch (err) {
    console.error('[splits] POST split error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/v1/transactions/:id/split
// ---------------------------------------------------------------------------

router.delete('/:id/split', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const { id } = req.params;

    const transaction = await prisma.transaction.findFirst({
      where: { id, householdId },
    });

    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    const updated = await prisma.transaction.update({
      where: { id },
      data: {
        isSplit: false,
        splitDetails: Prisma.JsonNull,
      },
    });

    return res.json(updated);
  } catch (err) {
    console.error('[splits] DELETE split error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
