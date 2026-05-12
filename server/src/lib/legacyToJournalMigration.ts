import type { Prisma } from '@prisma/client';
import type { CreateTransactionJournalInput } from './transactionJournalService';
import { createTransactionJournalInTransaction } from './transactionJournalService';
import { prisma as defaultPrisma } from './prisma';

export interface LegacyTransactionInput {
  householdId: string;
  accountId: string;
  date: Date;
  description: string;
  amount: number;
  categoryId?: string | null;
  currencyCode?: string;
  originalAmount?: number | null;
  fxRate?: number | null;
  notes?: string | null;
  merchantId?: string | null;
  needsReview?: boolean;
  isRecurring?: boolean;
  isRefund?: boolean;
  isTransfer?: boolean;
  transferId?: string | null;
  tagIds?: string[];
}

export interface JournalCreationResult {
  journalId: string;
  type: string;
  meta: Record<string, string>;
}

type TransactionClient = Parameters<Parameters<typeof import('./prisma').prisma['$transaction']>[0]>[0] | any;

/**
 * Converts legacy transaction to journal-based transaction.
 * Determines transaction type and creates appropriate journal entries.
 */
export async function createJournalFromLegacyTransaction(
  client: TransactionClient,
  input: LegacyTransactionInput,
  virtualExpenseAccountId?: string,
  virtualRevenueAccountId?: string,
): Promise<JournalCreationResult> {
  const { householdId, accountId, amount, date, description, notes, currencyCode = 'USD' } = input;

  // Determine transaction type based on amount sign and context
  let journalType: 'withdrawal' | 'deposit' | 'transfer' = 'withdrawal';
  let sourceAccountId: string | undefined;
  let destinationAccountId: string | undefined;
  const meta: Record<string, string> = {};

  // Store legacy references for potential rollback/migration tracking
  if (input.merchantId) meta.legacyMerchantId = input.merchantId;
  if (input.originalAmount !== null && input.originalAmount !== undefined) {
    meta.legacyOriginalAmount = String(input.originalAmount);
  }
  if (input.fxRate !== null && input.fxRate !== undefined) {
    meta.legacyFxRate = String(input.fxRate);
  }

  // Classify transaction type
  if (amount < 0) {
    // Negative amount = withdrawal/expense
    journalType = 'withdrawal';
    sourceAccountId = accountId;
  } else if (amount > 0) {
    // Positive amount = deposit/income
    journalType = 'deposit';
    destinationAccountId = accountId;
  }

  const journalInput: CreateTransactionJournalInput = {
    householdId,
    type: journalType,
    amount: Math.abs(amount),
    sourceAccountId: journalType === 'withdrawal' ? sourceAccountId : undefined,
    destinationAccountId: journalType === 'deposit' ? destinationAccountId : undefined,
    categoryId: input.categoryId ?? undefined,
    description,
    date,
    currencyCode,
    notes: notes ?? undefined,
    isPending: false,
    isReconciled: false,
    meta,
  };

  // Need virtual accounts for withdrawal/deposit
  if (journalType === 'withdrawal' && !virtualExpenseAccountId) {
    throw new Error('Virtual expense account required for withdrawal');
  }
  if (journalType === 'deposit' && !virtualRevenueAccountId) {
    throw new Error('Virtual revenue account required for deposit');
  }

  if (journalType === 'withdrawal') {
    journalInput.virtualExpenseAccountId = virtualExpenseAccountId;
  } else if (journalType === 'deposit') {
    journalInput.virtualRevenueAccountId = virtualRevenueAccountId;
  }

  const journal = await createTransactionJournalInTransaction(client, journalInput);

  return {
    journalId: journal.id,
    type: journalType,
    meta,
  };
}

/**
 * Dual-write helper: creates both legacy transaction and journal.
 * Used during migration phase to maintain backward compatibility.
 * Will be removed in Phase 3 when legacy TX fully retired.
 */
export async function createTransactionWithJournal(
  client: TransactionClient,
  legacyData: any,
  journalOverrides?: Partial<LegacyTransactionInput>,
  virtualAccountIds?: { expenseAccountId?: string; revenueAccountId?: string },
): Promise<{ transaction: any; journal: any }> {
  const { householdId, accountId, date, description, amount, categoryId, currencyCode, originalAmount, fxRate, notes, merchantId } = legacyData;

  // Create legacy transaction
  const transaction = await client.transaction.create({
    data: legacyData,
  });

  // Prepare journal input from legacy data
  const journalInput: LegacyTransactionInput = {
    householdId,
    accountId: accountId as string,
    date: date as Date,
    description: description as string,
    amount: amount as number,
    categoryId: categoryId as string | null | undefined,
    currencyCode: currencyCode as string | undefined,
    originalAmount: originalAmount as number | null | undefined,
    fxRate: fxRate as number | null | undefined,
    notes: notes as string | null | undefined,
    merchantId: merchantId as string | null | undefined,
    ...journalOverrides,
  };

  const journalResult = await createJournalFromLegacyTransaction(
    client,
    journalInput,
    virtualAccountIds?.expenseAccountId,
    virtualAccountIds?.revenueAccountId,
  );

  return {
    transaction,
    journal: {
      id: journalResult.journalId,
      type: journalResult.type,
    },
  };
}

/**
 * Get virtual accounts for a household by type.
 * Returns first account matching the given type.
 * NOTE: Virtual account creation (expense/revenue) should be handled elsewhere.
 */
export async function getVirtualAccountsByType(
  householdId: string,
  types: { expenseType: string; revenueType: string } = { expenseType: 'expense', revenueType: 'revenue' },
  prisma: typeof defaultPrisma = defaultPrisma,
): Promise<{ expenseAccountId: string | null; revenueAccountId: string | null }> {
  const [expenseAccount, revenueAccount] = await Promise.all([
    prisma.account.findFirst({
      where: { householdId, type: types.expenseType },
      select: { id: true },
    }),
    prisma.account.findFirst({
      where: { householdId, type: types.revenueType },
      select: { id: true },
    }),
  ]);

  return {
    expenseAccountId: expenseAccount?.id ?? null,
    revenueAccountId: revenueAccount?.id ?? null,
  };
}
