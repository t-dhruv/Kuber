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

  const txns = await prisma.transaction.findMany({
    where: { id: { in: txnIds }, householdId },
    select: { id: true, amount: true, description: true, categoryId: true, merchantId: true, isHidden: true, date: true, notes: true },
  });

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const checkpoint = await prisma.operationCheckpoint.create({
    data: {
      householdId,
      type,
      label,
      snapshot: txns as unknown as import('@prisma/client').Prisma.JsonArray,
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
    id: string; amount: number; description: string; categoryId: string | null;
    merchantId: string | null; isHidden: boolean; date: string; notes: string | null;
  }>;

  let restored = 0;

  // For bulk-import: delete the created transactions
  if (checkpoint.type === 'bulk-import') {
    const ids = snapshot.map((s) => s.id);
    await prisma.transaction.deleteMany({ where: { id: { in: ids }, householdId } });
    restored = ids.length;
  } else {
    // For rule/categorize/delete: restore field values
    for (const snap of snapshot) {
      await prisma.transaction.updateMany({
        where: { id: snap.id, householdId },
        data: {
          categoryId: snap.categoryId,
          merchantId: snap.merchantId,
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
