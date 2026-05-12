import type { PrismaClient } from '@prisma/client';
import { createJournalFromLegacyTransaction, getVirtualAccountsByType } from './legacyToJournalMigration';

export function advanceNextDate(current: Date, frequency: string): Date {
  // Work in UTC to avoid timezone shifts
  const year  = current.getUTCFullYear();
  const month = current.getUTCMonth(); // 0-based
  const day   = current.getUTCDate();

  switch (frequency) {
    case 'daily':
      return new Date(Date.UTC(year, month, day + 1));
    case 'weekly':
      return new Date(Date.UTC(year, month, day + 7));
    case 'monthly': {
      const nextMonth = month + 1; // may overflow to next year, Date.UTC handles it
      // Days in the target month: day 0 of month+1
      const maxDay = new Date(Date.UTC(year, nextMonth + 1, 0)).getUTCDate();
      return new Date(Date.UTC(year, nextMonth, Math.min(day, maxDay)));
    }
    case 'yearly':
      return new Date(Date.UTC(year + 1, month, day));
    default:
      return new Date(current);
  }
}

export async function processRecurringItems(prisma: PrismaClient): Promise<void> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dueItems = await prisma.recurringItem.findMany({
    where: { isActive: true, isAutopay: true, nextDate: { lte: today } },
  });

  for (const item of dueItems) {
    if (!item.isAutopay) continue;

    // Get virtual accounts for journal creation
    const virtualAccounts = await getVirtualAccountsByType(item.householdId, undefined, prisma);
    if (!virtualAccounts.expenseAccountId) {
      console.error(`No expense account for recurring item ${item.id} in household ${item.householdId}`);
      continue;
    }

    // Create journal instead of legacy transaction
    await prisma.$transaction(async (tx) => {
      await createJournalFromLegacyTransaction(
        tx,
        {
          householdId: item.householdId,
          accountId: item.accountId,
          categoryId: item.categoryId ?? undefined,
          description: item.name,
          amount: -Math.abs(item.amount), // Withdrawal
          date: item.nextDate,
          isRecurring: true,
        },
        virtualAccounts.expenseAccountId!,
      );

      // Update recurring item next date
      await tx.recurringItem.update({
        where: { id: item.id },
        data: {
          nextDate: advanceNextDate(item.nextDate, item.frequency),
          lastProcessedAt: new Date(),
        },
      });
    });
  }
}
