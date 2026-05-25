import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from './prisma';

export type JournalReportPeriod = 'month' | 'year' | 'multi-year';
export type JournalReportType = 'standard' | 'audit' | 'category' | 'budget' | 'tag' | 'account' | 'double';
export type JournalReportMode = 'spending' | 'income';
export type JournalReportGroupBy = 'category' | 'merchant' | 'account' | 'tag';

export interface JournalReportCategory {
  id: string;
  name: string;
  icon: string | null;
  type: string | null;
  isTaxDeductible: boolean;
  excludeFromReports?: boolean;
}

export interface JournalReportAccount {
  id: string;
  name: string;
  type: string | null;
  excludeFromReports?: boolean;
}

export interface JournalReportTag {
  id: string;
  name: string;
  color: string | null;
}

export interface JournalReportRow {
  id: string;
  householdId: string;
  transactionType: string;
  date: Date;
  description: string;
  amount: number;
  signedAmount: number;
  category: JournalReportCategory | null;
  reportAccount: JournalReportAccount | null;
  tags: JournalReportTag[];
  entryBalance: number;
}

export interface JournalReportRange {
  start: Date;
  end: Date;
}

export interface JournalReportFilters {
  categoryIds?: string[];
  accountIds?: string[];
  tagIds?: string[];
  excludeCategoryIds?: string[];
  excludeAccountIds?: string[];
  minAmount?: number;
  maxAmount?: number;
}

export interface JournalGroupedReportInput extends JournalReportRange, JournalReportFilters {
  mode: JournalReportMode;
  groupBy: JournalReportGroupBy;
}

export interface JournalDrilldownInput extends JournalGroupedReportInput {
  groupId: string;
}

export interface JournalReportCatalogEntry {
  type: JournalReportType;
  periods: JournalReportPeriod[];
}

type JournalAmountValue = Prisma.Decimal | number | string | null | undefined;

interface JournalSourceEntry {
  accountId: string;
  amountDecimal: JournalAmountValue;
  account: JournalReportAccount | null;
}

interface JournalSourceTagLink {
  tag: JournalReportTag;
}

interface JournalSource {
  id: string;
  householdId: string;
  transactionType: string;
  date: Date | string;
  description: string;
  amount?: JournalAmountValue;
  amountDecimal?: JournalAmountValue;
  category: JournalReportCategory | null;
  entries: JournalSourceEntry[];
  tags: JournalSourceTagLink[];
}

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function toNumber(value: unknown) {
  return Number(value ?? 0);
}

function dateInRange(date: Date, range: JournalReportRange) {
  return date >= range.start && date <= range.end;
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function signedAmountForJournal(journal: Pick<JournalSource, 'amount' | 'amountDecimal' | 'transactionType'>) {
  const amount = Math.abs(toNumber(journal.amountDecimal ?? journal.amount));
  if (journal.transactionType === 'deposit') return amount;
  return -amount;
}

function findReportAccount(journal: Pick<JournalSource, 'entries' | 'transactionType'>): JournalReportAccount | null {
  const entries = journal.entries ?? [];
  const entry = journal.transactionType === 'deposit'
    ? entries.find((item) => toNumber(item.amountDecimal) > 0)
    : entries.find((item) => toNumber(item.amountDecimal) < 0);
  const account = entry?.account;
  if (!entry || !account) return null;
  return {
    id: entry.accountId,
    name: account.name,
    type: account.type ?? null,
    excludeFromReports: Boolean(account.excludeFromReports),
  };
}

function entryBalance(journal: Pick<JournalSource, 'entries'>) {
  return roundMoney(journal.entries.reduce((sum, entry) => sum + toNumber(entry.amountDecimal), 0));
}

export function classifyReportPeriod(start: Date, end: Date): JournalReportPeriod {
  const months = Math.abs((end.getFullYear() - start.getFullYear()) * 12 + end.getMonth() - start.getMonth());
  if (months > 12) return 'multi-year';
  if (months > 1) return 'year';
  return 'month';
}

export function buildJournalReportCatalog(): JournalReportCatalogEntry[] {
  const periods: JournalReportPeriod[] = ['month', 'year', 'multi-year'];
  return [
    { type: 'standard', periods },
    { type: 'audit', periods },
    { type: 'category', periods },
    { type: 'budget', periods },
    { type: 'tag', periods },
    { type: 'account', periods },
    { type: 'double', periods },
  ];
}

export function mapJournalToReportRow(journal: JournalSource): JournalReportRow {
  const category = journal.category
    ? {
        id: journal.category.id,
        name: journal.category.name,
        icon: journal.category.icon ?? null,
        type: journal.category.type ?? null,
        isTaxDeductible: Boolean(journal.category.isTaxDeductible),
        excludeFromReports: Boolean(journal.category.excludeFromReports),
      }
    : null;

  return {
    id: journal.id,
    householdId: journal.householdId,
    transactionType: journal.transactionType,
    date: journal.date instanceof Date ? journal.date : new Date(journal.date),
    description: journal.description,
    amount: Math.abs(toNumber(journal.amountDecimal ?? journal.amount)),
    signedAmount: signedAmountForJournal(journal),
    category,
    reportAccount: findReportAccount(journal),
    tags: journal.tags.map((link) => ({
      id: link.tag.id,
      name: link.tag.name,
      color: link.tag.color ?? null,
    })),
    entryBalance: entryBalance(journal),
  };
}

function splitCsv(value: unknown): string[] | undefined {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

export function buildJournalReportFilters(query: Record<string, unknown>): JournalReportFilters {
  return {
    categoryIds: splitCsv(query.categoryIds),
    accountIds: splitCsv(query.accountIds),
    tagIds: splitCsv(query.tagIds),
    excludeCategoryIds: splitCsv(query.excludeCategoryIds ?? query.excludeCategories),
    excludeAccountIds: splitCsv(query.excludeAccountIds ?? query.excludeAccounts),
    minAmount: query.minAmount ? Number(query.minAmount) : undefined,
    maxAmount: query.maxAmount ? Number(query.maxAmount) : undefined,
  };
}

function passesFilters(row: JournalReportRow, input: JournalReportFilters) {
  const categoryId = row.category?.id ?? null;
  const accountId = row.reportAccount?.id ?? null;
  const tagIds = row.tags.map((tag) => tag.id);
  const amount = Math.abs(row.signedAmount);

  if (row.reportAccount?.excludeFromReports) return false;
  if (input.categoryIds?.length && (!categoryId || !input.categoryIds.includes(categoryId))) return false;
  if (input.accountIds?.length && (!accountId || !input.accountIds.includes(accountId))) return false;
  if (input.tagIds?.length && !tagIds.some((tagId) => input.tagIds?.includes(tagId))) return false;
  if (input.excludeCategoryIds?.length && categoryId && input.excludeCategoryIds.includes(categoryId)) return false;
  if (input.excludeAccountIds?.length && accountId && input.excludeAccountIds.includes(accountId)) return false;
  if (input.minAmount != null && amount < input.minAmount) return false;
  if (input.maxAmount != null && amount > input.maxAmount) return false;
  return true;
}

function isTransferLikeReportRow(row: JournalReportRow) {
  return row.transactionType === 'transfer' || row.category?.type === 'transfer';
}

function rowsForMode(rows: JournalReportRow[], input: JournalGroupedReportInput) {
  return rows.filter((row) => {
    if (!dateInRange(row.date, input)) return false;
    if (!passesFilters(row, input)) return false;
    if (isTransferLikeReportRow(row)) return false;
    if (row.category?.type === 'investment') return false;
    if (input.mode === 'income') {
      return row.signedAmount > 0 && (!row.category || row.category.type === 'income');
    }
    return row.signedAmount < 0;
  });
}

function groupTargets(row: JournalReportRow, groupBy: JournalReportGroupBy) {
  if (groupBy === 'category') {
    return [{
      id: row.category?.id ?? '__uncategorized__',
      name: row.category?.name ?? 'Uncategorized',
      icon: row.category?.icon ?? null,
      color: null,
    }];
  }
  if (groupBy === 'account') {
    return [{
      id: row.reportAccount?.id ?? '__unknown__',
      name: row.reportAccount?.name ?? 'Unknown',
      icon: null,
      color: null,
    }];
  }
  if (groupBy === 'tag') {
    if (!row.tags.length) {
      return [{ id: '__untagged__', name: 'Untagged', icon: null, color: null }];
    }
    return row.tags.map((tag) => ({ id: tag.id, name: tag.name, icon: null, color: tag.color }));
  }
  return [{
    id: row.description || '__unknown__',
    name: row.description || 'Unknown',
    icon: null,
    color: null,
  }];
}

export function buildJournalGroupedReport(rows: JournalReportRow[], input: JournalGroupedReportInput) {
  const filtered = rowsForMode(rows, input);
  const total = roundMoney(filtered.reduce((sum, row) => sum + Math.abs(row.signedAmount), 0));
  const average = filtered.length ? total / filtered.length : 0;
  const groupMap = new Map<string, { id: string; name: string; icon: string | null; color: string | null; amount: number; count: number }>();

  for (const row of filtered) {
    for (const target of groupTargets(row, input.groupBy)) {
      const existing = groupMap.get(target.id);
      if (existing) {
        existing.amount += Math.abs(row.signedAmount);
        existing.count += 1;
      } else {
        groupMap.set(target.id, { ...target, amount: Math.abs(row.signedAmount), count: 1 });
      }
    }
  }

  const largestRow = filtered.reduce<JournalReportRow | null>((largest, row) => {
    if (!largest) return row;
    return Math.abs(row.signedAmount) > Math.abs(largest.signedAmount) ? row : largest;
  }, null);

  const sortedDates = filtered.map((row) => row.date.getTime()).sort((a, b) => a - b);

  return {
    reportType: input.mode === 'income' ? 'standard' : 'category',
    period: classifyReportPeriod(input.start, input.end),
    total,
    grossTotal: total,
    startDate: input.start.toISOString(),
    endDate: input.end.toISOString(),
    groupBy: input.groupBy,
    items: Array.from(groupMap.values())
      .sort((a, b) => b.amount - a.amount)
      .map((item) => ({
        id: item.id,
        name: item.name,
        icon: item.icon,
        color: item.color,
        amount: roundMoney(item.amount),
        grossAmount: roundMoney(item.amount),
        refundAmount: 0,
        percent: total > 0 ? roundMoney((item.amount / total) * 100) : 0,
        transactionCount: item.count,
      })),
    largest: largestRow
      ? {
          merchantName: largestRow.description,
          amount: Math.abs(largestRow.signedAmount),
          date: largestRow.date.toISOString(),
        }
      : null,
    average: roundMoney(average),
    transactionCount: filtered.length,
    firstDate: sortedDates.length ? new Date(sortedDates[0]).toISOString() : null,
    lastDate: sortedDates.length ? new Date(sortedDates[sortedDates.length - 1]).toISOString() : null,
  };
}

export function buildJournalCashflowReport(rows: JournalReportRow[], input: JournalReportRange & JournalReportFilters) {
  const filtered = rows.filter((row) => {
    if (!dateInRange(row.date, input)) return false;
    if (!passesFilters(row, input)) return false;
    if (isTransferLikeReportRow(row)) return false;
    if (row.category?.type === 'investment') return false;
    return true;
  });

  const monthMap = new Map<string, { year: number; month: number; income: number; expenses: number }>();
  let income = 0;
  let expenses = 0;

  for (const row of filtered) {
    const key = monthKey(row.date);
    if (!monthMap.has(key)) {
      monthMap.set(key, { year: row.date.getFullYear(), month: row.date.getMonth() + 1, income: 0, expenses: 0 });
    }
    const bucket = monthMap.get(key)!;
    if (row.signedAmount > 0) {
      income += row.signedAmount;
      bucket.income += row.signedAmount;
    } else if (row.signedAmount < 0) {
      expenses += Math.abs(row.signedAmount);
      bucket.expenses += Math.abs(row.signedAmount);
    }
  }

  const net = income - expenses;
  const byMonth = Array.from(monthMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, value]) => ({
      year: value.year,
      month: value.month,
      income: roundMoney(value.income),
      expenses: roundMoney(value.expenses),
      net: roundMoney(value.income - value.expenses),
    }));

  return {
    reportType: 'standard' as const,
    period: classifyReportPeriod(input.start, input.end),
    startDate: input.start.toISOString(),
    endDate: input.end.toISOString(),
    income: roundMoney(income),
    expenses: roundMoney(expenses),
    net: roundMoney(net),
    savingsRate: income > 0 ? roundMoney(Math.min(100, Math.max(0, (net / income) * 100))) : 0,
    byMonth,
    monthly: byMonth.map((item) => ({
      month: `${MONTH_ABBR[item.month - 1]} ${item.year}`,
      income: item.income,
      expenses: item.expenses,
      net: item.net,
    })),
  };
}

function rowMatchesGroup(row: JournalReportRow, input: JournalDrilldownInput) {
  return groupTargets(row, input.groupBy).some((target) => target.id === input.groupId);
}

export function buildJournalReportDrilldown(rows: JournalReportRow[], input: JournalDrilldownInput) {
  const filtered = rowsForMode(rows, input)
    .filter((row) => rowMatchesGroup(row, input))
    .sort((a, b) => b.date.getTime() - a.date.getTime());

  return {
    transactions: filtered.map((row) => ({
      id: row.id,
      date: row.date.toISOString(),
      description: row.description,
      amount: row.signedAmount,
      isRefund: false,
      category: row.category
        ? { id: row.category.id, name: row.category.name, icon: row.category.icon }
        : null,
      merchant: { id: row.description, name: row.description },
      account: row.reportAccount
        ? { id: row.reportAccount.id, name: row.reportAccount.name }
        : null,
      tags: row.tags,
    })),
    total: filtered.length,
  };
}

export function buildJournalAuditReport(rows: JournalReportRow[]) {
  return {
    reportType: 'audit' as const,
    totalJournals: rows.length,
    unbalancedJournals: rows.filter((row) => Math.abs(row.entryBalance) > 0.0001).length,
    noCategoryJournals: rows.filter((row) => !row.category).length,
    transferJournals: rows.filter((row) => row.transactionType === 'transfer').length,
  };
}

export function buildJournalTaxSummary(rows: JournalReportRow[], year: number, filters: JournalReportFilters = {}) {
  const start = new Date(year, 0, 1);
  const end = new Date(year, 11, 31, 23, 59, 59, 999);
  const spending = rowsForMode(rows, { start, end, mode: 'spending', groupBy: 'category', ...filters })
    .filter((row) => row.category?.isTaxDeductible);
  const byCategory = new Map<string, { id: string; name: string; icon: string | null; amount: number; transactionCount: number }>();

  for (const row of spending) {
    if (!row.category) continue;
    const existing = byCategory.get(row.category.id);
    if (existing) {
      existing.amount += Math.abs(row.signedAmount);
      existing.transactionCount += 1;
    } else {
      byCategory.set(row.category.id, {
        id: row.category.id,
        name: row.category.name,
        icon: row.category.icon,
        amount: Math.abs(row.signedAmount),
        transactionCount: 1,
      });
    }
  }

  const categories = Array.from(byCategory.values())
    .sort((a, b) => b.amount - a.amount)
    .map((item) => ({ ...item, amount: roundMoney(item.amount) }));
  return {
    year,
    totalDeductible: roundMoney(categories.reduce((sum, item) => sum + item.amount, 0)),
    categories,
  };
}

export function buildJournalTagSummary(rows: JournalReportRow[], input: JournalReportRange & JournalReportFilters) {
  const tagMap = new Map<string, { id: string; name: string; color: string | null; income: number; expenses: number; count: number }>();
  const filtered = rows.filter((row) => dateInRange(row.date, input) && passesFilters(row, input) && row.transactionType !== 'transfer');

  for (const row of filtered) {
    for (const tag of row.tags) {
      const existing = tagMap.get(tag.id) ?? { id: tag.id, name: tag.name, color: tag.color, income: 0, expenses: 0, count: 0 };
      if (row.signedAmount > 0) existing.income += row.signedAmount;
      if (row.signedAmount < 0) existing.expenses += Math.abs(row.signedAmount);
      existing.count += 1;
      tagMap.set(tag.id, existing);
    }
  }

  return Array.from(tagMap.values())
    .filter((item) => item.count > 0)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((item) => ({
      ...item,
      income: roundMoney(item.income),
      expenses: roundMoney(item.expenses),
    }));
}

export async function fetchJournalReportRows(
  input: { householdId: string; start?: Date; end?: Date },
  prisma: Pick<PrismaClient, 'transactionJournal'> = defaultPrisma,
): Promise<JournalReportRow[]> {
  const where: Prisma.TransactionJournalWhereInput = {
    householdId: input.householdId,
    isDeleted: false,
    ...(input.start && input.end ? { date: { gte: input.start, lte: input.end } } : {}),
  };

  const journals = await prisma.transactionJournal.findMany({
    where,
    orderBy: [{ date: 'asc' }, { id: 'asc' }],
    include: {
      category: { select: { id: true, name: true, icon: true, type: true, isTaxDeductible: true, excludeFromReports: true } },
      entries: {
        include: {
          account: { select: { id: true, name: true, type: true, excludeFromReports: true } },
        },
      },
      tags: { include: { tag: { select: { id: true, name: true, color: true } } } },
    },
  });

  const journalRows = journals
    .map(mapJournalToReportRow)
    .filter((row) => !row.category?.excludeFromReports);

  return journalRows.sort((a, b) => a.date.getTime() - b.date.getTime() || a.id.localeCompare(b.id));
}
