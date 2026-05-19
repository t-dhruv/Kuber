import { prisma } from './prisma';
import { upsertDailySnapshot } from './reporting/snapshots';
import { buildMonthlyRollupKey, upsertMonthlyRollup } from './reporting/rollups';

const CASH_TYPES = new Set(['checking', 'savings']);
const LIABILITY_TYPES = new Set(['credit_card', 'loan']);

function isInvestment(type: string) { return type.toLowerCase().includes('investment'); }
function isCash(type: string) { return CASH_TYPES.has(type.toLowerCase()); }
function isLiability(type: string) { return LIABILITY_TYPES.has(type.toLowerCase()); }

// Take a daily snapshot of net worth for all households (or one specific household).
export async function takeNetWorthSnapshot(householdId?: string): Promise<void> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const households = householdId
    ? [{ id: householdId }]
    : await prisma.household.findMany({ select: { id: true } });

  for (const household of households) {
    const accounts = await prisma.account.findMany({
      where: { householdId: household.id, isHidden: false, excludeFromNetWorth: false, isDeleted: false },
      select: {
        balance: true,
        type: true,
        investmentHoldings: { select: { shares: true, currentPrice: true } },
      },
    });

    let cashValue = 0;
    let investmentValue = 0;
    let otherAssetsValue = 0;
    let liabilities = 0;

    for (const a of accounts) {
      if (isLiability(a.type)) {
        liabilities += Math.abs(a.balance);
        continue;
      }

      let value = a.balance;
      if (isInvestment(a.type) && a.investmentHoldings.length > 0) {
        value = a.investmentHoldings.reduce((sum, h) => sum + h.shares * h.currentPrice, 0);
      }
      value = Math.round(value * 100) / 100;

      if (isInvestment(a.type)) {
        investmentValue += value;
      } else if (isCash(a.type)) {
        cashValue += value;
      } else {
        otherAssetsValue += value;
      }
    }

    const assets = Math.round((cashValue + investmentValue + otherAssetsValue) * 100) / 100;
    liabilities = Math.round(liabilities * 100) / 100;
    cashValue = Math.round(cashValue * 100) / 100;
    investmentValue = Math.round(investmentValue * 100) / 100;
    otherAssetsValue = Math.round(otherAssetsValue * 100) / 100;
    const netWorth = Math.round((assets - liabilities) * 100) / 100;

    await prisma.netWorthSnapshot.upsert({
      where: { householdId_date: { householdId: household.id, date: today } },
      update: { assets, liabilities, netWorth, cashValue, investmentValue, otherAssetsValue },
      create: { householdId: household.id, date: today, assets, liabilities, netWorth, cashValue, investmentValue, otherAssetsValue },
    });

    const payload = { assets, liabilities, netWorth, cashValue, investmentValue, otherAssetsValue };

    await upsertDailySnapshot({
      householdId: household.id,
      kind: 'net_worth',
      date: today,
      payload,
      source: 'live',
    });

    await upsertMonthlyRollup({
      householdId: household.id,
      kind: 'net_worth',
      periodKey: buildMonthlyRollupKey(today),
      payload,
      source: 'daily_snapshots',
    });
  }
}
