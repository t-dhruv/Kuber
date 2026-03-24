import { prisma } from './prisma';

// Take a daily snapshot of net worth for all households (or one specific household).
export async function takeNetWorthSnapshot(householdId?: string): Promise<void> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const households = householdId
    ? [{ id: householdId }]
    : await prisma.household.findMany({ select: { id: true } });

  for (const household of households) {
    const accounts = await prisma.account.findMany({
      where: { householdId: household.id, isHidden: false, excludeFromNetWorth: false },
      select: { balance: true, type: true },
    });

    const assets = accounts
      .filter((a) => !['CREDIT_CARD', 'LOAN'].includes(a.type))
      .reduce((sum, a) => sum + a.balance, 0);

    const liabilities = accounts
      .filter((a) => ['CREDIT_CARD', 'LOAN'].includes(a.type))
      .reduce((sum, a) => sum + Math.abs(a.balance), 0);

    const netWorth = assets - liabilities;

    await prisma.netWorthSnapshot.upsert({
      where: { householdId_date: { householdId: household.id, date: today } },
      update: { assets, liabilities, netWorth },
      create: { householdId: household.id, date: today, assets, liabilities, netWorth },
    });
  }
}
