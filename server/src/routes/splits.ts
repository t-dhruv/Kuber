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

  const journal = await prisma.transactionJournal.findFirst({ where: { id, householdId } });
  if (!journal) return res.status(404).json({ error: 'Transaction not found' });

  try {
    validateSplitAmounts(Number(journal.amountDecimal), splits);
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

    // Update both Transaction (legacy) and TransactionJournal (new model)
    await tx.transaction.update({
      where: { id },
      data: {
        isSplit:      true,
        splitDetails: Prisma.DbNull,
      },
    });

    return tx.transactionJournal.update({
      where: { id },
      data: { isSplit: true },
      include: {
        category: { select: { id: true, name: true, icon: true } },
        entries: { select: { account: { select: { id: true, name: true } } } },
      },
    });
  });

  // Shape response to match expected format
  const formatted = {
    id: updated.id,
    date: updated.date,
    description: updated.description,
    categoryId: updated.categoryId,
    category: updated.category,
    accountId: updated.entries[0]?.account?.id ?? null,
    account: updated.entries[0]?.account ?? null,
    amountDecimal: updated.amountDecimal,
    isSplit: updated.isSplit,
  };

  return res.json(formatted);
});

// ─── GET /api/v1/transactions/:id/splits ─────────────────────────────────────

router.get('/:id/splits', async (req: AuthRequest, res: Response) => {
  const householdId = req.householdId!;
  const { id }      = req.params;

  const journal = await prisma.transactionJournal.findFirst({
    where: { id, householdId },
    select: { id: true, isSplit: true },
  });
  if (!journal) return res.status(404).json({ error: 'Transaction not found' });

  if (!journal.isSplit) return res.json([]);

  const splits = await prisma.transactionSplit.findMany({
    where:   { transactionId: id },
    include: { category: { select: { id: true, name: true, icon: true } } },
    orderBy: { createdAt: 'asc' },
  });

  return res.json(splits);
});

// ─── DELETE /api/v1/transactions/:id/split ───────────────────────────────────

router.delete('/:id/split', async (req: AuthRequest, res: Response) => {
  const householdId = req.householdId!;
  const { id }      = req.params;

  const journal = await prisma.transactionJournal.findFirst({ where: { id, householdId } });
  if (!journal) return res.status(404).json({ error: 'Transaction not found' });

  await prisma.$transaction(async (tx) => {
    await tx.transactionSplit.deleteMany({ where: { transactionId: id } });
    await tx.transactionJournal.update({
      where: { id },
      data:  { isSplit: false },
    });
  });

  return res.json({ message: 'Split removed' });
});

export default router;
