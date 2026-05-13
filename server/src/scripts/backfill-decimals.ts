import { PrismaClient, Prisma } from '@prisma/client';
const { Decimal } = Prisma;

const prisma = new PrismaClient();

const BATCH_SIZE = 500;

function toDec(val: number | null | undefined): string | null {
  if (val === null || val === undefined) return null;
  return new Decimal(val).toDecimalPlaces(4).toString();
}

async function backfillTransactions() {
  console.log('--- Backfilling TransactionJournals ---');
  let cursor: string | undefined = undefined;
  let processed = 0;

  while (true) {
    const journals: any[] = await prisma.transactionJournal.findMany({
      take: BATCH_SIZE,
      skip: cursor ? 1 : 0,
      ...(cursor && { cursor: { id: cursor } }),
      orderBy: { id: 'asc' }
    });

    if (journals.length === 0) break;

    for (const journal of journals) {
      // Journals should have decimal amounts, but backfill if missing
      const amountDecimal = journal.amountDecimal || '0';

      await prisma.transactionJournal.update({
        where: { id: journal.id },
        data: {
          amountDecimal: amountDecimal,
        }
      });
      processed++;
    }

    cursor = journals[journals.length - 1].id;
    console.log(`TransactionJournals: processed ${processed}`);
  }
}

async function backfillAccounts() {
  console.log('--- Backfilling Accounts ---');
  const accounts = await prisma.account.findMany({ where: { balanceDecimal: null } });
  for (const acc of accounts) {
    await prisma.account.update({
      where: { id: acc.id },
      data: {
        balanceDecimal: toDec(acc.balance),
        creditLimitDecimal: toDec(acc.creditLimit)
      }
    });
  }
  console.log(`Accounts: processed ${accounts.length}`);
}

async function backfillBudgets() {
  console.log('--- Backfilling Budgets ---');
  const items = await prisma.budget.findMany({ where: { amountDecimal: null } });
  let processed = 0;
  for (const item of items) {
    await prisma.budget.update({
      where: { id: item.id },
      data: { amountDecimal: toDec(item.amount) }
    });
    processed++;
  }
  console.log(`Budgets: processed ${processed}`);
}

async function backfillGoals() {
  console.log('--- Backfilling Goals ---');
  const items = await prisma.goal.findMany({ where: { targetAmountDecimal: null } });
  let processed = 0;
  for (const item of items) {
    await prisma.goal.update({
      where: { id: item.id },
      data: { 
        targetAmountDecimal: toDec(item.targetAmount),
        currentAmountDecimal: toDec(item.currentAmount),
        monthlyContributionDecimal: toDec(item.monthlyContribution)
      }
    });
    processed++;
  }
  console.log(`Goals: processed ${processed}`);
}

async function backfillManulAssets() {
  console.log('--- Backfilling Manual Assets ---');
  const items = await prisma.manualAsset.findMany({ where: { currentValueDecimal: null } });
  let processed = 0;
  for (const item of items) {
    await prisma.manualAsset.update({
      where: { id: item.id },
      data: { 
        currentValueDecimal: toDec(item.currentValue),
        purchaseValueDecimal: toDec(item.purchaseValue)
      }
    });
    processed++;
  }
  console.log(`ManualAssets: processed ${processed}`);
}

async function backfillLiabilities() {
  console.log('--- Backfilling Manual Liabilities ---');
  const items = await prisma.manualLiability.findMany({ where: { currentBalanceDecimal: null } });
  let processed = 0;
  for (const item of items) {
    await prisma.manualLiability.update({
      where: { id: item.id },
      data: { 
        originalAmountDecimal: toDec(item.originalAmount),
        currentBalanceDecimal: toDec(item.currentBalance),
        interestRateDecimal: toDec(item.interestRate),
        monthlyPaymentDecimal: toDec(item.monthlyPayment)
      }
    });
    processed++;
  }
  console.log(`ManualLiabilities: processed ${processed}`);
}

async function runBackfill() {
  console.log('Starting Phase 2 Backfill Script...');
  try {
    await backfillAccounts();
    await backfillBudgets();
    await backfillTransactions();
    await backfillGoals();
    await backfillManulAssets();
    await backfillLiabilities();
    console.log('Backfill Complete!');
  } catch (error) {
    console.error('Migration Backfill failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

runBackfill();
