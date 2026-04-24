import type { PrismaClient } from '@prisma/client';

type BillLike = {
  startDate:   Date;
  endDate:     Date | null;
  repeatFreq:  string;
  skipPeriods: number;
  amountMin:   { toNumber(): number } | null;
  amountMax:   { toNumber(): number } | null;
};

export function getPeriodKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function getExpectedPeriodStart(
  billStart: Date,
  repeatFreq: string,
  skipPeriods: number,
  txDate: Date,
): Date | null {
  if (txDate < billStart) return null;

  const cursor = new Date(billStart);
  let prev   = new Date(billStart);

  while (cursor <= txDate) {
    prev = new Date(cursor);
    advanceCursor(cursor, repeatFreq, skipPeriods);
  }
  return prev;
}

function advanceCursor(d: Date, repeatFreq: string, skipPeriods: number): void {
  const skip = 1 + skipPeriods;
  switch (repeatFreq) {
    case 'weekly':    d.setDate(d.getDate() + 7 * skip); break;
    case 'monthly':   d.setMonth(d.getMonth() + 1 * skip); break;
    case 'quarterly': d.setMonth(d.getMonth() + 3 * skip); break;
    case 'yearly':    d.setFullYear(d.getFullYear() + 1 * skip); break;
    default:          d.setMonth(d.getMonth() + 1); break;
  }
}

const WINDOW_DAYS = 7;

export function isBillDueInPeriod(bill: BillLike, txDate: Date, txAmount: number): boolean {
  if (bill.endDate && txDate > bill.endDate) return false;

  const expected = getExpectedPeriodStart(bill.startDate, bill.repeatFreq, bill.skipPeriods, txDate);
  if (!expected) return false;

  const diffDays = Math.abs((txDate.getTime() - expected.getTime()) / (24 * 60 * 60 * 1000));
  if (diffDays > WINDOW_DAYS) return false;

  const absAmount = Math.abs(txAmount);
  if (bill.amountMin && absAmount < bill.amountMin.toNumber()) return false;
  if (bill.amountMax && absAmount > bill.amountMax.toNumber()) return false;

  return true;
}

export async function matchBillsForTransaction(
  prisma: PrismaClient,
  tx: { id: string; householdId: string; date: Date; amount: number; description: string },
): Promise<void> {
  const bills = await prisma.bill.findMany({
    where: { householdId: tx.householdId, isActive: true, isDeleted: false },
  });

  for (const bill of bills) {
    if (!isBillDueInPeriod(bill, tx.date, tx.amount)) continue;

    const periodKey = getPeriodKey(tx.date);
    await prisma.billPaidPeriod.upsert({
      where:  { billId_periodKey: { billId: bill.id, periodKey } },
      create: { billId: bill.id, transactionId: tx.id, periodKey },
      update: { transactionId: tx.id },
    });
  }
}
