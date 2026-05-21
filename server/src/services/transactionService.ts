import { prisma } from '../lib/prisma';
import { NOT_DELETED } from '../lib/softDeleteWhere';
import { logAudit } from '../lib/audit';
import { fireWebhooks } from '../lib/webhookFire';
import { applyActiveRulesToJournal } from '../lib/ruleEngine';
import { getTransactionSplitDetails } from '../lib/transactionSplits';
import { buildSearchWhere } from '../lib/searchParser';
import {
  buildRuleMatchInputFromJournal,
  createTransactionJournalInTransaction,
  formatJournalAsTransaction,
  getTransactionJournalGroup,
  listTransactionJournalGroups,
  queryJournalsWithRelations,
} from '../lib/transactionJournalService';
import { planTransferConversion } from '../lib/transferConversion';
import { createJournalFromLegacyTransaction, getVirtualAccountsByType } from '../lib/legacyToJournalMigration';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export const TX_INCLUDE = {
  category: { select: { id: true, name: true, icon: true } },
  merchant: { select: { name: true, displayName: true } },
  account: { select: { id: true, name: true } },
  splits: {
    include: { category: { select: { id: true, name: true, icon: true } } },
    orderBy: { createdAt: 'asc' as const },
  },
  tags: { include: { tag: { select: { id: true, name: true, color: true } } } },
  refundedTransaction: {
    select: { id: true, description: true, amount: true, date: true, currencyCode: true },
  },
  refunds: {
    select: { id: true, description: true, amount: true, date: true },
  },
} as const;

export function formatMerchantName(
  merchant: { name: string; displayName: string } | null,
  description: string
): string {
  if (!merchant) return description;
  return merchant.displayName || merchant.name || description;
}

export function formatTx(t: any) {
  return {
    id: t.id,
    date: t.date.toISOString(),
    merchantName: formatMerchantName(t.merchant, t.description),
    originalDescription: t.originalDescription,
    amount: t.amountDecimal ? Number(t.amountDecimal) : t.amount,
    currencyCode: t.currencyCode ?? 'CAD',
    originalAmount: t.originalAmount !== null && t.originalAmount !== undefined ? Number(t.originalAmount) : null,
    fxRate: t.fxRate !== null && t.fxRate !== undefined ? Number(t.fxRate) : null,
    categoryId: t.categoryId ?? null,
    categoryName: t.category?.name ?? null,
    categoryIcon: t.category?.icon ?? null,
    categoryColor: null,
    accountId: t.accountId,
    accountName: t.account.name,
    isRecurring: t.isRecurring,
    needsReview: t.needsReview,
    isHidden: t.isHidden,
    isPending: t.isPending,
    isSplit: t.isSplit,
    splitDetails: getTransactionSplitDetails(t),
    isTransfer: t.isTransfer ?? false,
    transferId: t.transferId ?? null,
    isRefund: t.isRefund ?? false,
    refundedTransactionId: t.refundedTransactionId ?? null,
    refundedTransaction: t.refundedTransaction
      ? {
          id: t.refundedTransaction.id,
          description: t.refundedTransaction.description,
          amount: t.refundedTransaction.amount,
          date: t.refundedTransaction.date.toISOString(),
          currencyCode: t.refundedTransaction.currencyCode ?? 'CAD',
        }
      : null,
    refunds: (t.refunds ?? []).map((r: any) => ({
      id: r.id,
      description: r.description,
      amount: r.amount,
      date: r.date.toISOString(),
    })),
    splits: (t.splits ?? []).map((s: any) => ({
      id:            s.id,
      amountDecimal: Number(s.amountDecimal),
      categoryId:    s.categoryId ?? null,
      categoryName:  s.category?.name ?? null,
      categoryIcon: s.category?.icon ?? null,
      notes:         s.notes ?? null,
    })),
    notes: t.notes ?? null,
    tags: (t.tags ?? []).map((tt: any) => ({
      id: tt.tag.id,
      name: tt.tag.name,
      color: tt.tag.color,
    })),
  };
}

// ---------------------------------------------------------------------------
// Service Functions
// ---------------------------------------------------------------------------

interface ListTransactionsParams {
  householdId: string;
  limit: number;
  page?: number;
  cursorParam?: string;
  accountId?: string;
  categoryId?: string;
  startDate?: string;
  endDate?: string;
  from?: string;
  to?: string;
  minAmount?: string;
  maxAmount?: string;
  search?: string;
  isRecurring?: string;
  needsReview?: string;
  sort?: 'date' | 'amount';
  order?: 'asc' | 'desc';
  tagIds?: string;
  type?: 'income' | 'expense';
  pending?: string;
}

export async function listTransactions(params: ListTransactionsParams) {
  const {
    householdId,
    limit,
    page = 1,
    cursorParam,
    accountId,
    categoryId,
    startDate,
    endDate,
    from,
    to,
    minAmount,
    maxAmount,
    search,
    isRecurring,
    needsReview,
    sort = 'date',
    order = 'desc',
    tagIds,
    type,
    pending,
  } = params;

  // Build where clause
  const where: any = { householdId, ...NOT_DELETED };
  where.isHidden = false;

  if (accountId) where.accountId = accountId;
  if (categoryId) where.categoryId = categoryId;

  // Date filters: from/to take precedence, fall back to legacy startDate/endDate
  const dateFrom = from ?? startDate;
  const dateTo = to ?? endDate;
  if (dateFrom || dateTo) {
    where.date = {};
    if (dateFrom) where.date.gte = new Date(dateFrom);
    if (dateTo) where.date.lte = new Date(dateTo);
  }

  if (minAmount !== undefined || maxAmount !== undefined) {
    where.amount = {};
    if (minAmount !== undefined) where.amount.gte = parseFloat(minAmount);
    if (maxAmount !== undefined) where.amount.lte = parseFloat(maxAmount);
  }

  // Type filter (income / expense)
  if (type === 'income') {
    where.amount = { ...(where.amount ?? {}), gt: 0 };
  } else if (type === 'expense') {
    where.amount = { ...(where.amount ?? {}), lt: 0 };
  }

  // Pending filter
  if (pending !== undefined) {
    where.isPending = pending === 'true';
  }

  if (search) {
    const parsed = buildSearchWhere(search);
    if (parsed.AND && (parsed.AND as unknown[]).length > 0) {
      Object.assign(where, parsed);
    } else {
      where.OR = [
        { description: { contains: search, mode: 'insensitive' } },
        { originalDescription: { contains: search, mode: 'insensitive' } },
        {
          merchant: {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { displayName: { contains: search, mode: 'insensitive' } },
            ],
          },
        },
      ];
    }
  }

  if (isRecurring !== undefined) where.isRecurring = isRecurring === 'true';
  if (needsReview !== undefined) where.needsReview = needsReview === 'true';

  if (tagIds) {
    const ids = tagIds.split(',').map(s => s.trim()).filter(Boolean);
    if (ids.length > 0) where.tags = { some: { tagId: { in: ids } } };
  }

  const sortField = sort === 'amount' ? 'amountDecimal' : 'date';
  const sortOrder = order === 'asc' ? 'asc' : 'desc';
  // Always add id as tiebreaker for stable cursor pagination
  const orderBy: any = [{ [sortField]: sortOrder }, { id: 'desc' }];

  // ── Cursor-based path (journal) ────────────────────────────────────────────
  if (cursorParam) {
    let cursor: { date: string; id: string };
    try {
      cursor = JSON.parse(Buffer.from(cursorParam, 'base64url').toString('utf8'));
    } catch {
      throw new Error('Invalid cursor');
    }

    const cursorDate = new Date(cursor.date);
    const journalWhere: any = { ...where, isDeleted: false };

    if (sortOrder === 'desc') {
      journalWhere.OR = [
        { date: { lt: cursorDate } },
        { date: cursorDate, id: { lt: cursor.id } },
      ];
    } else {
      journalWhere.OR = [
        { date: { gt: cursorDate } },
        { date: cursorDate, id: { gt: cursor.id } },
      ];
    }
    const rows = await prisma.transactionJournal.findMany({
      where: journalWhere,
      include: {
        category: { select: { id: true, name: true, icon: true } },
        aiSuggestedCategory: { select: { id: true, name: true, icon: true } },
        entries: {
          select: { accountId: true, amountDecimal: true, account: { select: { id: true, name: true } } },
        },
        tags: { include: { tag: { select: { id: true, name: true, color: true } } } },
        meta: true,
      },
      orderBy,
      take: limit + 1,
    });

    const hasMore = rows.length > limit;
    const page_rows = rows.slice(0, limit);
    const lastRow = page_rows[page_rows.length - 1];
    const nextCursor = hasMore && lastRow
      ? Buffer.from(JSON.stringify({ date: lastRow.date.toISOString(), id: lastRow.id })).toString('base64url')
      : null;

    return {
      transactions: page_rows.map(j => formatJournalAsTransaction(j)),
      nextCursor,
      hasMore,
    };
  }

  // ── Offset-based path (journal) ────────────────────────────────────────────
  const skip = (page - 1) * limit;

  // Build journal where directly from parsed filter vars (mirrors cursor path)
  const journalOffsetWhere: any = { householdId, isDeleted: false, isHidden: false };
  if (accountId) journalOffsetWhere.entries = { some: { accountId } };
  if (categoryId) journalOffsetWhere.categoryId = categoryId;
  if (where.date) journalOffsetWhere.date = where.date;
  if (where.amount) journalOffsetWhere.amountDecimal = where.amount;
  if (where.isPending !== undefined) journalOffsetWhere.isPending = where.isPending;
  if (where.isRecurring !== undefined) journalOffsetWhere.isRecurring = where.isRecurring;
  if (where.needsReview !== undefined) journalOffsetWhere.needsReview = where.needsReview;
  if (where.tags) journalOffsetWhere.tags = where.tags;
  if (where.OR) journalOffsetWhere.OR = where.OR;

  const [transactions, total] = await Promise.all([
    prisma.transactionJournal.findMany({
      where: journalOffsetWhere,
      include: {
        category: { select: { id: true, name: true, icon: true } },
        aiSuggestedCategory: { select: { id: true, name: true, icon: true } },
        entries: {
          select: { accountId: true, amountDecimal: true, account: { select: { id: true, name: true } } },
        },
        tags: { include: { tag: { select: { id: true, name: true, color: true } } } },
        meta: true,
      },
      orderBy: [{ [sortField]: sortOrder }, { id: 'desc' }],
      skip,
      take: limit,
    }),
    prisma.transactionJournal.count({ where: journalOffsetWhere }),
  ]);

  const lastRow = transactions[transactions.length - 1];
  const nextCursor = lastRow && (skip + limit) < total
    ? Buffer.from(JSON.stringify({ date: lastRow.date.toISOString(), id: lastRow.id })).toString('base64url')
    : null;

  return {
    transactions: transactions.map(j => formatJournalAsTransaction(j)),
    total,
    page,
    totalPages: Math.ceil(total / limit),
    nextCursor,
  };
}

export async function getTransaction(id: string, householdId: string) {
  const journal = await prisma.transactionJournal.findFirst({
    where: { id, householdId, isDeleted: false },
    include: {
      category: { select: { id: true, name: true, icon: true } },
      entries: {
        orderBy: { createdAt: 'asc' },
        include: {
          account: { select: { id: true, name: true } },
        },
      },
      tags: {
        include: {
          tag: { select: { id: true, name: true, color: true } },
        },
      },
      meta: true,
    },
  });

  if (!journal) return null;
  return { ...formatJournalAsTransaction(journal), attachments: [] };
}

interface CreateTransactionParams {
  householdId: string;
  userId: string;
  date: string;
  description: string;
  amount: number;
  accountId: string;
  categoryId?: string | null;
  notes?: string | null;
  tagIds?: string[];
  isRecurring?: boolean;
  isRefund?: boolean;
  currencyCode: string;
  originalAmount?: number | null;
  fxRate?: number | null;
}

export async function createTransaction(params: CreateTransactionParams) {
  const {
    householdId,
    userId,
    date,
    description,
    amount,
    accountId,
    categoryId,
    notes,
    tagIds,
    isRecurring,
    isRefund,
    currencyCode,
    originalAmount,
    fxRate,
  } = params;

  // IDOR: verify account belongs to household
  const account = await prisma.account.findFirst({ where: { id: accountId, householdId, ...NOT_DELETED } });
  if (!account) throw new Error('Account not found');

  // Validate categoryId if provided
  if (categoryId) {
    const cat = await prisma.category.findFirst({ where: { id: categoryId, householdId, ...NOT_DELETED } });
    if (!cat) throw new Error('Category not found');
  }

  // Validate tagIds if provided
  if (tagIds && Array.isArray(tagIds) && tagIds.length > 0) {
    const foundTags = await prisma.tag.findMany({
      where: { id: { in: tagIds }, householdId },
      select: { id: true },
    });
    if (foundTags.length !== tagIds.length) {
      throw new Error('One or more tagIds are invalid');
    }
  }

  // Virtual accounts are auto-created on demand inside createJournalFromLegacyTransaction
  const virtualAccounts = await getVirtualAccountsByType(householdId);

  // Create journal directly (no legacy TX)
  const journal = await prisma.$transaction(async (tx) => {
    const journalResult = await createJournalFromLegacyTransaction(
      tx,
      {
        householdId,
        accountId,
        date: new Date(date),
        description,
        amount,
        categoryId: categoryId ?? undefined,
        currencyCode,
        originalAmount: originalAmount ?? undefined,
        fxRate: fxRate ?? undefined,
        notes: notes ?? undefined,
        isRecurring: isRecurring ?? false,
        isRefund: isRefund ?? false,
        tagIds,
      },
      amount < 0 ? (virtualAccounts.expenseAccountId ?? undefined) : undefined,
      amount > 0 ? (virtualAccounts.revenueAccountId ?? undefined) : undefined,
    );

    // Update account balance
    await tx.account.update({
      where: { id: accountId },
      data: { balance: { increment: amount } },
    });

    return journalResult;
  });

  // Get full journal with entries for response
  const fullJournal = await prisma.transactionJournal.findUniqueOrThrow({
    where: { id: journal.journalId },
    include: {
      entries: { include: { account: true } },
      category: true,
      tags: { include: { tag: true } },
      meta: true,
    },
  });

  // Apply rules to journal
  await applyActiveRulesToJournal(prisma, {
    journalId: fullJournal.id,
    householdId,
    matchInput: buildRuleMatchInputFromJournal(fullJournal),
  });

  logAudit({ householdId, userId, action: 'CREATE', entity: 'TRANSACTION', entityId: fullJournal.id, after: { amount: fullJournal.amountDecimal, description: fullJournal.description } });
  fireWebhooks(householdId, 'transaction.created', { id: fullJournal.id, description: fullJournal.description, amount: Number(fullJournal.amountDecimal), date: fullJournal.date }).catch(() => {});

  return { id: fullJournal.id, description: fullJournal.description, amount: Number(fullJournal.amountDecimal), date: fullJournal.date, categoryId: fullJournal.categoryId, notes: fullJournal.notes };
}

interface UpdateTransactionParams {
  householdId: string;
  userId: string;
  id: string;
  date?: string;
  description?: string;
  merchantName?: string;
  categoryId?: string | null;
  notes?: string | null;
  isRecurring?: boolean;
  needsReview?: boolean;
  isHidden?: boolean;
  currencyCode?: string;
  isPending?: boolean;
}

export async function updateTransaction(params: UpdateTransactionParams) {
  const {
    householdId,
    userId,
    id,
    date,
    description,
    merchantName,
    categoryId,
    notes,
    isRecurring,
    needsReview,
    isHidden,
    currencyCode,
    isPending,
  } = params;

  // IDOR check
  const existing = await prisma.transactionJournal.findFirst({
    where: { id, householdId, isDeleted: false },
    include: {
      entries: { select: { accountId: true, amountDecimal: true } },
    },
  });
  if (!existing) throw new Error('Transaction not found');

  const data: any = {};

  if (date) data.date = new Date(date);
  if (description) data.description = description;
  if (merchantName) data.description = merchantName; // merchantName maps to description in journals
  if (categoryId !== undefined) {
    if (categoryId === null) {
      data.categoryId = null;
    } else {
      const cat = await prisma.category.findFirst({ where: { id: categoryId, householdId, ...NOT_DELETED } });
      if (!cat) throw new Error('Category not found');
      data.categoryId = categoryId;
    }
  }
  if (notes !== undefined) data.notes = notes ?? null;
  if (isRecurring !== undefined) data.isRecurring = isRecurring;
  if (needsReview !== undefined) data.needsReview = needsReview;
  if (isHidden !== undefined) data.isHidden = isHidden;
  if (currencyCode) data.currencyCode = currencyCode;
  if (isPending !== undefined) data.isPending = isPending;

  const updated = await prisma.transactionJournal.update({
    where: { id },
    data,
    include: {
      category: { select: { id: true, name: true, icon: true } },
      entries: {
        orderBy: { createdAt: 'asc' },
        include: { account: { select: { id: true, name: true } } },
      },
      tags: { include: { tag: { select: { id: true, name: true, color: true } } } },
    },
  });

  await applyActiveRulesToJournal(prisma, {
    journalId: updated.id,
    householdId,
    matchInput: buildRuleMatchInputFromJournal(updated),
  });

  logAudit({
    householdId,
    userId,
    action: 'UPDATE',
    entity: 'TRANSACTION',
    entityId: id,
    before: { description: existing.description },
    after: { description: updated.description },
  });

  return formatJournalAsTransaction(updated);
}

export async function deleteTransaction(id: string, householdId: string, userId: string) {
  const existing = await prisma.transactionJournal.findFirst({
    where: { id, householdId, isDeleted: false },
    select: { description: true, amountDecimal: true },
  });
  if (!existing) throw new Error('Transaction not found');

  // Soft delete journal
  await prisma.transactionJournal.update({
    where: { id },
    data: { isDeleted: true, updatedAt: new Date() },
  });

  logAudit({
    householdId,
    userId,
    action: 'DELETE',
    entity: 'TRANSACTION',
    entityId: id,
    before: { description: existing.description, amount: Number(existing.amountDecimal) },
  });

  return { success: true };
}

export async function deleteTransactionsBefore(householdId: string, userId: string, date: Date) {
  const result = await prisma.transactionJournal.updateMany({
    where: { householdId, date: { lt: date }, isDeleted: false },
    data: { isDeleted: true, updatedAt: new Date() },
  });

  logAudit({
    householdId,
    userId,
    action: 'DELETE',
    entity: 'TRANSACTION',
    entityId: 'bulk-before-date',
    before: { cutoffDate: date.toISOString().split('T')[0], count: result.count },
  });

  return { count: result.count };
}

interface BulkUpdateParams {
  householdId: string;
  userId: string;
  action: string;
  ids: string[];
  categoryId?: string;
}

export async function bulkUpdateTransactions(params: BulkUpdateParams) {
  const { householdId, action, ids, categoryId } = params;

  // Verify all journals belong to the household
  const count = await prisma.transactionJournal.count({
    where: { id: { in: ids }, householdId, isDeleted: false },
  });
  if (count !== ids.length) {
    throw new Error('One or more transactions not found');
  }

  switch (action) {
    case 'recategorize': {
      if (!categoryId || typeof categoryId !== 'string') {
        throw new Error('categoryId is required for recategorize action');
      }
      const cat = await prisma.category.findFirst({ where: { id: categoryId, householdId, ...NOT_DELETED } });
      if (!cat) throw new Error('Category not found');
      await prisma.transactionJournal.updateMany({
        where: { id: { in: ids }, householdId },
        data: { categoryId },
      });
      break;
    }

    case 'mark-reviewed': {
      await prisma.transactionJournal.updateMany({
        where: { id: { in: ids }, householdId },
        data: { needsReview: false },
      });
      break;
    }

    case 'hide': {
      await prisma.transactionJournal.updateMany({
        where: { id: { in: ids }, householdId },
        data: { isHidden: true },
      });
      break;
    }

    case 'delete': {
      // Soft-delete journals instead of hard delete
      await prisma.transactionJournal.updateMany({
        where: { id: { in: ids }, householdId },
        data: { isDeleted: true, updatedAt: new Date() },
      });
      break;
    }

    default:
      throw new Error(`Unknown action: ${action}`);
  }

  return { updated: ids.length };
}

export async function addTag(txId: string, tagIds: string[], householdId: string) {
  if (!Array.isArray(tagIds) || tagIds.length === 0) {
    throw new Error('tagIds must be a non-empty array');
  }

  // IDOR check
  const journal = await prisma.transactionJournal.findFirst({
    where: { id: txId, householdId, isDeleted: false },
    select: { id: true },
  });
  if (!journal) throw new Error('Transaction not found');

  // Validate tags belong to household
  const validTags = await prisma.tag.findMany({
    where: { id: { in: tagIds }, householdId },
    select: { id: true },
  });
  if (validTags.length !== tagIds.length) {
    throw new Error('One or more tagIds are invalid');
  }

  // Upsert each tag link
  await prisma.journalTag.createMany({
    data: tagIds.map((tagId: string) => ({ journalId: txId, tagId })),
    skipDuplicates: true,
  });

  // Return updated tags
  const updated = await prisma.journalTag.findMany({
    where: { journalId: txId },
    include: { tag: { select: { id: true, name: true, color: true } } },
  });

  return updated.map((tt: any) => ({ id: tt.tag.id, name: tt.tag.name, color: tt.tag.color }));
}

export async function removeTag(txId: string, tagId: string, householdId: string) {
  // IDOR check
  const journal = await prisma.transactionJournal.findFirst({
    where: { id: txId, householdId, isDeleted: false },
    select: { id: true },
  });
  if (!journal) throw new Error('Transaction not found');

  const link = await prisma.journalTag.findUnique({
    where: { journalId_tagId: { journalId: txId, tagId } },
  });
  if (!link) throw new Error('Tag not found on transaction');

  await prisma.journalTag.delete({
    where: { journalId_tagId: { journalId: txId, tagId } },
  });

  return { success: true };
}

export async function confirmTransaction(id: string, householdId: string, userId: string) {
  const journal = await prisma.transactionJournal.findFirst({
    where: { id, householdId, isDeleted: false },
    include: {
      category: { select: { id: true, name: true, icon: true } },
      entries: {
        orderBy: { createdAt: 'asc' },
        include: { account: { select: { id: true, name: true } } },
      },
      tags: { include: { tag: { select: { id: true, name: true, color: true } } } },
    },
  });
  if (!journal) throw new Error('Transaction not found');

  const updated = await prisma.transactionJournal.update({
    where: { id },
    data: { isPending: false },
    include: {
      category: { select: { id: true, name: true, icon: true } },
      entries: {
        orderBy: { createdAt: 'asc' },
        include: { account: { select: { id: true, name: true } } },
      },
      tags: { include: { tag: { select: { id: true, name: true, color: true } } } },
    },
  });

  await applyActiveRulesToJournal(prisma, {
    journalId: updated.id,
    householdId,
    matchInput: buildRuleMatchInputFromJournal(updated),
  });

  logAudit({
    householdId,
    userId,
    action: 'UPDATE',
    entity: 'TRANSACTION',
    entityId: id,
    before: { isPending: true },
    after: { isPending: false },
  });

  return formatJournalAsTransaction(updated);
}

export async function reviewTransaction(id: string, householdId: string, reviewed: boolean) {
  const journal = await prisma.transactionJournal.findFirst({
    where: { id, householdId, isDeleted: false },
    select: { id: true },
  });
  if (!journal) throw new Error('Transaction not found');

  const updated = await prisma.transactionJournal.update({
    where: { id },
    data: { needsReview: !reviewed },
    select: { needsReview: true },
  });

  return { needsReview: updated.needsReview };
}

interface CreateTransferParams {
  householdId: string;
  userId: string;
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  date: string;
  notes?: string;
}

export async function createTransfer(params: CreateTransferParams) {
  const { householdId, userId, fromAccountId, toAccountId, amount, date, notes } = params;

  if (fromAccountId === toAccountId) {
    throw new Error('Source and destination accounts must differ');
  }

  // Verify both accounts belong to this household
  const accounts = await prisma.account.findMany({
    where: { id: { in: [fromAccountId, toAccountId] }, householdId },
    select: { id: true, name: true, currency: true },
  });
  if (accounts.length !== 2) {
    throw new Error('One or both accounts not found');
  }

  const txDate = new Date(date);

  const journal = await prisma.$transaction(async (tx) => {
    // Update both account balances
    await tx.account.update({
      where: { id: fromAccountId },
      data: { balance: { increment: -Math.abs(amount) } },
    });
    await tx.account.update({
      where: { id: toAccountId },
      data: { balance: { increment: Math.abs(amount) } },
    });

    return await createTransactionJournalInTransaction(tx, {
      householdId,
      type: 'transfer',
      amount: Math.abs(amount),
      sourceAccountId: fromAccountId,
      destinationAccountId: toAccountId,
      description: `Transfer from ${accounts.find(a => a.id === fromAccountId)!.name} to ${accounts.find(a => a.id === toAccountId)!.name}`,
      date: txDate,
      currencyCode: accounts.find(a => a.id === fromAccountId)!.currency ?? 'USD',
      notes: notes ?? undefined,
    });
  });

  // Fetch full journal with entries for response
  const fullJournal = await prisma.transactionJournal.findUniqueOrThrow({
    where: { id: journal.id },
    include: {
      entries: { include: { account: true } },
      category: true,
      tags: { include: { tag: true } },
      meta: true,
    },
  });

  await applyActiveRulesToJournal(prisma, {
    journalId: fullJournal.id,
    householdId,
    matchInput: buildRuleMatchInputFromJournal(fullJournal),
  });

  logAudit({ householdId, userId, action: 'CREATE', entity: 'TRANSACTION', entityId: fullJournal.id, after: { amount: fullJournal.amountDecimal, description: fullJournal.description } });
  fireWebhooks(householdId, 'transaction.created', { id: fullJournal.id, description: fullJournal.description, amount: Number(fullJournal.amountDecimal), date: fullJournal.date }).catch(() => {});

  return { id: fullJournal.id, description: fullJournal.description, amount: Number(fullJournal.amountDecimal), date: fullJournal.date, notes: fullJournal.notes };
}

interface ConvertTransferParams {
  householdId: string;
  userId: string;
  id: string;
  fromAccountId: string;
  toAccountId: string;
  amount?: number;
  date?: string;
  notes?: string | null;
}

export async function convertToTransfer(params: ConvertTransferParams) {
  const { householdId, userId, id, fromAccountId, toAccountId, amount, date, notes } = params;

  // Find journal by ID
  const existing = await prisma.transactionJournal.findFirst({
    where: { id, householdId, isDeleted: false },
    include: {
      category: { select: { id: true, name: true, icon: true } },
      entries: {
        orderBy: { createdAt: 'asc' },
        include: { account: { select: { id: true, name: true } } },
      },
      tags: { include: { tag: { select: { id: true, name: true, color: true } } } },
    },
  });
  if (!existing) throw new Error('Transaction not found');

  if (existing.transactionType === 'transfer') {
    throw new Error('Transaction is already a transfer');
  }

  if (fromAccountId === toAccountId) {
    throw new Error('Source and destination accounts must differ');
  }

  const accounts = await prisma.account.findMany({
    where: { id: { in: [fromAccountId, toAccountId] }, householdId },
    select: { id: true, name: true },
  });
  if (accounts.length !== 2) {
    throw new Error('One or both accounts not found');
  }

  const fromAccount = accounts.find((account) => account.id === fromAccountId)!;
  const toAccount = accounts.find((account) => account.id === toAccountId)!;
  const transferId = crypto.randomUUID();

  // Extract journal data for planning
  const journalData = {
    accountId: existing.entries?.[0]?.accountId || fromAccountId,
    amount: Number(existing.amountDecimal),
    description: existing.description,
    originalDescription: existing.description,
    date: existing.date,
    currencyCode: existing.currencyCode ?? 'CAD',
    notes: existing.notes ?? null,
  };

  const plan = planTransferConversion({
    existing: journalData,
    fromAccountId,
    toAccountId,
    fromAccountName: fromAccount.name,
    toAccountName: toAccount.name,
    transferId,
    amount,
    date: date ? new Date(date) : undefined,
    notes,
  });

  const transferJournal = await prisma.$transaction(async (tx) => {
    // Reverse account balance for old journal
    if (existing.entries?.[0]) {
      const accountId = existing.entries[0].accountId;
      const journalAmount = Number(existing.amountDecimal);
      await tx.account.update({
        where: { id: accountId },
        data: { balance: { increment: -journalAmount } },
      });
    }

    // Delete old journal and its group
    if (existing.groupId) {
      await tx.transactionGroup.delete({ where: { id: existing.groupId } });
    } else {
      await tx.transactionJournal.update({
        where: { id },
        data: { isDeleted: true, updatedAt: new Date() },
      });
    }

    // Create new transfer journal
    const journal = await createTransactionJournalInTransaction(tx, {
      householdId,
      type: 'transfer',
      amount: plan.amount,
      sourceAccountId: fromAccountId,
      destinationAccountId: toAccountId,
      description: `Transfer from ${fromAccount.name} to ${toAccount.name}`,
      date: plan.updatedExisting.date,
      currencyCode: plan.updatedExisting.currencyCode ?? 'CAD',
      notes: plan.updatedExisting.notes ?? undefined,
    });

    // Update account balances for new transfer entries
    await tx.account.update({
      where: { id: fromAccountId },
      data: { balance: { increment: -plan.amount } },
    });
    await tx.account.update({
      where: { id: toAccountId },
      data: { balance: { increment: plan.amount } },
    });

    return journal;
  });

  // Fetch full journal for response
  const fullJournal = await prisma.transactionJournal.findUniqueOrThrow({
    where: { id: transferJournal.id },
    include: {
      entries: { include: { account: { select: { id: true, name: true } } } },
      category: { select: { id: true, name: true, icon: true } },
      tags: { include: { tag: { select: { id: true, name: true, color: true } } } },
    },
  });

  await applyActiveRulesToJournal(prisma, {
    journalId: fullJournal.id,
    householdId,
    matchInput: buildRuleMatchInputFromJournal(fullJournal),
  });

  logAudit({
    householdId,
    userId,
    action: 'UPDATE',
    entity: 'TRANSACTION',
    entityId: fullJournal.id,
    before: { description: existing.description, amount: Number(existing.amountDecimal) },
    after: { description: fullJournal.description, amount: Number(fullJournal.amountDecimal), transferId },
  });
  fireWebhooks(householdId, 'transaction.updated', { id: fullJournal.id, description: fullJournal.description, amount: Number(fullJournal.amountDecimal) }).catch(() => {});

  // Format response with debit/credit entries
  const debitEntry = fullJournal.entries?.find(e => Number(e.amountDecimal) < 0);
  const creditEntry = fullJournal.entries?.find(e => Number(e.amountDecimal) > 0);

  return {
    debit: debitEntry ? {
      id: fullJournal.id,
      date: fullJournal.date.toISOString(),
      description: fullJournal.description,
      amount: Math.abs(Number(debitEntry.amountDecimal)),
      accountId: debitEntry.accountId,
      accountName: debitEntry.account.name,
    } : null,
    credit: creditEntry ? {
      id: fullJournal.id,
      date: fullJournal.date.toISOString(),
      description: fullJournal.description,
      amount: Number(creditEntry.amountDecimal),
      accountId: creditEntry.accountId,
      accountName: creditEntry.account.name,
    } : null,
  };
}

export async function getJournalGroups(householdId: string, limit: number, cursor?: string) {
  return await listTransactionJournalGroups({ householdId, limit, cursor });
}

export async function getJournalGroup(householdId: string, id: string) {
  const group = await getTransactionJournalGroup({ householdId, id });
  if (!group) return null;
  return group;
}

export async function getTransactionsForExport(params: {
  householdId: string;
  startDate?: Date;
  endDate?: Date;
  accountId?: string;
}) {
  const { householdId, startDate, endDate, accountId } = params;

  const query = {
    householdId,
    dateFrom: startDate,
    dateTo: endDate,
    limit: 10000,
    orderBy: 'date' as const,
    orderDirection: 'desc' as const,
  };

  const journals = await queryJournalsWithRelations(query);

  // Filter by account if provided
  const filtered = accountId
    ? journals.filter(j => j.entries?.some(e => e.accountId === accountId))
    : journals;

  return filtered.map(j => {
    const mainEntry = j.entries?.[0];
    const amount = Number(j.amountDecimal);
    return {
      date: j.date.toISOString().slice(0, 10),
      description: j.description,
      amount: amount.toFixed(2),
      type: amount >= 0 ? 'Income' : 'Expense',
      category: j.category?.name ?? '',
      account: mainEntry?.account?.name ?? 'Unknown',
      notes: j.notes ?? '',
    };
  });
}
