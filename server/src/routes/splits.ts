import { Router, Response } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';

export const router = Router();

// ─── Zod schema ──────────────────────────────────────────────────────────────

const splitItemSchema = z.object({
  amountDecimal: z.number().positive({ message: 'Split amounts must be greater than zero' }),
  categoryId:    z.string().min(1),
  notes:         z.string().optional().nullable(),
});

const splitBodySchema = z.object({
  splits: z.array(splitItemSchema).min(2, 'At least 2 splits required'),
});

export type SplitItem = z.infer<typeof splitItemSchema>;

// ─── Pure validation helpers (exported for unit tests) ───────────────────────

export function validateSplitAmounts(
  parentAmount: number,
  splits: { amountDecimal: number; categoryId: string; notes?: string | null }[],
): void {
  if (splits.length < 2) throw new Error('At least 2 splits required');

  for (const s of splits) {
    if (s.amountDecimal <= 0) {
      throw new Error('Split amounts must be greater than zero');
    }
  }

  const parentCents = Math.round(Math.abs(parentAmount) * 100);
  const splitCents  = Math.round(
    splits.reduce((sum, s) => sum + Math.abs(s.amountDecimal), 0) * 100,
  );

  if (parentCents !== splitCents) {
    throw new Error(
      `Split amounts must sum to ${(parentCents / 100).toFixed(2)} (got ${(splitCents / 100).toFixed(2)})`,
    );
  }
}

export function validateSplitCategories(
  categoryIds: string[],
  validSet: Set<string>,
): string | undefined {
  return categoryIds.find((cid) => !validSet.has(cid));
}

// ─── POST /api/v1/transactions/:id/split ─────────────────────────────────────

router.post('/:id/split', async (req: AuthRequest, res: Response) => {
  const householdId = req.householdId!;
  const { id }      = req.params;

  const parsed = splitBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' });
  }

  const { splits } = parsed.data;

  const txn = await prisma.transaction.findFirst({ where: { id, householdId } });
  if (!txn) return res.status(404).json({ error: 'Transaction not found' });

  try {
    validateSplitAmounts(txn.amount, splits);
  } catch (err: unknown) {
    return res.status(400).json({ error: err instanceof Error ? err.message : 'Validation error' });
  }

  const categoryIds = splits.map((s) => s.categoryId);
  const validCategories = await prisma.category.findMany({
    where:  { id: { in: categoryIds }, householdId },
    select: { id: true },
  });
  const invalidCategoryId = validateSplitCategories(
    categoryIds,
    new Set(validCategories.map((c) => c.id)),
  );
  if (invalidCategoryId) {
    return res.status(400).json({ error: `Category not found: ${invalidCategoryId}` });
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.transactionSplit.deleteMany({ where: { transactionId: id } });
    await tx.transactionSplit.createMany({
      data: splits.map((s) => ({
        transactionId: id,
        amountDecimal: s.amountDecimal,
        categoryId:    s.categoryId,
        notes:         s.notes ?? null,
      })),
    });
    return tx.transaction.update({
      where: { id },
      data: {
        isSplit:      true,
        splitDetails: Prisma.DbNull,
      },
      include: {
        category: { select: { id: true, name: true, emoji: true } },
        account:  { select: { id: true, name: true } },
        splits: {
          include: { category: { select: { id: true, name: true, emoji: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  });

  return res.json(updated);
});

// ─── GET /api/v1/transactions/:id/splits ─────────────────────────────────────

router.get('/:id/splits', async (req: AuthRequest, res: Response) => {
  const householdId = req.householdId!;
  const { id }      = req.params;

  const txn = await prisma.transaction.findFirst({
    where: { id, householdId },
    select: { id: true, isSplit: true },
  });
  if (!txn) return res.status(404).json({ error: 'Transaction not found' });

  if (!txn.isSplit) return res.json([]);

  const splits = await prisma.transactionSplit.findMany({
    where:   { transactionId: id },
    include: { category: { select: { id: true, name: true, emoji: true } } },
    orderBy: { createdAt: 'asc' },
  });

  return res.json(splits);
});

// ─── DELETE /api/v1/transactions/:id/split ───────────────────────────────────

router.delete('/:id/split', async (req: AuthRequest, res: Response) => {
  const householdId = req.householdId!;
  const { id }      = req.params;

  const txn = await prisma.transaction.findFirst({ where: { id, householdId } });
  if (!txn) return res.status(404).json({ error: 'Transaction not found' });

  await prisma.$transaction(async (tx) => {
    await tx.transactionSplit.deleteMany({ where: { transactionId: id } });
    await tx.transaction.update({
      where: { id },
      data:  { isSplit: false, splitDetails: Prisma.DbNull },
    });
  });

  return res.json({ message: 'Split removed' });
});

export default router;
