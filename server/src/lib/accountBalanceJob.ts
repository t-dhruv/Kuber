import { prisma } from './prisma';
import { upsertDailySnapshot } from './reporting/snapshots';
import { buildMonthlyRollupKey, upsertMonthlyRollup } from './reporting/rollups';

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
      Promise.all([
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
        upsertDailySnapshot({
          householdId: account.householdId,
          kind: 'account_balance',
          subjectId: account.id,
          date: today,
          payload: { balance: account.balance },
          source: 'live',
        }),
        upsertMonthlyRollup({
          householdId: account.householdId,
          kind: 'account_balance',
          subjectId: account.id,
          periodKey: buildMonthlyRollupKey(today),
          payload: { balance: account.balance },
          source: 'daily_snapshots',
        }),
      ]),
    ),
  );
}
