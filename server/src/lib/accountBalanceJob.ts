import { prisma } from './prisma';

// Upserts today's balance for every non-deleted account in every household.
// Called daily by the scheduler (and once on server startup).
export async function runAccountBalanceSnapshot(): Promise<void> {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const accounts = await prisma.account.findMany({
    where: { isHidden: false },
    select: { id: true, householdId: true, balance: true },
  });

  await Promise.all(
    accounts.map((account) =>
      prisma.accountBalanceSnapshot.upsert({
        where: { accountId_date: { accountId: account.id, date: today } },
        update: { balance: account.balance },
        create: {
          accountId: account.id,
          householdId: account.householdId,
          date: today,
          balance: account.balance,
        },
      }),
    ),
  );
}
