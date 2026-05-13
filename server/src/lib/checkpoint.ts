/**
 * checkpoint.ts
 * Creates pre-operation snapshots for bulk ops and restores them on rollback.
 */
import { PrismaClient } from '@prisma/client';

export async function createCheckpoint(
  prisma: PrismaClient,
  householdId: string,
  type: 'bulk-import' | 'rule-apply-all' | 'bulk-categorize' | 'bulk-delete',
  label: string,
  txnIds: string[]
): Promise<string> {
  if (txnIds.length === 0) return '';

  const txns = await prisma.transactionJournal.findMany({
    where: { id: { in: txnIds }, householdId, isDeleted: false },
    select: { id: true, amountDecimal: true, description: true, categoryId: true, isHidden: true, date: true, notes: true },
  });

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const checkpoint = await prisma.operationCheckpoint.create({
    data: {
      householdId,
      type,
      label,
      snapshot: txns.map(t => ({
        id: t.id,
        amountDecimal: t.amountDecimal.toString(),
        description: t.description,
        categoryId: t.categoryId,
        isHidden: t.isHidden,
        date: t.date.toISOString(),
        notes: t.notes,
      })) as unknown as import('@prisma/client').Prisma.JsonValue[],
      txnCount: txns.length,
      expiresAt,
    },
  });

  return checkpoint.id;
}

export async function rollbackCheckpoint(
  prisma: PrismaClient,
  householdId: string,
  checkpointId: string
): Promise<{ restored: number }> {
  const checkpoint = await prisma.operationCheckpoint.findFirst({
    where: { id: checkpointId, householdId, rolledBack: false },
  });

  if (!checkpoint) throw new Error('Checkpoint not found or already rolled back');
  if (new Date() > checkpoint.expiresAt) throw new Error('Checkpoint has expired');

  const snapshot = checkpoint.snapshot as Array<{
    id: string; amountDecimal: string; description: string; categoryId: string | null;
    isHidden: boolean; date: string; notes: string | null;
  }>;

  let restored = 0;

  // For bulk-import: soft-delete the created journals
  if (checkpoint.type === 'bulk-import') {
    const ids = snapshot.map((s) => s.id);
    await prisma.transactionJournal.updateMany({
      where: { id: { in: ids }, householdId },
      data: { isDeleted: true, updatedAt: new Date() },
    });
    restored = ids.length;
  } else {
    // For rule/categorize/delete: restore field values
    for (const snap of snapshot) {
      await prisma.transactionJournal.updateMany({
        where: { id: snap.id, householdId },
        data: {
          categoryId: snap.categoryId,
          isHidden: snap.isHidden,
          notes: snap.notes,
        },
      });
      restored++;
    }
  }

  await prisma.operationCheckpoint.update({
    where: { id: checkpointId },
    data: { rolledBack: true },
  });

  return { restored };
}
