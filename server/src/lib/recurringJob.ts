import type { PrismaClient } from '@prisma/client';

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
    await prisma.transaction.create({
      data: {
        householdId:         item.householdId,
        accountId:           item.accountId,
        categoryId:          item.categoryId ?? null,
        description:         item.name,
        originalDescription: item.name,
        amount:              -Math.abs(item.amount),
        date:                item.nextDate,
        isRecurring:         true,
        recurringItemId:     item.id,
        needsReview:         false,
      },
    });

    const nextDate = advanceNextDate(item.nextDate, item.frequency);
    await prisma.recurringItem.update({
      where: { id: item.id },
      data:  { nextDate, lastProcessedAt: new Date() },
    });
  }
}
