import type { Prisma } from '@prisma/client';
import { prisma as defaultPrisma } from './prisma';

export type JournalTransactionType =
  | 'withdrawal'
  | 'deposit'
  | 'transfer'
  | 'opening_balance'
  | 'reconciliation';

export type JournalEntryRole = 'source' | 'destination';

export interface CreateTransactionJournalInput {
  householdId: string;
  type: JournalTransactionType;
  amount: number;
  sourceAccountId?: string;
  destinationAccountId?: string;
  categoryId?: string;
  description: string;
  date: Date;
  currencyCode?: string;
  notes?: string;
  isPending?: boolean;
  isReconciled?: boolean;
  tags?: string[];
  meta?: Record<string, string>;
  groupTitle?: string;
  virtualExpenseAccountId?: string;
  virtualRevenueAccountId?: string;
  virtualEquityAccountId?: string;
}

export interface JournalEntryPlan {
  accountId: string;
  amountDecimal: number;
  role: JournalEntryRole;
}

export interface LegacyTransactionForJournal {
  id: string;
  householdId: string;
  accountId: string;
  amount: number;
  date: Date;
  description: string;
  currencyCode?: string | null;
  categoryId?: string | null;
  notes?: string | null;
  isPending?: boolean | null;
  isCleared?: boolean | null;
  isTransfer?: boolean | null;
  transferId?: string | null;
  tags?: Array<{ tagId?: string; tag?: { id: string } }>;
}

export interface BackfillLegacyTransactionJournalsInput {
  householdId?: string;
  limit?: number;
}

export interface ListTransactionJournalGroupsInput {
  householdId: string;
  limit?: number;
  cursor?: string;
}

export interface GetTransactionJournalGroupInput {
  householdId: string;
  id: string;
}

type PrismaLike = typeof defaultPrisma;
type TransactionClient = Parameters<Parameters<PrismaLike['$transaction']>[0]>[0] | any;

const JOURNAL_GROUP_INCLUDE = {
  journals: {
    where: { isDeleted: false },
    orderBy: [{ order: 'asc' }, { date: 'asc' }, { id: 'asc' }],
    include: {
      category: { select: { id: true, name: true, icon: true } },
      entries: {
        orderBy: { createdAt: 'asc' as const },
        include: {
          account: { select: { id: true, name: true, type: true } },
        },
      },
      tags: {
        include: {
          tag: { select: { id: true, name: true, color: true } },
        },
      },
      meta: true,
    },
  },
} satisfies Prisma.TransactionGroupInclude;

function normalizeAmount(amount: number) {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Transaction amount must be greater than zero');
  }

  return Math.round(amount * 10000) / 10000;
}

function assertAccount(accountId: string | undefined, message: string) {
  if (!accountId) {
    throw new Error(message);
  }

  return accountId;
}

function assertBalanced(entries: JournalEntryPlan[]) {
  const sum = Math.round(entries.reduce((total, entry) => total + entry.amountDecimal, 0) * 10000) / 10000;
  if (sum !== 0) {
    throw new Error('Transaction journal entries must balance to zero');
  }
}

export function buildJournalEntries(input: CreateTransactionJournalInput): JournalEntryPlan[] {
  const amount = normalizeAmount(input.amount);
  let entries: JournalEntryPlan[];

  switch (input.type) {
    case 'withdrawal': {
      const sourceAccountId = assertAccount(input.sourceAccountId, 'Withdrawal requires a source account');
      const expenseAccountId = assertAccount(input.virtualExpenseAccountId, 'Withdrawal requires an expense account');
      entries = [
        { accountId: sourceAccountId, amountDecimal: -amount, role: 'source' },
        { accountId: expenseAccountId, amountDecimal: amount, role: 'destination' },
      ];
      break;
    }
    case 'deposit': {
      const revenueAccountId = assertAccount(input.virtualRevenueAccountId, 'Deposit requires a revenue account');
      const destinationAccountId = assertAccount(input.destinationAccountId, 'Deposit requires a destination account');
      entries = [
        { accountId: revenueAccountId, amountDecimal: -amount, role: 'source' },
        { accountId: destinationAccountId, amountDecimal: amount, role: 'destination' },
      ];
      break;
    }
    case 'transfer': {
      const sourceAccountId = assertAccount(input.sourceAccountId, 'Transfer requires a source account');
      const destinationAccountId = assertAccount(input.destinationAccountId, 'Transfer requires a destination account');
      if (sourceAccountId === destinationAccountId) {
        throw new Error('Transfer source and destination accounts must differ');
      }
      entries = [
        { accountId: sourceAccountId, amountDecimal: -amount, role: 'source' },
        { accountId: destinationAccountId, amountDecimal: amount, role: 'destination' },
      ];
      break;
    }
    case 'opening_balance':
    case 'reconciliation': {
      const equityAccountId = assertAccount(input.virtualEquityAccountId, `${input.type} requires an equity account`);
      const destinationAccountId = assertAccount(input.destinationAccountId, `${input.type} requires a destination account`);
      entries = [
        { accountId: equityAccountId, amountDecimal: -amount, role: 'source' },
        { accountId: destinationAccountId, amountDecimal: amount, role: 'destination' },
      ];
      break;
    }
    default:
      throw new Error(`Unsupported transaction type: ${String(input.type)}`);
  }

  assertBalanced(entries);
  return entries;
}

export function buildJournalInputFromLegacyTransaction(
  transaction: LegacyTransactionForJournal,
): CreateTransactionJournalInput {
  const amount = normalizeAmount(Math.abs(transaction.amount));
  const tagIds = (transaction.tags ?? [])
    .map((tagLink) => tagLink.tagId ?? tagLink.tag?.id)
    .filter((tagId): tagId is string => Boolean(tagId));

  const base = {
    householdId: transaction.householdId,
    amount,
    categoryId: transaction.categoryId ?? undefined,
    description: transaction.description,
    date: transaction.date,
    currencyCode: transaction.currencyCode ?? 'USD',
    notes: transaction.notes ?? undefined,
    isPending: transaction.isPending ?? false,
    isReconciled: transaction.isCleared ?? false,
    tags: tagIds,
    meta: { legacyTransactionId: transaction.id },
    groupTitle: transaction.description,
  };

  if (transaction.amount < 0) {
    return {
      ...base,
      type: 'withdrawal',
      sourceAccountId: transaction.accountId,
    };
  }

  return {
    ...base,
    type: 'deposit',
    destinationAccountId: transaction.accountId,
  };
}

async function getOrCreateVirtualAccount(
  tx: TransactionClient,
  input: { householdId: string; name: string; type: string; currencyCode: string },
) {
  const existing = await tx.account.findFirst({
    where: {
      householdId: input.householdId,
      name: input.name,
      type: input.type,
    },
    select: { id: true },
  });

  if (existing) {
    return existing.id;
  }

  const created = await tx.account.create({
    data: {
      householdId: input.householdId,
      name: input.name,
      type: input.type,
      currency: input.currencyCode,
      balance: 0,
      balanceDecimal: 0,
      isHidden: true,
      excludeFromNetWorth: true,
      excludeFromReports: false,
    },
    select: { id: true },
  });

  return created.id;
}

async function resolveVirtualAccounts(tx: TransactionClient, input: CreateTransactionJournalInput) {
  const currencyCode = input.currencyCode ?? 'USD';
  const categorySuffix = input.categoryId ? `:${input.categoryId}` : ':uncategorized';

  if (input.type === 'withdrawal' && !input.virtualExpenseAccountId) {
    input.virtualExpenseAccountId = await getOrCreateVirtualAccount(tx, {
      householdId: input.householdId,
      name: `Expenses${categorySuffix}`,
      type: 'expense',
      currencyCode,
    });
  }

  if (input.type === 'deposit' && !input.virtualRevenueAccountId) {
    input.virtualRevenueAccountId = await getOrCreateVirtualAccount(tx, {
      householdId: input.householdId,
      name: `Revenue${categorySuffix}`,
      type: 'revenue',
      currencyCode,
    });
  }

  if ((input.type === 'opening_balance' || input.type === 'reconciliation') && !input.virtualEquityAccountId) {
    input.virtualEquityAccountId = await getOrCreateVirtualAccount(tx, {
      householdId: input.householdId,
      name: input.type === 'opening_balance' ? 'Equity:Opening Balance' : 'Equity:Reconciliation',
      type: 'equity',
      currencyCode,
    });
  }
}

function buildJournalWriteData(input: CreateTransactionJournalInput, amount: number, entries: JournalEntryPlan[]) {
  const currencyCode = input.currencyCode ?? 'USD';

  return {
    transactionType: input.type,
    date: input.date,
    description: input.description,
    amountDecimal: amount,
    currencyCode,
    categoryId: input.categoryId ?? null,
    notes: input.notes ?? null,
    isPending: input.isPending ?? false,
    isReconciled: input.isReconciled ?? false,
    reconciledAt: input.isReconciled ? new Date() : null,
    entries: {
      create: entries.map((entry) => ({
        accountId: entry.accountId,
        amountDecimal: entry.amountDecimal,
        currencyCode,
      })),
    },
    tags: input.tags?.length
      ? {
          create: input.tags.map((tagId) => ({ tagId })),
        }
      : undefined,
  };
}

export async function createTransactionJournalInTransaction(tx: TransactionClient, input: CreateTransactionJournalInput) {
  const currencyCode = input.currencyCode ?? 'USD';
  const amount = normalizeAmount(input.amount);
  const workingInput = { ...input, amount, currencyCode };
  await resolveVirtualAccounts(tx, workingInput);
  const entries = buildJournalEntries(workingInput);

  const group = await tx.transactionGroup.create({
    data: {
      householdId: input.householdId,
      title: input.groupTitle ?? input.description,
    },
    select: { id: true },
  });

  return tx.transactionJournal.create({
    data: {
      householdId: input.householdId,
      groupId: group.id,
      ...buildJournalWriteData(workingInput, amount, entries),
      meta: input.meta
        ? {
            create: Object.entries(input.meta).map(([name, value]) => ({ name, value })),
          }
        : undefined,
    },
    include: {
      entries: true,
      group: true,
      tags: { include: { tag: true } },
      meta: true,
    },
  });
}

async function findLegacyJournalLink(tx: TransactionClient, legacyTransactionId: string) {
  return tx.transactionJournalMeta.findFirst({
    where: {
      name: 'legacyTransactionId',
      value: legacyTransactionId,
    },
    include: {
      journal: { select: { id: true, groupId: true } },
    },
  });
}

async function findJournalMetaLink(tx: TransactionClient, name: string, value: string) {
  return tx.transactionJournalMeta.findFirst({
    where: { name, value },
    include: {
      journal: { select: { id: true, groupId: true } },
    },
  });
}

export async function createTransactionJournal(
  input: CreateTransactionJournalInput,
  prisma: PrismaLike = defaultPrisma,
) {
  return prisma.$transaction((tx) => createTransactionJournalInTransaction(tx, input));
}

export async function syncLegacyTransactionJournal(
  transaction: LegacyTransactionForJournal,
  prisma: PrismaLike = defaultPrisma,
) {
  const input = buildJournalInputFromLegacyTransaction(transaction);

  return prisma.$transaction(async (tx) => {
    const existing = await findLegacyJournalLink(tx, transaction.id);
    if (!existing?.journal) {
      return createTransactionJournalInTransaction(tx, input);
    }

    const currencyCode = input.currencyCode ?? 'USD';
    const amount = normalizeAmount(input.amount);
    const workingInput = { ...input, amount, currencyCode };
    await resolveVirtualAccounts(tx, workingInput);
    const entries = buildJournalEntries(workingInput);

    await tx.transactionGroup.update({
      where: { id: existing.journal.groupId },
      data: { title: input.groupTitle ?? input.description },
    });
    await tx.transactionEntry.deleteMany({ where: { journalId: existing.journal.id } });
    await tx.journalTag.deleteMany({ where: { journalId: existing.journal.id } });

    return tx.transactionJournal.update({
      where: { id: existing.journal.id },
      data: buildJournalWriteData(workingInput, amount, entries),
      include: {
        entries: true,
        group: true,
        tags: { include: { tag: true } },
        meta: true,
      },
    });
  }, { timeout: 60_000 });
}

export async function deleteLegacyTransactionJournal(
  legacyTransactionId: string,
  prisma: PrismaLike = defaultPrisma,
) {
  return prisma.$transaction(async (tx) => {
    const existing = await findLegacyJournalLink(tx, legacyTransactionId);
    if (!existing?.journal) {
      return false;
    }

    // Soft-delete the journal instead of hard-deleting the group
    await tx.transactionJournal.update({
      where: { id: existing.journal.id },
      data: { isDeleted: true, updatedAt: new Date() },
    });
    return true;
  });
}

// Legacy Transaction model has been removed — migration to TransactionJournal is complete.
// This function is retained for API compatibility but is a no-op.
export async function backfillLegacyTransactionJournals(
  _input: BackfillLegacyTransactionJournalsInput = {},
  _prisma: PrismaLike = defaultPrisma,
) {
  return { scanned: 0, created: 0, skipped: 0 };
}

function toNumber(value: unknown) {
  return Number(value ?? 0);
}

function toIso(value: Date | string | null | undefined) {
  if (!value) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export interface JournalFormatOptions {
  includeSplits?: boolean;
  includeRefunds?: boolean;
  includeTags?: boolean;
}

export function formatJournalAsTransaction(journal: any, options: JournalFormatOptions = {}) {
  // For withdrawals the real account is the source (negative amountDecimal entry).
  // For deposits the real account is the destination (positive amountDecimal entry).
  const isWithdrawal = journal.transactionType === 'withdrawal';
  const mainEntry = journal.entries?.find((e: any) =>
    isWithdrawal ? e.amountDecimal < 0 : e.amountDecimal > 0
  ) ?? journal.entries?.[0];
  const mainAccountId = mainEntry?.accountId ?? null;
  const mainAccountName = mainEntry?.account?.name ?? null;

  const absAmount = toNumber(journal.amountDecimal);
  const signedAmount = isWithdrawal ? -absAmount : absAmount;

  return {
    id: journal.id,
    date: toIso(journal.date),
    merchantName: journal.description,
    originalDescription: journal.description,
    amount: signedAmount,
    currencyCode: journal.currencyCode ?? 'CAD',
    originalAmount: null,
    fxRate: null,
    categoryId: journal.categoryId ?? null,
    categoryName: journal.category?.name ?? null,
    categoryIcon: journal.category?.icon ?? null,
    categoryColor: null,
    accountId: mainAccountId,
    accountName: mainAccountName ?? 'Unknown',
    isRecurring: false,
    needsReview: journal.needsReview ?? false,
    aiSuggestedCategoryId: journal.aiSuggestedCategoryId ?? null,
    aiSuggestedCategoryName: journal.aiSuggestedCategoryName ?? null,
    aiSuggestionConfidence: journal.aiSuggestionConfidence ?? null,
    isHidden: false,
    isPending: journal.isPending ?? false,
    isSplit: false,
    splitDetails: [],
    isTransfer: journal.transactionType === 'transfer',
    transferId: null,
    isRefund: false,
    refundedTransactionId: null,
    refundedTransaction: null,
    refunds: [],
    splits: [],
    notes: journal.notes ?? null,
    tags: (journal.tags ?? []).map((jt: any) => ({
      id: jt.tag.id,
      name: jt.tag.name,
      color: jt.tag.color,
    })),
  };
}

export function formatTransactionJournalGroup(group: any) {
  return {
    id: group.id,
    householdId: group.householdId,
    title: group.title ?? null,
    createdAt: toIso(group.createdAt),
    updatedAt: toIso(group.updatedAt),
    journals: (group.journals ?? []).map((journal: any) => {
      const entries = (journal.entries ?? []).map((entry: any) => ({
        id: entry.id,
        accountId: entry.accountId,
        accountName: entry.account?.name ?? null,
        accountType: entry.account?.type ?? null,
        amount: toNumber(entry.amountDecimal),
        currencyCode: entry.currencyCode ?? journal.currencyCode,
      }));

      return {
        id: journal.id,
        transactionType: journal.transactionType,
        date: toIso(journal.date),
        description: journal.description,
        amount: toNumber(journal.amountDecimal),
        currencyCode: journal.currencyCode,
        categoryId: journal.categoryId ?? null,
        categoryName: journal.category?.name ?? null,
        notes: journal.notes ?? null,
        isPending: journal.isPending,
        isReconciled: journal.isReconciled,
        reconciledAt: toIso(journal.reconciledAt),
        order: journal.order,
        entries,
        tags: (journal.tags ?? []).map((tagLink: any) => ({
          id: tagLink.tag.id,
          name: tagLink.tag.name,
          color: tagLink.tag.color,
        })),
        meta: Object.fromEntries((journal.meta ?? []).map((item: any) => [item.name, item.value])),
        entryBalance: Math.round(entries.reduce((sum: number, entry: any) => sum + entry.amount, 0) * 10000) / 10000,
      };
    }),
  };
}

function signedJournalAmount(journal: any) {
  const amount = Math.abs(toNumber(journal.amountDecimal));

  if (journal.transactionType === 'withdrawal' || journal.transactionType === 'transfer') {
    return -amount;
  }

  return amount;
}

export function buildRuleMatchInputFromJournal(journal: any) {
  const sourceEntry = (journal.entries ?? []).find((entry: any) => toNumber(entry.amountDecimal) < 0)
    ?? (journal.entries ?? [])[0];

  return {
    merchantName: journal.description ?? null,
    description: journal.description ?? null,
    amount: signedJournalAmount(journal),
    categoryId: journal.categoryId ?? null,
    accountId: sourceEntry?.accountId ?? null,
    notes: journal.notes ?? null,
  };
}

export function buildCashFlowEventFromJournal(journal: any) {
  const amount = signedJournalAmount(journal);

  if (journal.transactionType === 'transfer') {
    return { amount, type: 'transfer', isTransfer: true };
  }

  if (journal.transactionType === 'deposit') {
    return { amount, type: 'income', isTransfer: false };
  }

  return { amount, type: 'expense', isTransfer: false };
}

export async function listTransactionJournalGroups(
  input: ListTransactionJournalGroupsInput,
  prisma: PrismaLike = defaultPrisma,
) {
  const limit = Math.min(Math.max(input.limit ?? 25, 1), 100);
  const groups = await prisma.transactionGroup.findMany({
    where: { householdId: input.householdId, journals: { some: { isDeleted: false } } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    include: JOURNAL_GROUP_INCLUDE,
  });

  const hasNext = groups.length > limit;
  const page = hasNext ? groups.slice(0, limit) : groups;

  return {
    items: page.map(formatTransactionJournalGroup),
    nextCursor: hasNext ? groups[limit].id : null,
  };
}

export async function getTransactionJournalGroup(
  input: GetTransactionJournalGroupInput,
  prisma: PrismaLike = defaultPrisma,
) {
  const group = await prisma.transactionGroup.findFirst({
    where: {
      id: input.id,
      householdId: input.householdId,
    },
    include: JOURNAL_GROUP_INCLUDE,
  });

  return group ? formatTransactionJournalGroup(group) : null;
}

export interface JournalQueryFilter {
  householdId: string;
  dateFrom?: Date;
  dateTo?: Date;
  isPending?: boolean;
  amountGt?: number;
  amountLt?: number;
  categoryIds?: string[];
  limit?: number;
  orderBy?: 'date' | 'amount';
  orderDirection?: 'asc' | 'desc';
}

export interface JournalQueryOptions {
  withCategory?: boolean;
  withEntries?: boolean;
}

export interface JournalListQuery {
  householdId: string;
  dateFrom?: Date;
  dateTo?: Date;
  amountGt?: number;
  amountLt?: number;
  categoryIds?: string[];
  limit?: number;
  skip?: number;
  orderBy?: 'date' | 'amount';
  orderDirection?: 'asc' | 'desc';
  needsReview?: boolean;
  hasAiSuggestion?: boolean;
}

export async function queryJournalsWithRelations(
  query: JournalListQuery,
  prisma: PrismaLike = defaultPrisma,
) {
  const where: any = {
    householdId: query.householdId,
    isDeleted: false,
  };

  if (query.dateFrom || query.dateTo) {
    where.date = {};
    if (query.dateFrom) where.date.gte = query.dateFrom;
    if (query.dateTo) where.date.lt = query.dateTo;
  }

  if (query.amountGt !== undefined || query.amountLt !== undefined) {
    where.amountDecimal = {};
    if (query.amountGt !== undefined) where.amountDecimal.gt = query.amountGt;
    if (query.amountLt !== undefined) where.amountDecimal.lt = query.amountLt;
  }

  if (query.categoryIds && query.categoryIds.length > 0) {
    where.categoryId = { in: query.categoryIds };
  }

  if (query.needsReview !== undefined) {
    where.needsReview = query.needsReview;
  }

  if (query.hasAiSuggestion) {
    where.OR = [
      { aiSuggestedCategoryId: { not: null } },
      { aiSuggestedCategoryName: { not: null } },
    ];
  }

  const orderByField = query.orderBy === 'amount' ? 'amountDecimal' : 'date';
  const orderByDir = query.orderDirection === 'asc' ? 'asc' : 'desc';

  return await prisma.transactionJournal.findMany({
    where,
    include: {
      category: { select: { id: true, name: true, icon: true } },
      aiSuggestedCategory: { select: { id: true, name: true, icon: true } },
      entries: {
        select: { accountId: true, amountDecimal: true, account: { select: { id: true, name: true } } },
      },
      tags: { include: { tag: { select: { id: true, name: true, color: true } } } },
      meta: true,
    },
    orderBy: { [orderByField]: orderByDir },
    skip: query.skip,
    take: query.limit,
  });
}

export async function queryJournalAmounts(
  filter: JournalQueryFilter,
  options: JournalQueryOptions = {},
  prisma: PrismaLike = defaultPrisma,
) {
  const where: any = {
    householdId: filter.householdId,
    isDeleted: false,
  };

  if (filter.dateFrom || filter.dateTo) {
    where.date = {};
    if (filter.dateFrom) where.date.gte = filter.dateFrom;
    if (filter.dateTo) where.date.lt = filter.dateTo;
  }

  if (filter.isPending !== undefined) {
    where.isPending = filter.isPending;
  }

  if (filter.amountGt !== undefined || filter.amountLt !== undefined) {
    where.amountDecimal = {};
    if (filter.amountGt !== undefined) where.amountDecimal.gt = filter.amountGt;
    if (filter.amountLt !== undefined) where.amountDecimal.lt = filter.amountLt;
  }

  if (filter.categoryIds && filter.categoryIds.length > 0) {
    where.categoryId = { in: filter.categoryIds };
  }

  const orderByField = filter.orderBy === 'amount' ? 'amountDecimal' : 'date';
  const orderByDir = filter.orderDirection === 'asc' ? 'asc' : 'desc';

  const baseQuery = {
    where,
    orderBy: { [orderByField]: orderByDir },
    take: filter.limit,
  };

  // Use include if relations needed, select otherwise
  if (options.withCategory || options.withEntries) {
    const include: any = {};
    if (options.withCategory) {
      include.category = { select: { id: true, name: true, icon: true } };
    }
    if (options.withEntries) {
      include.entries = { select: { accountId: true, amountDecimal: true } };
    }
    return await prisma.transactionJournal.findMany({
      ...baseQuery,
      include,
    });
  }

  return await prisma.transactionJournal.findMany({
    ...baseQuery,
    select: {
      id: true,
      date: true,
      amountDecimal: true,
      categoryId: true,
      description: true,
    },
  });
}
