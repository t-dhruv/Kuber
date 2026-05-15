import { prisma } from './prisma';
import { upsertDailySnapshot } from './reporting/snapshots';
import { buildMonthlyRollupKey, upsertMonthlyRollup } from './reporting/rollups';

const INVESTMENT_TYPES = new Set(['investment', 'tfsa_investment', 'rrsp_investment', 'fhsa_investment', 'resp_investment']);

function isInvestmentAccount(type: string): boolean {
  return INVESTMENT_TYPES.has(type.toLowerCase()) || type.toLowerCase() === 'investment';
}

// Upserts today's balance for every non-deleted account in every household.
// For investment accounts, computes portfolio value from holdings and syncs account.balance.
// Called daily by the scheduler (and once on server startup).
export async function runAccountBalanceSnapshot(): Promise<void> {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const accounts = await prisma.account.findMany({
    where: { isHidden: false, isDeleted: false },
    select: {
      id: true,
      householdId: true,
      balance: true,
      type: true,
      investmentHoldings: {
        select: { shares: true, currentPrice: true },
      },
    },
  });

  await Promise.all(
    accounts.map(async (account) => {
      let balance = account.balance;

      if (isInvestmentAccount(account.type) && account.investmentHoldings.length > 0) {
        const portfolioValue = account.investmentHoldings.reduce(
          (sum, h) => sum + h.shares * h.currentPrice,
          0,
        );
        const rounded = Math.round(portfolioValue * 100) / 100;
        if (Math.abs(rounded - account.balance) >= 0.01) {
          await prisma.account.update({
            where: { id: account.id },
            data: { balance: rounded },
          });
        }
        balance = rounded;
      }

      return Promise.all([
        prisma.accountBalanceSnapshot.upsert({
          where: { accountId_date: { accountId: account.id, date: today } },
          update: { balance },
          create: {
            accountId: account.id,
            householdId: account.householdId,
            date: today,
            balance,
          },
        }),
        upsertDailySnapshot({
          householdId: account.householdId,
          kind: 'account_balance',
          subjectId: account.id,
          date: today,
          payload: { balance },
          source: 'live',
        }),
        upsertMonthlyRollup({
          householdId: account.householdId,
          kind: 'account_balance',
          subjectId: account.id,
          periodKey: buildMonthlyRollupKey(today),
          payload: { balance },
          source: 'daily_snapshots',
        }),
      ]);
    }),
  );
}
