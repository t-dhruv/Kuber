import type { Prisma, PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { prisma as defaultPrisma } from '../prisma';
import { BENCHMARK_SOURCE_WARNING, benchmarkEntries, benchmarkMonths, mapBenchmarkCategory } from './benchmarks'
import { getQuotes } from '../priceCache';
import { calculateRrspRoom, calculateTfsaRoom } from '../taxRoomCalculator';
import { getAllocation, getDividendForecast } from '../../services/investmentService';
import { computeCashFlowForecast, type CashFlowForecastResult } from '../cashFlowForecast';

export type StandardReportType =
  | 'overview'
  | 'income_vs_expense'
  | 'cash_flow'
  | 'category'
  | 'budget'
  | 'tag'
  | 'account'
  | 'merchant'
  | 'audit'
  | 'net_worth'
  | 'investment'
  | 'benchmarks'
  | 'allocation'
  | 'contribution_room'
  | 'dividend_forecast'
  | 'retirement'
  | 'cash_flow_forecast';

export type StandardGroupBy = 'day' | 'week' | 'month' | 'quarter' | 'year';
export type SortDirection = 'asc' | 'desc';

export interface NormalizedReportQuery {
  reportType: StandardReportType;
  startDate: string;
  endDate: string;
  accountIds: string[];
  categoryIds: string[];
  categoryGroupIds: string[];
  budgetIds: string[];
  tagIds: string[];
  merchantIds: string[];
  transactionTypes: string[];
  groupBy: StandardGroupBy;
  currencyCode?: string;
  includeTransfers: boolean;
  includePending: boolean;
  includeHidden: boolean;
  includeDeleted: boolean;
  includeExcludedFromReports: boolean;
  includeSplits: boolean;
  comparisonMode: 'none' | 'previous_period' | 'previous_year';
  sortBy?: string;
  sortDirection: SortDirection;
  limit: number;
  page: number;
  pageSize: number;
  /** Inclusive lower bound on the absolute Transaction amount. */
  minAmount?: number;
  /** Inclusive upper bound on the absolute Transaction amount. */
  maxAmount?: number;
  /** Case-insensitive substring match against description and merchant name. */
  searchText?: string;
  /** Keep only rows with no Category on the Transaction and none on any Split. */
  onlyUncategorized: boolean;
  /** 'any' applies no reconciliation filter. */
  reconciledState: 'any' | 'reconciled' | 'unreconciled';
}

export interface StandardReportCategory {
  id: string;
  name: string;
  groupId: string | null;
  groupName: string | null;
  excludeFromReports: boolean;
}

export interface StandardReportRow {
  id: string;
  date: Date;
  description: string;
  transactionType: string;
  amountDecimal: Decimal;
  signedAmountDecimal: Decimal;
  currencyCode: string;
  isPending: boolean;
  isHidden: boolean;
  isDeleted: boolean;
  isSplit: boolean;
  isTransfer: boolean;
  category: StandardReportCategory | null;
  merchant: { id: string; name: string } | null;
  account: {
    id: string;
    name: string;
    type: string | null;
    excludeFromReports: boolean;
    excludeFromNetWorth: boolean;
    isHidden: boolean;
    isDeleted: boolean;
  } | null;
  tags: { id: string; name: string; color: string | null }[];
  splits: { id: string; amountDecimal: Decimal; category: StandardReportCategory | null }[];
  reconciled: boolean;
}

export interface StandardBudgetLimitInput {
  id: string;
  name: string;
  categoryId: string | null;
  categoryName: string | null;
  limitAmount: Decimal;
  spentAmount: Decimal;
  rolloverAmount: Decimal;
  periodKey: string;
}

export interface StandardAuditContextInput {
  dismissedDuplicateCount?: number;
  importIssueCount?: number;
  ruleFailureCount?: number;
  accountsExcludedFromReports?: number;
  categoriesExcludedFromReports?: number;
}

export interface StandardWealthInput {
  cashValue: Decimal;
  investmentValue: Decimal;
  manualAssetValue: Decimal;
  manualLiabilityValue: Decimal;
  accountContributions: Array<{ id: string; name: string; value: Decimal }>;
  snapshots: Array<{ date: string; assets: Decimal; liabilities: Decimal; netWorth: Decimal }>;
  /**
   * Manual liabilities split by ManualLiability.type, so the Net Worth report can
   * show the Mortgage / Credit cards / Other liabilities lines the Assets /
   * Liabilities Legacy tab shows. Optional: an older caller that omits it still
   * gets the single manualLiabilityValue total.
   */
  liabilityBreakdown?: Array<{ key: string; label: string; value: Decimal }>;
}

export interface StandardAllocationInput {
  totalValue: Decimal;
  byAssetClass: Array<{
    assetClass: string;
    value: Decimal;
    /** Current weight in percentage points, e.g. 42.5 for 42.5%. */
    percent: Decimal;
    /** Target weight in percentage points. */
    targetPercent: Decimal;
  }>;
}

export interface StandardContributionRoomInput {
  accounts: Array<{
    id: string;
    name: string;
    type: string;
    memberName: string | null;
    contributionsYtd: Decimal;
    totalRoomEver: Decimal;
    roomRemaining: Decimal;
    overContribution: Decimal;
    pctUsed: number;
    alert: 'ok' | 'warning' | 'over';
  }>;
}

export interface StandardDividendForecastInput {
  years: number;
  forecast: Array<{ year: number; income: Decimal }>;
  byHolding: Array<{ symbol: string; name: string; annualIncome: Decimal }>;
  basedOn: string;
}

export interface StandardRetirementInput {
  portfolioValue: Decimal;
  projectionYears: number;
  scenarios: Array<{ label: string; returnRate: number; endingBalance: Decimal }>;
  note: string;
}

export interface StandardCashFlowForecastInput {
  /** The 30/60/90 window the projection was actually run over. */
  days: number;
  /** Days between today and the requested endDate, before clamping. */
  requestedDays: number;
  forecast: CashFlowForecastResult;
}

export interface StandardInvestmentInput {
  holdings: Array<{
    id: string;
    accountId: string;
    accountName: string;
    symbol: string;
    name: string;
    shares: Decimal;
    currentValue: Decimal;
    costBasis: Decimal;
    realizedGainLoss: Decimal;
    assetClass: string;
  }>;
  dividendTotal: Decimal;
  recurringInvestmentCount: number;
}

export type ChartValueFormat = 'currency' | 'percent' | 'number' | 'date';

export interface ChartSeries {
  /** Key into each data row. */
  key: string;
  /** Human label shown in legend and tooltip. */
  label: string;
  format: ChartValueFormat;
  /** Semantic colour role; the client maps these to CSS custom properties. */
  role: 'income' | 'expense' | 'net' | 'budget' | 'actual' | 'neutral' | 'categorical';
  /** Stack group name. Series sharing a group stack together. */
  stack?: string;
}

export interface ChartAxis {
  key: string;
  label: string;
  format: ChartValueFormat;
}

/** Rows for cartesian charts: one object per x-axis position. */
export type ChartRow = Record<string, string | number | null>;

export interface CartesianChartSpec {
  kind: 'line' | 'area' | 'bar' | 'stackedBar' | 'groupedBar' | 'waterfall';
  key: string;
  title: string;
  x: ChartAxis;
  series: ChartSeries[];
  data: ChartRow[];
  /** Optional reference line, e.g. a zero baseline or a budget limit. */
  reference?: { value: number; label: string };
}

export interface PartitionChartSpec {
  kind: 'pie' | 'donut' | 'treemap';
  key: string;
  title: string;
  /** Row key holding the slice label. */
  nameKey: string;
  /** Row key holding the slice magnitude. Always non-negative. */
  valueKey: string;
  format: ChartValueFormat;
  data: ChartRow[];
}

export interface SankeyChartSpec {
  kind: 'sankey';
  key: string;
  title: string;
  format: ChartValueFormat;
  nodes: Array<{ id: string; label: string; column: number; role: 'income' | 'total' | 'bucket' | 'category' }>;
  links: Array<{ source: string; target: string; value: number }>;
}

export interface HeatmapChartSpec {
  kind: 'heatmap';
  key: string;
  title: string;
  xKey: string;
  yKey: string;
  valueKey: string;
  format: ChartValueFormat;
  data: ChartRow[];
}

export type ChartSpec = CartesianChartSpec | PartitionChartSpec | SankeyChartSpec | HeatmapChartSpec;

export interface StandardReportResponse {
  reportType: StandardReportType;
  title: string;
  dateRange: { startDate: string; endDate: string; timezone: string };
  currencyCode: string;
  summaryCards: Array<{
    key: string;
    label: string;
    value: string;
    formattedValue: string;
    change?: { value: number; direction: 'up' | 'down' | 'flat'; label: string };
    drilldown?: Record<string, string>;
  }>;
  charts: ChartSpec[];
  tables: Array<{
    key: string;
    title: string;
    columns: Array<{ key: string; label: string }>;
    rows: Array<Record<string, string | number | null>>;
  }>;
  drilldowns: Array<{ key: string; label: string; params: Record<string, string> }>;
  metadata: {
    generatedAt: string;
    filtersApplied: NormalizedReportQuery;
    warnings: string[];
    calculationNotes: string[];
    dataFreshness: { usesLiveData: boolean; usesReportingRollup: boolean; usesReportingSnapshot: boolean };
  };
}

const ZERO = new Decimal(0);
const HUNDRED = new Decimal(100);
const VALID_REPORT_TYPES = new Set<StandardReportType>([
  'overview',
  'income_vs_expense',
  'cash_flow',
  'category',
  'budget',
  'tag',
  'account',
  'merchant',
  'audit',
  'net_worth',
  'investment',
  'benchmarks',
  'allocation',
  'contribution_room',
  'dividend_forecast',
  'retirement',
  'cash_flow_forecast',
]);
const VALID_GROUP_BY = new Set<StandardGroupBy>(['day', 'week', 'month', 'quarter', 'year']);

function decimal(value: Decimal.Value): Decimal {
  return new Decimal(value);
}

function rowSignedAmount(row: Pick<StandardReportRow, 'signedAmountDecimal'>): Decimal {
  return decimal(row.signedAmountDecimal);
}

function rowAmount(row: Pick<StandardReportRow, 'amountDecimal'>): Decimal {
  return decimal(row.amountDecimal);
}

function money(value: Decimal): string {
  return value.toDecimalPlaces(2).toFixed(2);
}

function formatMoney(value: Decimal, currencyCode: string): string {
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: currencyCode }).format(Number(money(value)));
}

function isPositive(value: Decimal): boolean {
  return value.gt(ZERO);
}

function isNegative(value: Decimal): boolean {
  return value.lt(ZERO);
}

function csv(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value !== 'string' || value.trim() === '') return [];
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

function bool(value: unknown, fallback: boolean): boolean {
  if (value == null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  return String(value).toLowerCase() === 'true';
}

function intInRange(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function optionalNumber(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${field} must be a non-negative number`);
  return parsed;
}

function isoDate(value: unknown, field: string): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${field} is required in YYYY-MM-DD format`);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) throw new Error(`${field} is invalid`);
  return value;
}

export function normalizeReportQuery(input: Record<string, unknown>): NormalizedReportQuery {
  const reportType = String(input.reportType ?? 'overview') as StandardReportType;
  if (!VALID_REPORT_TYPES.has(reportType)) throw new Error('reportType is not supported');
  const startDate = isoDate(input.startDate, 'startDate');
  const endDate = isoDate(input.endDate, 'endDate');
  if (new Date(`${endDate}T00:00:00.000Z`) < new Date(`${startDate}T00:00:00.000Z`)) {
    throw new Error('endDate must be greater than or equal to startDate');
  }
  const groupBy = String(input.groupBy ?? 'month') as StandardGroupBy;
  if (!VALID_GROUP_BY.has(groupBy)) throw new Error('groupBy must be one of: day, week, month, quarter, year');
  const minAmount = optionalNumber(input.minAmount, 'minAmount');
  const maxAmount = optionalNumber(input.maxAmount, 'maxAmount');
  if (minAmount !== undefined && maxAmount !== undefined && maxAmount < minAmount) {
    throw new Error('maxAmount must be greater than or equal to minAmount');
  }

  return {
    reportType,
    startDate,
    endDate,
    accountIds: csv(input.accountIds),
    categoryIds: csv(input.categoryIds),
    categoryGroupIds: csv(input.categoryGroupIds),
    budgetIds: csv(input.budgetIds),
    tagIds: csv(input.tagIds),
    merchantIds: csv(input.merchantIds),
    transactionTypes: csv(input.transactionTypes),
    groupBy,
    currencyCode: typeof input.currencyCode === 'string' && input.currencyCode ? input.currencyCode.toUpperCase() : undefined,
    includeTransfers: bool(input.includeTransfers, false),
    includePending: bool(input.includePending, false),
    includeHidden: bool(input.includeHidden, false),
    includeDeleted: bool(input.includeDeleted, false),
    includeExcludedFromReports: bool(input.includeExcludedFromReports, false),
    includeSplits: bool(input.includeSplits, true),
    comparisonMode: (input.comparisonMode === 'previous_period' || input.comparisonMode === 'previous_year') ? input.comparisonMode : 'none',
    sortBy: typeof input.sortBy === 'string' ? input.sortBy : undefined,
    sortDirection: input.sortDirection === 'asc' ? 'asc' : 'desc',
    limit: intInRange(input.limit, 25, 1, 500),
    page: intInRange(input.page, 1, 1, 100000),
    pageSize: intInRange(input.pageSize, 50, 1, 200),
    minAmount,
    maxAmount,
    searchText: typeof input.searchText === 'string' && input.searchText.trim() ? input.searchText.trim() : undefined,
    onlyUncategorized: bool(input.onlyUncategorized, false),
    reconciledState:
      input.reconciledState === 'reconciled' || input.reconciledState === 'unreconciled'
        ? input.reconciledState
        : 'any',
  };
}

function periodKey(date: Date, groupBy: StandardGroupBy): string {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  if (groupBy === 'year') return String(year);
  if (groupBy === 'quarter') return `${year}-Q${Math.floor((month - 1) / 3) + 1}`;
  if (groupBy === 'week') {
    const first = Date.UTC(year, 0, 1);
    const day = Date.UTC(year, date.getUTCMonth(), date.getUTCDate());
    const week = Math.floor((day - first) / 604800000) + 1;
    return `${year}-W${String(week).padStart(2, '0')}`;
  }
  if (groupBy === 'day') return date.toISOString().slice(0, 10);
  return `${year}-${String(month).padStart(2, '0')}`;
}

function inDateRange(row: StandardReportRow, query: NormalizedReportQuery): boolean {
  const date = row.date.toISOString().slice(0, 10);
  return date >= query.startDate && date <= query.endDate;
}

function baseRows(rows: StandardReportRow[], query: NormalizedReportQuery): StandardReportRow[] {
  return rows.filter((row) => {
    if (!inDateRange(row, query)) return false;
    if (!query.includeDeleted && row.isDeleted) return false;
    if (!query.includeHidden && row.isHidden) return false;
    if (!query.includePending && row.isPending) return false;
    if (!query.includeTransfers && row.isTransfer) return false;
    if (!query.includeExcludedFromReports && row.account?.excludeFromReports) return false;
    if (!query.includeExcludedFromReports && row.category?.excludeFromReports) return false;
    if (query.currencyCode && row.currencyCode !== query.currencyCode) return false;
    if (query.accountIds.length && (!row.account || !query.accountIds.includes(row.account.id))) return false;
    const splitCategories = row.splits.map((split) => split.category).filter((category): category is StandardReportCategory => Boolean(category));
    const categoryIds = [row.category?.id, ...splitCategories.map((category) => category.id)].filter((id): id is string => Boolean(id));
    const categoryGroupIds = [row.category?.groupId, ...splitCategories.map((category) => category.groupId)].filter((id): id is string => Boolean(id));
    if (query.categoryIds.length && !categoryIds.some((id) => query.categoryIds.includes(id))) return false;
    if (query.categoryGroupIds.length && !categoryGroupIds.some((id) => query.categoryGroupIds.includes(id))) return false;
    if (query.tagIds.length && !row.tags.some((tag) => query.tagIds.includes(tag.id))) return false;
    if (query.merchantIds.length && (!row.merchant || !query.merchantIds.includes(row.merchant.id))) return false;
    if (query.transactionTypes.length && !query.transactionTypes.includes(row.transactionType)) return false;
    const magnitude = rowAmount(row);
    if (query.minAmount !== undefined && magnitude.lt(query.minAmount)) return false;
    if (query.maxAmount !== undefined && magnitude.gt(query.maxAmount)) return false;
    if (query.reconciledState === 'reconciled' && !row.reconciled) return false;
    if (query.reconciledState === 'unreconciled' && row.reconciled) return false;
    if (query.onlyUncategorized) {
      const hasCategory = Boolean(row.category) || row.splits.some((split) => Boolean(split.category));
      if (hasCategory) return false;
    }
    if (query.searchText) {
      const needle = query.searchText.toLowerCase();
      const haystack = `${row.description} ${row.merchant?.name ?? ''}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });
}

function metadata(query: NormalizedReportQuery, rows: StandardReportRow[], filtered: StandardReportRow[], generatedAt?: Date) {
  const warnings: string[] = [];
  const excludedPending = rows.filter((row) => inDateRange(row, query) && row.isPending).length;
  const excludedHidden = rows.filter((row) => inDateRange(row, query) && row.isHidden).length;
  const currencies = new Set(filtered.map((row) => row.currencyCode));
  if (!query.includePending && excludedPending) warnings.push(`${excludedPending} pending transaction${excludedPending === 1 ? ' is' : 's are'} excluded. Enable includePending to include ${excludedPending === 1 ? 'it' : 'them'}.`);
  if (!query.includeHidden && excludedHidden) warnings.push(`${excludedHidden} hidden transaction${excludedHidden === 1 ? ' is' : 's are'} excluded. Enable includeHidden to include ${excludedHidden === 1 ? 'it' : 'them'}.`);
  if (currencies.size > 1 && !query.currencyCode) warnings.push('Multiple currencies are present. Totals are grouped by source currency unless a currency filter is applied.');
  if (filtered.some((row) => row.tags.length > 1)) warnings.push('Tag totals may exceed total spending because one transaction can have multiple tags.');
  if (query.searchText) warnings.push(`Results are limited to rows matching "${query.searchText}".`);
  if (query.onlyUncategorized) warnings.push('Results are limited to uncategorized Transactions.');
  if (query.minAmount !== undefined || query.maxAmount !== undefined) {
    warnings.push('Results are limited by an amount range.');
  }
  if (query.reconciledState !== 'any') warnings.push(`Results are limited to ${query.reconciledState} Transactions.`);
  return {
    generatedAt: (generatedAt ?? new Date()).toISOString(),
    filtersApplied: query,
    warnings,
    calculationNotes: ['Live journal data is used; ReportingRollup and ReportingSnapshot are not used for this response.'],
    dataFreshness: { usesLiveData: true, usesReportingRollup: false, usesReportingSnapshot: false },
  };
}

function baseResponse(args: {
  query: NormalizedReportQuery;
  rows: StandardReportRow[];
  filtered: StandardReportRow[];
  title: string;
  generatedAt?: Date;
}): StandardReportResponse {
  const currencyCode = args.query.currencyCode ?? args.filtered[0]?.currencyCode ?? 'USD';
  return {
    reportType: args.query.reportType,
    title: args.title,
    dateRange: { startDate: args.query.startDate, endDate: args.query.endDate, timezone: 'America/Toronto' },
    currencyCode,
    summaryCards: [],
    charts: [],
    tables: [],
    drilldowns: [],
    metadata: metadata(args.query, args.rows, args.filtered, args.generatedAt),
  };
}

function card(key: string, label: string, value: Decimal, currencyCode: string, drilldown?: Record<string, string>) {
  return { key, label, value: money(value), formattedValue: formatMoney(value, currencyCode), drilldown };
}

function categoryAmounts(rows: StandardReportRow[], spendingOnly: boolean, query?: NormalizedReportQuery) {
  const totals = new Map<string, { id: string; name: string; groupName: string | null; amount: Decimal; count: number }>();
  for (const row of rows) {
    const signedAmount = rowSignedAmount(row);
    if (spendingOnly && !isNegative(signedAmount)) continue;
    const sign = isNegative(signedAmount) ? -1 : 1;
    const splits = row.isSplit && row.splits.length ? row.splits : [{ id: row.id, amountDecimal: rowAmount(row), category: row.category }];
    for (const split of splits) {
      if (split.category?.excludeFromReports) continue;
      if (query?.categoryIds.length && (!split.category || !query.categoryIds.includes(split.category.id))) continue;
      if (query?.categoryGroupIds.length && (!split.category?.groupId || !query.categoryGroupIds.includes(split.category.groupId))) continue;
      const id = split.category?.id ?? '__uncategorized__';
      const existing = totals.get(id) ?? {
        id,
        name: split.category?.name ?? 'Uncategorized',
        groupName: split.category?.groupName ?? null,
        amount: ZERO,
        count: 0,
      };
      existing.amount = existing.amount.plus(decimal(split.amountDecimal).abs().times(sign < 0 ? 1 : 1));
      existing.count += 1;
      totals.set(id, existing);
    }
  }
  return Array.from(totals.values()).sort((a, b) => b.amount.comparedTo(a.amount));
}

function standardTableRows(items: Array<{ id: string; name: string; amount: Decimal; count: number }>, currencyCode: string) {
  return items.map((item) => ({
    id: item.id,
    name: item.name,
    amount: money(item.amount),
    formattedAmount: formatMoney(item.amount, currencyCode),
    count: item.count,
  }));
}

export function buildOverviewReport(input: { query: NormalizedReportQuery; rows: StandardReportRow[]; generatedAt?: Date }): StandardReportResponse {
  const filtered = baseRows(input.rows, input.query);
  const response = baseResponse({ ...input, filtered, title: 'Overview Report' });
  const currencyCode = response.currencyCode;
  const income = filtered.reduce((sum, row) => {
    const amount = rowSignedAmount(row);
    return isPositive(amount) ? sum.plus(amount) : sum;
  }, ZERO);
  const expenses = filtered.reduce((sum, row) => {
    const amount = rowSignedAmount(row);
    return isNegative(amount) ? sum.plus(amount.abs()) : sum;
  }, ZERO);
  const net = income.minus(expenses);
  const savingsRate = income.eq(ZERO) ? ZERO : net.div(income).times(HUNDRED);
  const openingBalance = ZERO;
  const closingBalance = net;

  response.summaryCards = [
    card('openingBalance', 'Opening Balance', openingBalance, currencyCode),
    card('closingBalance', 'Closing Balance', closingBalance, currencyCode),
    card('totalIncome', 'Total Income', income, currencyCode, { mode: 'income' }),
    card('totalExpenses', 'Total Expenses', expenses, currencyCode, { mode: 'spending' }),
    card('netCashFlow', 'Net Cash Flow', net, currencyCode),
    { key: 'savingsRate', label: 'Savings Rate', value: savingsRate.toDecimalPlaces(2).toFixed(2), formattedValue: `${savingsRate.toDecimalPlaces(1).toFixed(1)}%` },
  ];

  const trend = periodBuckets(filtered, input.query);
  const spendingByCategory = categoryAmounts(filtered, true, input.query);
  response.charts = [
    {
      kind: 'area',
      key: 'incomeExpenseTrend',
      title: 'Income vs Expenses',
      x: PERIOD_AXIS,
      series: [MONEY_SERIES.income, MONEY_SERIES.expenses],
      data: trend,
    },
    {
      kind: 'donut',
      key: 'spendingByCategory',
      title: 'Spending by Category',
      nameKey: 'name',
      valueKey: 'amount',
      format: 'currency',
      data: spendingByCategory.slice(0, input.query.limit).map((item) => ({
        id: item.id,
        name: item.name,
        amount: money(item.amount),
      })),
    },
    {
      kind: 'bar',
      key: 'netByPeriod',
      title: 'Net by Period',
      x: PERIOD_AXIS,
      series: [MONEY_SERIES.net],
      data: trend,
      reference: { value: 0, label: 'Break even' },
    },
  ];
  response.tables = [
    {
      key: 'topSpendingCategories',
      title: 'Top Spending Categories',
      columns: [{ key: 'name', label: 'Category' }, { key: 'amount', label: 'Amount' }, { key: 'count', label: 'Transactions' }],
      rows: categoryAmounts(filtered, true, input.query).slice(0, input.query.limit).map((item) => ({
        id: item.id,
        name: item.name,
        groupName: item.groupName,
        amount: money(item.amount),
        formattedAmount: formatMoney(item.amount, currencyCode),
        count: item.count,
      })),
    },
    {
      key: 'topMerchants',
      title: 'Top Merchants/Payees',
      columns: [{ key: 'name', label: 'Merchant' }, { key: 'amount', label: 'Amount' }],
      rows: groupedBy(filtered.filter((row) => isNegative(rowSignedAmount(row))), (row) => row.merchant?.id ?? '__none__', (row) => row.merchant?.name ?? 'No merchant')
        .slice(0, input.query.limit)
        .map((item) => ({ id: item.id, name: item.name, amount: money(item.amount), formattedAmount: formatMoney(item.amount, currencyCode), count: item.count })),
    },
  ];
  response.drilldowns = response.tables[0].rows.map((item) => ({
    key: `category-${item.id}`,
    label: `View ${item.name} Transactions`,
    params: { categoryId: String(item.id), startDate: input.query.startDate, endDate: input.query.endDate },
  }));
  return response;
}

const MONEY_SERIES: Record<'income' | 'expenses' | 'net', ChartSeries> = {
  income: { key: 'income', label: 'Income', format: 'currency', role: 'income' },
  expenses: { key: 'expenses', label: 'Expenses', format: 'currency', role: 'expense' },
  net: { key: 'net', label: 'Net', format: 'currency', role: 'net' },
};

const PERIOD_AXIS: ChartAxis = { key: 'period', label: 'Period', format: 'date' };

function groupedBy(rows: StandardReportRow[], idFor: (row: StandardReportRow) => string, nameFor: (row: StandardReportRow) => string) {
  const map = new Map<string, { id: string; name: string; amount: Decimal; count: number }>();
  for (const row of rows) {
    const id = idFor(row);
    const existing = map.get(id) ?? { id, name: nameFor(row), amount: ZERO, count: 0 };
    existing.amount = existing.amount.plus(rowSignedAmount(row).abs());
    existing.count += 1;
    map.set(id, existing);
  }
  return Array.from(map.values()).sort((a, b) => b.amount.comparedTo(a.amount));
}

function periodBuckets(rows: StandardReportRow[], query: NormalizedReportQuery) {
  const buckets = new Map<string, { income: Decimal; expenses: Decimal }>();
  for (const row of rows) {
    const key = periodKey(row.date, query.groupBy);
    const bucket = buckets.get(key) ?? { income: ZERO, expenses: ZERO };
    const amount = rowSignedAmount(row);
    if (isPositive(amount)) bucket.income = bucket.income.plus(amount);
    if (isNegative(amount)) bucket.expenses = bucket.expenses.plus(amount.abs());
    buckets.set(key, bucket);
  }
  return Array.from(buckets.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([period, bucket]) => ({
    period,
    income: money(bucket.income),
    expenses: money(bucket.expenses),
    net: money(bucket.income.minus(bucket.expenses)),
  }));
}

/**
 * Savings rate for one period, as a percentage rounded to two decimals.
 * A period with no income has a rate of 0 rather than NaN or Infinity.
 */
function savingsRateOf(income: Decimal.Value, net: Decimal.Value): number {
  const incomeValue = decimal(income);
  if (!incomeValue.gt(ZERO)) return 0;
  return Number(decimal(net).div(incomeValue).times(HUNDRED).toDecimalPlaces(2).toFixed(2));
}

export function buildIncomeExpenseReport(input: { query: NormalizedReportQuery; rows: StandardReportRow[]; generatedAt?: Date }): StandardReportResponse {
  const filtered = baseRows(input.rows, input.query);
  const response = baseResponse({ ...input, filtered, title: 'Income vs Expense Report' });
  const periods = periodBuckets(filtered, input.query);
  const income = periods.reduce((sum, row) => sum.plus(row.income), ZERO);
  const expenses = periods.reduce((sum, row) => sum.plus(row.expenses), ZERO);
  response.summaryCards = [
    card('totalIncome', 'Total Income', income, response.currencyCode),
    card('totalExpenses', 'Total Expenses', expenses, response.currencyCode),
    card('netAmount', 'Net Amount', income.minus(expenses), response.currencyCode),
  ];
  response.charts = [
    {
      kind: 'groupedBar',
      key: 'incomeExpenseTrend',
      title: 'Income vs Expenses',
      x: PERIOD_AXIS,
      series: [MONEY_SERIES.income, MONEY_SERIES.expenses],
      data: periods,
    },
    {
      kind: 'line',
      key: 'netTrend',
      title: 'Net Trend',
      x: PERIOD_AXIS,
      series: [MONEY_SERIES.net],
      data: periods,
      reference: { value: 0, label: 'Break even' },
    },
  ];
  response.tables = [{ key: 'periods', title: 'Period Totals', columns: [{ key: 'period', label: 'Period' }, { key: 'income', label: 'Income' }, { key: 'expenses', label: 'Expenses' }, { key: 'net', label: 'Net' }], rows: periods }];
  response.drilldowns = periods.map((period) => ({ key: `period-${period.period}`, label: `View ${period.period} Transactions`, params: { period: String(period.period) } }));
  return response;
}

export function buildCashFlowReport(input: { query: NormalizedReportQuery; rows: StandardReportRow[]; generatedAt?: Date }): StandardReportResponse {
  const filtered = baseRows(input.rows, input.query);
  const response = baseResponse({ ...input, filtered, title: 'Cash Flow Report' });
  const periods = periodBuckets(filtered, input.query);
  const periodsWithRate = periods.map((period) => ({ ...period, savingsRate: savingsRateOf(period.income, period.net) }));
  let running = ZERO;
  const runningData = periods.map((period) => {
    running = running.plus(period.net);
    return { period: period.period, net: period.net, runningBalance: money(running) };
  });
  const totalIncome = periods.reduce((sum, row) => sum.plus(row.income), ZERO);
  const totalExpenses = periods.reduce((sum, row) => sum.plus(row.expenses), ZERO);
  const overallSavingsRate = totalIncome.gt(ZERO) ? totalIncome.minus(totalExpenses).div(totalIncome).times(HUNDRED) : ZERO;
  response.summaryCards = [
    card('inflows', 'Inflows', totalIncome, response.currencyCode),
    card('outflows', 'Outflows', totalExpenses, response.currencyCode),
    card('netCashFlow', 'Net Cash Flow', running, response.currencyCode),
    {
      key: 'savingsRate',
      label: 'Savings Rate',
      value: overallSavingsRate.toDecimalPlaces(2).toFixed(2),
      formattedValue: `${overallSavingsRate.toDecimalPlaces(1).toFixed(1)}%`,
    },
  ];
  response.charts = [
    {
      kind: 'stackedBar',
      key: 'cashFlowByPeriod',
      title: 'Cash Flow by Period',
      x: PERIOD_AXIS,
      series: [
        { ...MONEY_SERIES.income, stack: 'flow' },
        { ...MONEY_SERIES.expenses, stack: 'flow' },
      ],
      data: periods,
    },
    {
      kind: 'line',
      key: 'runningCashFlow',
      title: 'Running Cash Flow',
      x: PERIOD_AXIS,
      series: [
        MONEY_SERIES.net,
        { key: 'runningBalance', label: 'Running Balance', format: 'currency', role: 'neutral' },
      ],
      data: runningData,
    },
    {
      kind: 'waterfall',
      key: 'cashFlowWaterfall',
      title: 'Cash Flow Waterfall',
      x: PERIOD_AXIS,
      series: [MONEY_SERIES.net],
      data: runningData,
      reference: { value: 0, label: 'Break even' },
    },
    {
      kind: 'line',
      key: 'savingsRateTrend',
      title: 'Savings Rate',
      x: PERIOD_AXIS,
      series: [{ key: 'savingsRate', label: 'Savings Rate', format: 'percent', role: 'net' }],
      data: periodsWithRate,
      reference: { value: 20, label: '20% target' },
    },
  ];
  response.tables = [{ key: 'cashFlowPeriods', title: 'Cash Flow by Period', columns: [{ key: 'period', label: 'Period' }, { key: 'income', label: 'Inflows' }, { key: 'expenses', label: 'Outflows' }, { key: 'net', label: 'Net' }], rows: periods }];
  return response;
}

export function buildCategoryReport(input: { query: NormalizedReportQuery; rows: StandardReportRow[]; generatedAt?: Date }): StandardReportResponse {
  const filtered = baseRows(input.rows, input.query);
  const response = baseResponse({ ...input, filtered, title: 'Category Report' });
  const spending = categoryAmounts(filtered, true, input.query);
  const income = categoryAmounts(filtered.filter((row) => isPositive(rowSignedAmount(row))), false, input.query);
  const incomeById = new Map(income.map((item) => [item.id, item]));
  const groupMap = new Map<string, { id: string; name: string; spending: Decimal; income: Decimal; count: number }>();

  for (const item of [...spending, ...income]) {
    const id = item.groupName ?? '__ungrouped__';
    const existing = groupMap.get(id) ?? { id, name: item.groupName ?? 'Ungrouped', spending: ZERO, income: ZERO, count: 0 };
    if (spending.includes(item)) existing.spending = existing.spending.plus(item.amount);
    if (income.includes(item)) existing.income = existing.income.plus(item.amount);
    existing.count += item.count;
    groupMap.set(id, existing);
  }

  const totalSpending = spending.reduce((sum, item) => sum.plus(item.amount), ZERO);
  const totalIncome = income.reduce((sum, item) => sum.plus(item.amount), ZERO);
  response.summaryCards = [
    card('categorySpending', 'Category Spending', totalSpending, response.currencyCode),
    card('categoryIncome', 'Category Income', totalIncome, response.currencyCode),
    { key: 'uncategorizedCount', label: 'Uncategorized', value: String(spending.find((item) => item.id === '__uncategorized__')?.count ?? 0), formattedValue: String(spending.find((item) => item.id === '__uncategorized__')?.count ?? 0) },
  ];
  response.charts = [
    {
      kind: 'stackedBar',
      key: 'categoryTrend',
      title: 'Category Trend',
      x: PERIOD_AXIS,
      series: [
        { ...MONEY_SERIES.income, stack: 'flow' },
        { ...MONEY_SERIES.expenses, stack: 'flow' },
      ],
      data: periodBuckets(filtered, input.query),
    },
    {
      kind: 'treemap',
      key: 'categorySpendingShare',
      title: 'Spending Share by Category',
      nameKey: 'name',
      valueKey: 'amount',
      format: 'currency',
      data: spending.slice(0, input.query.limit).map((item) => ({ id: item.id, name: item.name, amount: money(item.amount) })),
    },
    {
      kind: 'donut',
      key: 'categoryIncomeShare',
      title: 'Income Share by Category',
      nameKey: 'name',
      valueKey: 'amount',
      format: 'currency',
      data: income.slice(0, input.query.limit).map((item) => ({ id: item.id, name: item.name, amount: money(item.amount) })),
    },
  ];
  response.tables = [
    {
      key: 'categoryTotals',
      title: 'Category Totals',
      columns: [{ key: 'name', label: 'Category' }, { key: 'groupName', label: 'Group' }, { key: 'spending', label: 'Spending' }, { key: 'income', label: 'Income' }],
      rows: spending.slice(0, input.query.limit).map((item) => ({
        id: item.id,
        name: item.name,
        groupName: item.groupName,
        spending: money(item.amount),
        formattedSpending: formatMoney(item.amount, response.currencyCode),
        income: money(incomeById.get(item.id)?.amount ?? ZERO),
        count: item.count,
      })),
    },
    {
      key: 'categoryGroups',
      title: 'Category Group Rollups',
      columns: [{ key: 'name', label: 'Group' }, { key: 'spending', label: 'Spending' }, { key: 'income', label: 'Income' }],
      rows: Array.from(groupMap.values()).sort((a, b) => b.spending.comparedTo(a.spending)).map((item) => ({
        id: item.id === 'Ungrouped' ? '__ungrouped__' : `group-${item.id.toLowerCase().replace(/\s+/g, '-')}`,
        name: item.name,
        spending: money(item.spending),
        formattedSpending: formatMoney(item.spending, response.currencyCode),
        income: money(item.income),
        count: item.count,
      })),
    },
  ];
  response.drilldowns = response.tables[0].rows.map((item) => ({
    key: `category-${item.id}`,
    label: `View ${item.name} Transactions`,
    params: { categoryId: String(item.id), startDate: input.query.startDate, endDate: input.query.endDate },
  }));
  return response;
}

export function buildBudgetReport(input: { query: NormalizedReportQuery; rows: StandardReportRow[]; budgets?: StandardBudgetLimitInput[]; generatedAt?: Date }): StandardReportResponse {
  const filtered = baseRows(input.rows, input.query);
  const response = baseResponse({ ...input, filtered, title: 'Budget Report' });
  const budgets = (input.budgets ?? []).filter((budget) => !input.query.budgetIds.length || input.query.budgetIds.includes(budget.id));
  const rows = budgets.map((budget) => {
    const available = decimal(budget.limitAmount).plus(budget.rolloverAmount);
    const remaining = available.minus(budget.spentAmount);
    const overBudget = remaining.lt(ZERO) ? remaining.abs() : ZERO;
    const utilization = budget.limitAmount.eq(ZERO) ? 0 : Number(decimal(budget.spentAmount).div(budget.limitAmount).times(HUNDRED).toDecimalPlaces(2).toString());
    return {
      id: budget.id,
      name: budget.name,
      categoryId: budget.categoryId,
      categoryName: budget.categoryName,
      periodKey: budget.periodKey,
      budgeted: money(decimal(budget.limitAmount)),
      actualSpent: money(decimal(budget.spentAmount)),
      rollover: money(decimal(budget.rolloverAmount)),
      remaining: money(remaining),
      overBudget: money(overBudget),
      utilizationPercent: utilization,
    };
  });
  const budgeted = budgets.reduce((sum, item) => sum.plus(item.limitAmount), ZERO);
  const spent = budgets.reduce((sum, item) => sum.plus(item.spentAmount), ZERO);
  const remaining = budgets.reduce((sum, item) => sum.plus(item.limitAmount).plus(item.rolloverAmount).minus(item.spentAmount), ZERO);
  response.summaryCards = [
    card('budgetedAmount', 'Budgeted Amount', budgeted, response.currencyCode),
    card('actualSpent', 'Actual Spent', spent, response.currencyCode),
    card('remainingAmount', 'Remaining Amount', remaining, response.currencyCode),
  ];
  response.tables = [{
    key: 'budgetUtilization',
    title: 'Budget Utilization',
    columns: [{ key: 'name', label: 'Budget' }, { key: 'budgeted', label: 'Budgeted' }, { key: 'actualSpent', label: 'Actual' }, { key: 'remaining', label: 'Remaining' }, { key: 'utilizationPercent', label: 'Utilization' }],
    rows,
  }];
  response.charts = [
    {
      kind: 'groupedBar',
      key: 'budgetVsActual',
      title: 'Budget vs Actual',
      x: { key: 'name', label: 'Budget', format: 'number' },
      series: [
        { key: 'budgeted', label: 'Budgeted', format: 'currency', role: 'budget' },
        { key: 'actualSpent', label: 'Actual', format: 'currency', role: 'actual' },
      ],
      data: rows.map((item) => ({ id: item.id, name: item.name, budgeted: item.budgeted, actualSpent: item.actualSpent })),
    },
    {
      kind: 'bar',
      key: 'budgetUtilization',
      title: 'Budget Utilization',
      x: { key: 'name', label: 'Budget', format: 'number' },
      series: [{ key: 'utilizationPercent', label: 'Utilization', format: 'percent', role: 'categorical' }],
      data: rows.map((item) => ({ id: item.id, name: item.name, utilizationPercent: item.utilizationPercent })),
      reference: { value: 100, label: 'Limit' },
    },
  ];
  response.metadata.calculationNotes.push('Budget report uses existing BudgetLimit values when provided.');
  if (!budgets.length) response.metadata.warnings.push('No BudgetLimit records were found for the selected period. Live budget calculations are not included in this response.');
  return response;
}

export function buildTagReport(input: { query: NormalizedReportQuery; rows: StandardReportRow[]; generatedAt?: Date }): StandardReportResponse {
  const filtered = baseRows(input.rows, input.query);
  const response = baseResponse({ ...input, filtered, title: 'Tag Report' });
  const tagMap = new Map<string, { id: string; name: string; color: string | null; spending: Decimal; income: Decimal; count: number }>();
  for (const row of filtered) {
    for (const tag of row.tags) {
      const existing = tagMap.get(tag.id) ?? { id: tag.id, name: tag.name, color: tag.color, spending: ZERO, income: ZERO, count: 0 };
      const amount = rowSignedAmount(row);
      if (isPositive(amount)) existing.income = existing.income.plus(amount);
      if (isNegative(amount)) existing.spending = existing.spending.plus(amount.abs());
      existing.count += 1;
      tagMap.set(tag.id, existing);
    }
  }
  const rows = Array.from(tagMap.values()).sort((a, b) => b.spending.comparedTo(a.spending) || a.name.localeCompare(b.name));
  response.summaryCards = [
    card('taggedSpending', 'Tagged Spending', rows.reduce((sum, item) => sum.plus(item.spending), ZERO), response.currencyCode),
    card('taggedIncome', 'Tagged Income', rows.reduce((sum, item) => sum.plus(item.income), ZERO), response.currencyCode),
  ];
  response.tables = [{
    key: 'tagTotals',
    title: 'Tag Totals',
    columns: [{ key: 'name', label: 'Tag' }, { key: 'spending', label: 'Spending' }, { key: 'income', label: 'Income' }, { key: 'count', label: 'Transactions' }],
    rows: rows.slice(0, input.query.limit).map((item) => ({ id: item.id, name: item.name, color: item.color, spending: money(item.spending), income: money(item.income), count: item.count })),
  }];
  response.charts = [
    {
      kind: 'stackedBar',
      key: 'tagTrend',
      title: 'Tag Trend',
      x: PERIOD_AXIS,
      series: [
        { ...MONEY_SERIES.income, stack: 'flow' },
        { ...MONEY_SERIES.expenses, stack: 'flow' },
      ],
      data: periodBuckets(filtered, input.query),
    },
    {
      kind: 'donut',
      key: 'tagSpendingShare',
      title: 'Spending Share by Tag',
      nameKey: 'name',
      valueKey: 'spending',
      format: 'currency',
      data: rows.slice(0, input.query.limit).map((item) => ({ id: item.id, name: item.name, spending: money(item.spending) })),
    },
  ];
  response.metadata.calculationNotes.push('Tag share percentages can exceed 100% because one Transaction can carry several tags.');
  return response;
}

export function buildAccountReport(input: { query: NormalizedReportQuery; rows: StandardReportRow[]; generatedAt?: Date }): StandardReportResponse {
  const filtered = baseRows(input.rows, input.query);
  const response = baseResponse({ ...input, filtered, title: 'Account Report' });
  const accountMap = new Map<string, { id: string; name: string; type: string | null; inflow: Decimal; outflow: Decimal; count: number }>();
  for (const row of filtered) {
    const id = row.account?.id ?? '__unknown__';
    const existing = accountMap.get(id) ?? { id, name: row.account?.name ?? 'Unknown', type: row.account?.type ?? null, inflow: ZERO, outflow: ZERO, count: 0 };
    const amount = rowSignedAmount(row);
    if (isPositive(amount)) existing.inflow = existing.inflow.plus(amount);
    if (isNegative(amount)) existing.outflow = existing.outflow.plus(amount.abs());
    existing.count += 1;
    accountMap.set(id, existing);
  }
  const rows = Array.from(accountMap.values()).sort((a, b) => b.outflow.plus(b.inflow).comparedTo(a.outflow.plus(a.inflow)));
  response.summaryCards = [
    card('inflow', 'Inflow', rows.reduce((sum, item) => sum.plus(item.inflow), ZERO), response.currencyCode),
    card('outflow', 'Outflow', rows.reduce((sum, item) => sum.plus(item.outflow), ZERO), response.currencyCode),
    card('netChange', 'Net Change', rows.reduce((sum, item) => sum.plus(item.inflow).minus(item.outflow), ZERO), response.currencyCode),
  ];
  response.tables = [{
    key: 'accountMovement',
    title: 'Account Movement',
    columns: [{ key: 'name', label: 'Account' }, { key: 'inflow', label: 'Inflow' }, { key: 'outflow', label: 'Outflow' }, { key: 'netChange', label: 'Net Change' }],
    rows: rows.map((item) => ({ id: item.id, name: item.name, type: item.type, inflow: money(item.inflow), outflow: money(item.outflow), netChange: money(item.inflow.minus(item.outflow)), count: item.count })),
  }];
  response.charts = [
    {
      kind: 'groupedBar',
      key: 'accountComparison',
      title: 'Account Comparison',
      x: { key: 'name', label: 'Account', format: 'number' },
      series: [
        { key: 'inflow', label: 'Inflow', format: 'currency', role: 'income' },
        { key: 'outflow', label: 'Outflow', format: 'currency', role: 'expense' },
      ],
      data: response.tables[0].rows,
    },
    {
      kind: 'bar',
      key: 'accountNetChange',
      title: 'Net Change by Account',
      x: { key: 'name', label: 'Account', format: 'number' },
      series: [{ key: 'netChange', label: 'Net Change', format: 'currency', role: 'net' }],
      data: response.tables[0].rows,
      reference: { value: 0, label: 'No change' },
    },
  ];
  return response;
}

export function buildMerchantReport(input: { query: NormalizedReportQuery; rows: StandardReportRow[]; generatedAt?: Date }): StandardReportResponse {
  const filtered = baseRows(input.rows, input.query).filter((row) => isNegative(rowSignedAmount(row)));
  const response = baseResponse({ ...input, filtered, title: 'Merchant/Payee Report' });
  const merchants = groupedBy(filtered, (row) => row.merchant?.id ?? '__none__', (row) => row.merchant?.name ?? 'No merchant');
  response.summaryCards = [
    card('merchantSpending', 'Merchant Spending', merchants.reduce((sum, item) => sum.plus(item.amount), ZERO), response.currencyCode),
    { key: 'merchantCount', label: 'Merchants', value: String(merchants.length), formattedValue: String(merchants.length) },
  ];
  response.tables = [{
    key: 'merchantTotals',
    title: 'Merchant Totals',
    columns: [{ key: 'name', label: 'Merchant' }, { key: 'spending', label: 'Spending' }, { key: 'count', label: 'Transactions' }],
    rows: merchants.slice(0, input.query.limit).map((item) => ({ id: item.id, name: item.name, spending: money(item.amount), formattedSpending: formatMoney(item.amount, response.currencyCode), count: item.count })),
  }];
  response.charts = [
    {
      kind: 'stackedBar',
      key: 'merchantTrend',
      title: 'Merchant Trend',
      x: PERIOD_AXIS,
      series: [
        { ...MONEY_SERIES.income, stack: 'flow' },
        { ...MONEY_SERIES.expenses, stack: 'flow' },
      ],
      data: periodBuckets(filtered, input.query),
    },
    {
      kind: 'bar',
      key: 'topMerchants',
      title: 'Top Merchants',
      x: { key: 'name', label: 'Merchant', format: 'number' },
      series: [{ key: 'spending', label: 'Spending', format: 'currency', role: 'expense' }],
      data: merchants.slice(0, input.query.limit).map((item) => ({ id: item.id, name: item.name, spending: money(item.amount) })),
    },
  ];
  return response;
}

export function buildAuditDataQualityReport(input: { query: NormalizedReportQuery; rows: StandardReportRow[]; audit?: StandardAuditContextInput; generatedAt?: Date }): StandardReportResponse {
  const inRangeRows = input.rows.filter((row) => inDateRange(row, input.query));
  const response = baseResponse({ ...input, filtered: inRangeRows, title: 'Audit / Data Quality Report' });
  const largeThreshold = new Decimal(1000);
  const oldPendingCutoff = new Date(`${input.query.endDate}T23:59:59.999Z`);
  oldPendingCutoff.setUTCDate(oldPendingCutoff.getUTCDate() - 30);
  const issueRows = [
    { issueType: 'uncategorized_transactions', label: 'Uncategorized transactions', count: inRangeRows.filter((row) => !row.category && !row.isTransfer).length, severity: 'warning', drilldownAction: 'categoryId=__uncategorized__' },
    { issueType: 'transactions_without_merchant', label: 'Transactions without merchant/payee', count: inRangeRows.filter((row) => !row.merchant && !row.isTransfer).length, severity: 'info', drilldownAction: 'merchantId=__none__' },
    { issueType: 'transactions_without_tags', label: 'Transactions without tags', count: inRangeRows.filter((row) => row.tags.length === 0 && !row.isTransfer).length, severity: 'info', drilldownAction: 'tagId=__untagged__' },
    { issueType: 'large_unusual_transactions', label: 'Large unusual transactions', count: inRangeRows.filter((row) => rowAmount(row).gte(largeThreshold)).length, severity: 'warning', drilldownAction: 'amount=large' },
    { issueType: 'old_pending_transactions', label: 'Old pending transactions', count: inRangeRows.filter((row) => row.isPending && row.date < oldPendingCutoff).length, severity: 'warning', drilldownAction: 'status=pending' },
    { issueType: 'hidden_transactions', label: 'Hidden transactions', count: inRangeRows.filter((row) => row.isHidden).length, severity: 'info', drilldownAction: 'includeHidden=true' },
    { issueType: 'deleted_transactions', label: 'Deleted transactions', count: inRangeRows.filter((row) => row.isDeleted).length, severity: 'info', drilldownAction: 'includeDeleted=true' },
    { issueType: 'unreconciled_transactions', label: 'Unreconciled transactions', count: inRangeRows.filter((row) => !row.reconciled).length, severity: 'info', drilldownAction: 'reconciled=false' },
    { issueType: 'dismissed_duplicates', label: 'Dismissed duplicates', count: input.audit?.dismissedDuplicateCount ?? 0, severity: 'info', drilldownAction: 'issue=dismissed_duplicates' },
    { issueType: 'import_inconsistencies', label: 'Import inconsistencies', count: input.audit?.importIssueCount ?? 0, severity: 'warning', drilldownAction: 'issue=imports' },
    { issueType: 'rule_execution_failures', label: 'Rule execution failures', count: input.audit?.ruleFailureCount ?? 0, severity: 'warning', drilldownAction: 'issue=rules' },
    { issueType: 'accounts_excluded_from_reports', label: 'Accounts excluded from reports', count: input.audit?.accountsExcludedFromReports ?? 0, severity: 'info', drilldownAction: 'issue=excluded_accounts' },
    { issueType: 'categories_excluded_from_reports', label: 'Categories excluded from reports', count: input.audit?.categoriesExcludedFromReports ?? 0, severity: 'info', drilldownAction: 'issue=excluded_categories' },
  ].filter((item) => item.count > 0);
  const totalIssues = issueRows.reduce((sum, item) => sum + item.count, 0);

  response.summaryCards = [
    { key: 'totalIssues', label: 'Total Issues', value: String(totalIssues), formattedValue: String(totalIssues) },
    { key: 'actionableIssueTypes', label: 'Issue Types', value: String(issueRows.length), formattedValue: String(issueRows.length) },
  ];
  response.charts = [
    {
      kind: 'bar',
      key: 'auditIssueCounts',
      title: 'Issues by Type',
      x: { key: 'label', label: 'Issue', format: 'number' },
      series: [{ key: 'count', label: 'Count', format: 'number', role: 'categorical' }],
      data: issueRows.map((item) => ({ id: item.issueType, label: item.label, count: item.count })),
    },
  ];
  response.tables = [{
    key: 'auditIssues',
    title: 'Audit Issues',
    columns: [{ key: 'label', label: 'Issue' }, { key: 'count', label: 'Count' }, { key: 'severity', label: 'Severity' }, { key: 'drilldownAction', label: 'Action' }],
    rows: issueRows,
  }];
  response.drilldowns = issueRows.map((item) => ({
    key: `audit-${item.issueType}`,
    label: `Review ${item.label}`,
    params: { issueType: item.issueType, startDate: input.query.startDate, endDate: input.query.endDate },
  }));
  response.metadata.calculationNotes.push('Audit report issue counts are actionable and map to drill-down parameters where source transactions are available.');
  return response;
}

export function buildNetWorthReport(input: { query: NormalizedReportQuery; rows: StandardReportRow[]; wealth?: StandardWealthInput; generatedAt?: Date }): StandardReportResponse {
  const response = baseResponse({ ...input, filtered: [], title: 'Net Worth Report' });
  const wealth = input.wealth;
  const totalAssets = wealth ? wealth.cashValue.plus(wealth.investmentValue).plus(wealth.manualAssetValue) : ZERO;
  const totalLiabilities = wealth?.manualLiabilityValue ?? ZERO;
  const netWorth = totalAssets.minus(totalLiabilities);
  response.summaryCards = [
    card('totalAssets', 'Total Assets', totalAssets, response.currencyCode),
    card('totalLiabilities', 'Total Liabilities', totalLiabilities, response.currencyCode),
    card('netWorth', 'Net Worth', netWorth, response.currencyCode),
    card('cashValue', 'Cash Value', wealth?.cashValue ?? ZERO, response.currencyCode),
    card('investmentValue', 'Investment Value', wealth?.investmentValue ?? ZERO, response.currencyCode),
    card('manualAssetValue', 'Manual Assets', wealth?.manualAssetValue ?? ZERO, response.currencyCode),
    card('manualLiabilityValue', 'Manual Liabilities', wealth?.manualLiabilityValue ?? ZERO, response.currencyCode),
  ];
  const snapshots = (wealth?.snapshots ?? []).map((snapshot) => ({
    date: snapshot.date,
    assets: money(snapshot.assets),
    liabilities: money(snapshot.liabilities),
    netWorth: money(snapshot.netWorth),
  }));
  response.charts = [
    {
      kind: 'area',
      key: 'netWorthTrend',
      title: 'Net Worth Trend',
      x: { key: 'date', label: 'Date', format: 'date' },
      series: [
        { key: 'assets', label: 'Assets', format: 'currency', role: 'income' },
        { key: 'liabilities', label: 'Liabilities', format: 'currency', role: 'expense' },
        { key: 'netWorth', label: 'Net Worth', format: 'currency', role: 'net' },
      ],
      data: snapshots,
    },
    {
      kind: 'donut',
      key: 'netWorthComposition',
      title: 'Net Worth Composition',
      nameKey: 'name',
      valueKey: 'value',
      format: 'currency',
      data: [
        { name: 'Cash', value: money(wealth?.cashValue ?? ZERO) },
        { name: 'Investments', value: money(wealth?.investmentValue ?? ZERO) },
        { name: 'Manual Assets', value: money(wealth?.manualAssetValue ?? ZERO) },
      ],
    },
  ];
  // Assets / Liabilities breakdown, absorbed from the Legacy Assets / Liabilities
  // tab (client/src/pages/reports/components/AssetsLiabilitiesSection.tsx).
  const assetBreakdown = [
    { key: 'cash', label: 'Cash & bank', value: wealth?.cashValue ?? ZERO },
    { key: 'investments', label: 'Investments', value: wealth?.investmentValue ?? ZERO },
    { key: 'manualAssets', label: 'Other assets', value: wealth?.manualAssetValue ?? ZERO },
  ];
  const liabilityBreakdown = wealth?.liabilityBreakdown?.length
    ? wealth.liabilityBreakdown
    : [{ key: 'other', label: 'Other liabilities', value: totalLiabilities }];
  response.charts.push({
    kind: 'groupedBar',
    key: 'assetsVsLiabilities',
    title: 'Assets vs Liabilities by Account Category',
    x: { key: 'category', label: 'Category', format: 'number' },
    series: [
      { key: 'assets', label: 'Assets', format: 'currency', role: 'income' },
      { key: 'liabilities', label: 'Liabilities', format: 'currency', role: 'expense' },
    ],
    data: [
      ...assetBreakdown.map((item) => ({ category: item.label, assets: money(item.value), liabilities: money(ZERO) })),
      ...liabilityBreakdown.map((item) => ({ category: item.label, assets: money(ZERO), liabilities: money(item.value) })),
    ],
  });
  response.tables = [{
    key: 'accountContribution',
    title: 'Account Contribution to Net Worth',
    columns: [{ key: 'name', label: 'Account' }, { key: 'value', label: 'Value' }],
    rows: (wealth?.accountContributions ?? []).map((item) => ({ id: item.id, name: item.name, value: money(item.value), formattedValue: formatMoney(item.value, response.currencyCode) })),
  }, {
    key: 'assetBreakdown',
    title: 'Assets',
    columns: [{ key: 'label', label: 'Asset' }, { key: 'value', label: 'Value' }],
    rows: assetBreakdown.map((item) => ({ id: item.key, label: item.label, value: money(item.value), formattedValue: formatMoney(item.value, response.currencyCode) })),
  }, {
    key: 'liabilityBreakdown',
    title: 'Liabilities',
    columns: [{ key: 'label', label: 'Liability' }, { key: 'value', label: 'Value' }],
    rows: liabilityBreakdown.map((item) => ({ id: item.key, label: item.label, value: money(item.value), formattedValue: formatMoney(item.value, response.currencyCode) })),
  }];
  if (!wealth) response.metadata.warnings.push('No net worth snapshot or wealth context was available for the selected period.');
  noteWealthOnlyFilters(response, input.query, 'Account, Snapshot, manual asset and manual liability data');
  return response;
}

/**
 * These reports are not functions of StandardReportRow[], so most of the standard
 * filter set cannot touch them. Say so, and warn when the request carries a filter
 * that was ignored, rather than silently dropping it.
 */
function noteWealthOnlyFilters(response: StandardReportResponse, query: NormalizedReportQuery, sources: string) {
  response.metadata.calculationNotes.push(`This report reads ${sources}. Category, tag, merchant, amount and search filters do not apply to it.`);
  if (query.categoryIds.length || query.categoryGroupIds.length || query.tagIds.length || query.merchantIds.length || query.searchText) {
    response.metadata.warnings.push('Some active filters do not apply to this report and were ignored.');
  }
}

export function buildInvestmentReport(input: { query: NormalizedReportQuery; rows: StandardReportRow[]; investments?: StandardInvestmentInput; generatedAt?: Date }): StandardReportResponse {
  const response = baseResponse({ ...input, filtered: [], title: 'Investment Report' });
  const investments = input.investments;
  const currentValue = (investments?.holdings ?? []).reduce((sum, item) => sum.plus(item.currentValue), ZERO);
  const costBasis = (investments?.holdings ?? []).reduce((sum, item) => sum.plus(item.costBasis), ZERO);
  const unrealizedGainLoss = currentValue.minus(costBasis);
  const realizedGainLoss = (investments?.holdings ?? []).reduce((sum, item) => sum.plus(item.realizedGainLoss ?? ZERO), ZERO);
  response.summaryCards = [
    card('currentValue', 'Current Value', currentValue, response.currencyCode),
    card('costBasis', 'Cost Basis', costBasis, response.currencyCode),
    card('unrealizedGainLoss', 'Unrealized Gain/Loss', unrealizedGainLoss, response.currencyCode),
    card('realizedGainLoss', 'Realized Gain/Loss', realizedGainLoss, response.currencyCode),
    card('dividends', 'Dividends', investments?.dividendTotal ?? ZERO, response.currencyCode),
    { key: 'recurringInvestmentCount', label: 'Recurring Investments', value: String(investments?.recurringInvestmentCount ?? 0), formattedValue: String(investments?.recurringInvestmentCount ?? 0) },
  ];
  response.tables = [{
    key: 'holdings',
    title: 'Holdings',
    columns: [{ key: 'symbol', label: 'Symbol' }, { key: 'name', label: 'Name' }, { key: 'accountName', label: 'Account' }, { key: 'currentValue', label: 'Current Value' }, { key: 'costBasis', label: 'Cost Basis' }, { key: 'unrealizedGainLoss', label: 'Unrealized Gain/Loss' }, { key: 'realizedGainLoss', label: 'Realized Gain/Loss' }],
    rows: (investments?.holdings ?? []).map((item) => ({
      id: item.id,
      symbol: item.symbol,
      name: item.name,
      accountId: item.accountId,
      accountName: item.accountName,
      assetClass: item.assetClass,
      shares: item.shares.toString(),
      currentValue: money(item.currentValue),
      costBasis: money(item.costBasis),
      unrealizedGainLoss: money(item.currentValue.minus(item.costBasis)),
      realizedGainLoss: money(item.realizedGainLoss ?? ZERO),
    })),
  }];
  const holdings = investments?.holdings ?? [];
  response.charts = [
    {
      kind: 'donut',
      key: 'allocationByAssetClass',
      title: 'Allocation by Asset Class',
      nameKey: 'name',
      valueKey: 'value',
      format: 'currency',
      data: Array.from(
        holdings.reduce((map, holding) => {
          const current = map.get(holding.assetClass) ?? ZERO;
          return map.set(holding.assetClass, current.plus(holding.currentValue));
        }, new Map<string, Decimal>()),
      ).map(([name, value]) => ({ name, value: money(value) })),
    },
    {
      kind: 'bar',
      key: 'holdingGainLoss',
      title: 'Unrealized Gain/Loss by Holding',
      x: { key: 'symbol', label: 'Symbol', format: 'number' },
      series: [{ key: 'unrealizedGainLoss', label: 'Unrealized Gain/Loss', format: 'currency', role: 'net' }],
      data: holdings.map((holding) => ({
        id: holding.id,
        symbol: holding.symbol,
        unrealizedGainLoss: money(holding.currentValue.minus(holding.costBasis)),
      })),
      reference: { value: 0, label: 'Break even' },
    },
  ];
  response.metadata.warnings.push('Investment performance excludes TWR/MWR return calculations until portfolio cash-flow timing is audited.');
  response.metadata.calculationNotes.push('Realized gain/loss uses confirmed sell lots with stored realizedGainDecimal in the selected date range.');
  return response;
}

export function buildReportDrilldown(input: { query: NormalizedReportQuery; rows: StandardReportRow[]; params: Record<string, string | undefined> }) {
  const filtered = baseRows(input.rows, input.query).filter((row) => {
    if (input.params.categoryId && row.category?.id !== input.params.categoryId && !row.splits.some((split) => split.category?.id === input.params.categoryId)) return false;
    if (input.params.accountId && row.account?.id !== input.params.accountId) return false;
    if (input.params.merchantId && row.merchant?.id !== input.params.merchantId) return false;
    if (input.params.tagId && !row.tags.some((tag) => tag.id === input.params.tagId)) return false;
    if (input.params.transactionType && row.transactionType !== input.params.transactionType) return false;
    return true;
  });
  const start = (input.query.page - 1) * input.query.pageSize;
  const items = filtered
    .sort((a, b) => b.date.getTime() - a.date.getTime() || b.id.localeCompare(a.id))
    .slice(start, start + input.query.pageSize)
    .map((row) => ({
      ...drilldownRow(row, input.params),
    }));
  return { items, total: filtered.length, page: input.query.page, pageSize: input.query.pageSize };
}

function drilldownRow(row: StandardReportRow, params: Record<string, string | undefined>) {
  const signedAmount = rowSignedAmount(row);
  const matchedSplitAmount = params.categoryId
    ? row.splits
        .filter((split) => split.category?.id === params.categoryId)
        .reduce((sum, split) => sum.plus(decimal(split.amountDecimal)), ZERO)
    : null;
  const matchedAmount = matchedSplitAmount && matchedSplitAmount.gt(ZERO)
    ? (isNegative(signedAmount) ? matchedSplitAmount.times(-1) : matchedSplitAmount)
    : signedAmount;
  return {
    id: row.id,
    date: row.date.toISOString(),
    description: row.description,
    amountDecimal: money(signedAmount),
    matchedAmountDecimal: money(matchedAmount),
    currencyCode: row.currencyCode,
    account: row.account ? { id: row.account.id, name: row.account.name } : null,
    category: row.category ? { id: row.category.id, name: row.category.name } : null,
    merchant: row.merchant ? { id: row.merchant.id, name: row.merchant.name } : null,
    tags: row.tags,
    isPending: row.isPending,
    isHidden: row.isHidden,
    isReconciled: row.reconciled,
    splits: row.splits.map((split) => ({
      id: split.id,
      amountDecimal: money(decimal(split.amountDecimal)),
      category: split.category ? { id: split.category.id, name: split.category.name } : null,
    })),
  };
}

export function buildBenchmarksReport(input: { query: NormalizedReportQuery; rows: StandardReportRow[]; generatedAt?: Date }): StandardReportResponse {
  const filtered = baseRows(input.rows, input.query);
  const response = baseResponse({ ...input, filtered, title: 'Benchmarks Report' });
  const currencyCode = response.currencyCode;
  const months = benchmarkMonths(input.query.startDate, input.query.endDate);

  const actuals = new Map<string, Decimal>();
  for (const item of categoryAmounts(filtered, true, input.query)) {
    const key = mapBenchmarkCategory(item.name);
    actuals.set(key, (actuals.get(key) ?? ZERO).plus(item.amount));
  }

  const comparisons = benchmarkEntries().map((entry) => {
    const yours = actuals.get(entry.key) ?? ZERO;
    const benchmark = new Decimal(entry.monthlyAvg).times(months);
    return { entry, yours, benchmark, variance: yours.minus(benchmark) };
  });

  const totalYours = comparisons.reduce((sum, item) => sum.plus(item.yours), ZERO);
  const totalBenchmark = comparisons.reduce((sum, item) => sum.plus(item.benchmark), ZERO);

  response.summaryCards = [
    card('householdSpending', 'Your Spending', totalYours, currencyCode),
    card('benchmarkSpending', 'Benchmark Spending', totalBenchmark, currencyCode),
    card('benchmarkDifference', 'Difference', totalYours.minus(totalBenchmark), currencyCode),
  ];

  const comparisonRows = comparisons.map((item) => ({
    key: item.entry.key,
    label: item.entry.label,
    yours: money(item.yours),
    yoursMonthlyAvg: money(item.yours.div(months)),
    benchmark: money(item.benchmark),
    benchmarkMonthlyAvg: money(new Decimal(item.entry.monthlyAvg)),
    benchmarkPctOfIncome: item.entry.pctOfIncome,
    variance: money(item.variance),
  }));

  response.charts = [
    {
      kind: 'groupedBar',
      key: 'benchmarkComparison',
      title: 'Your Spending vs Benchmark',
      x: { key: 'label', label: 'Benchmark', format: 'date' },
      series: [
        { key: 'yours', label: 'Yours', format: 'currency', role: 'actual' },
        { key: 'benchmark', label: 'Benchmark', format: 'currency', role: 'budget' },
      ],
      data: comparisonRows,
    },
    {
      kind: 'bar',
      key: 'benchmarkVariance',
      title: 'Variance vs Benchmark',
      x: { key: 'label', label: 'Benchmark', format: 'date' },
      series: [{ key: 'variance', label: 'Variance', format: 'currency', role: 'net' }],
      data: comparisonRows,
      reference: { value: 0, label: 'On benchmark' },
    },
  ];

  response.tables = [{
    key: 'benchmarkComparison',
    title: 'Benchmark Comparison',
    columns: [
      { key: 'label', label: 'Benchmark' },
      { key: 'yours', label: 'Your Total' },
      { key: 'yoursMonthlyAvg', label: 'Your Monthly Average' },
      { key: 'benchmark', label: 'Benchmark Total' },
      { key: 'benchmarkMonthlyAvg', label: 'Benchmark Monthly Average' },
      { key: 'variance', label: 'Variance' },
    ],
    rows: comparisonRows,
  }];

  response.metadata.warnings.push(BENCHMARK_SOURCE_WARNING);
  response.metadata.calculationNotes.push(`Benchmark totals cover ${months} month${months === 1 ? '' : 's'} of the selected date range.`);
  return response;
}

type StandardReportGenerator = (input: {
  query: NormalizedReportQuery;
  rows: StandardReportRow[];
  budgets?: StandardBudgetLimitInput[];
  audit?: StandardAuditContextInput;
  wealth?: StandardWealthInput;
  investments?: StandardInvestmentInput;
  allocation?: StandardAllocationInput;
  contributionRoom?: StandardContributionRoomInput;
  dividendForecast?: StandardDividendForecastInput;
  retirement?: StandardRetirementInput;
  cashFlowForecast?: StandardCashFlowForecastInput;
  generatedAt?: Date;
}) => StandardReportResponse;

export const standardReportRegistry: Partial<Record<StandardReportType, StandardReportGenerator>> = {
  overview: buildOverviewReport,
  income_vs_expense: buildIncomeExpenseReport,
  cash_flow: buildCashFlowReport,
  category: buildCategoryReport,
  budget: buildBudgetReport,
  tag: buildTagReport,
  account: buildAccountReport,
  merchant: buildMerchantReport,
  audit: buildAuditDataQualityReport,
  net_worth: buildNetWorthReport,
  investment: buildInvestmentReport,
  benchmarks: buildBenchmarksReport,
  allocation: buildAllocationReport,
  contribution_room: buildContributionRoomReport,
  dividend_forecast: buildDividendForecastReport,
  retirement: buildRetirementReport,
  cash_flow_forecast: buildCashFlowForecastReport,
};

function reportAccountForJournal(journal: {
  transactionType: string;
  entries: Array<{
    accountId: string;
    amountDecimal: Decimal.Value;
    account: StandardReportRow['account'];
  }>;
}): StandardReportRow['account'] {
  const entries = journal.entries ?? [];
  const selected = journal.transactionType === 'deposit'
    ? entries.find((entry) => decimal(entry.amountDecimal).gt(ZERO))
    : entries.find((entry) => decimal(entry.amountDecimal).lt(ZERO));
  return selected?.account ?? entries[0]?.account ?? null;
}

function signedAmountForJournal(journal: { transactionType: string; amountDecimal: Decimal.Value }): Decimal {
  const amount = decimal(journal.amountDecimal).abs();
  return journal.transactionType === 'deposit' ? amount : amount.times(-1);
}

function normalizeTags(journal: {
  tags?: Array<{ tag: { id: string; name: string; color: string | null } }>;
  transactionTags?: Array<{ tag: { id: string; name: string; color: string | null } }>;
}) {
  const tagMap = new Map<string, { id: string; name: string; color: string | null }>();
  for (const link of [...(journal.tags ?? []), ...(journal.transactionTags ?? [])]) {
    tagMap.set(link.tag.id, { id: link.tag.id, name: link.tag.name, color: link.tag.color ?? null });
  }
  return Array.from(tagMap.values());
}

export async function fetchStandardReportRows(
  input: { householdId: string; startDate: string; endDate: string },
  prisma: Pick<PrismaClient, 'transactionJournal'> = defaultPrisma,
): Promise<StandardReportRow[]> {
  const start = new Date(`${input.startDate}T00:00:00.000Z`);
  const end = new Date(`${input.endDate}T23:59:59.999Z`);
  const journals = await prisma.transactionJournal.findMany({
    where: {
      householdId: input.householdId,
      date: { gte: start, lte: end },
    },
    orderBy: [{ date: 'asc' }, { id: 'asc' }],
    include: {
      category: { select: { id: true, name: true, groupId: true, excludeFromReports: true, group: { select: { id: true, name: true } } } },
      merchant: { select: { id: true, displayName: true } },
      entries: {
        include: {
          account: {
            select: {
              id: true,
              name: true,
              type: true,
              excludeFromReports: true,
              excludeFromNetWorth: true,
              isHidden: true,
              isDeleted: true,
            },
          },
        },
      },
      tags: { include: { tag: { select: { id: true, name: true, color: true } } } },
      transactionTags: { include: { tag: { select: { id: true, name: true, color: true } } } },
      splits: {
        include: {
          category: { select: { id: true, name: true, groupId: true, excludeFromReports: true, group: { select: { id: true, name: true } } } },
        },
      },
    },
  });

  return journals.map((journal) => {
    const category = journal.category
      ? {
          id: journal.category.id,
          name: journal.category.name,
          groupId: journal.category.groupId ?? null,
          groupName: journal.category.group?.name ?? null,
          excludeFromReports: Boolean(journal.category.excludeFromReports),
        }
      : null;
    return {
      id: journal.id,
      date: journal.date,
      description: journal.description,
      transactionType: journal.transactionType,
      amountDecimal: decimal(journal.amountDecimal),
      signedAmountDecimal: signedAmountForJournal(journal),
      currencyCode: journal.currencyCode,
      isPending: journal.isPending,
      isHidden: journal.isHidden,
      isDeleted: journal.isDeleted,
      isSplit: journal.isSplit,
      isTransfer: journal.transactionType === 'transfer' || category?.groupName === 'Transfer',
      category,
      merchant: journal.merchant ? { id: journal.merchant.id, name: journal.merchant.displayName } : null,
      account: reportAccountForJournal(journal),
      tags: normalizeTags(journal),
      splits: journal.splits.map((split) => ({
        id: split.id,
        amountDecimal: decimal(split.amountDecimal),
        category: split.category
          ? {
              id: split.category.id,
              name: split.category.name,
              groupId: split.category.groupId ?? null,
              groupName: split.category.group?.name ?? null,
              excludeFromReports: Boolean(split.category.excludeFromReports),
            }
          : null,
      })),
      reconciled: journal.isReconciled,
    };
  });
}

export function monthPeriodKeys(startDate: string, endDate: string): string[] {
  const keys: string[] = [];
  const cursor = new Date(`${startDate.slice(0, 7)}-01T00:00:00.000Z`);
  const end = new Date(`${endDate.slice(0, 7)}-01T00:00:00.000Z`);
  while (cursor <= end) {
    keys.push(`${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`);
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return keys;
}

export async function fetchStandardBudgetLimits(
  input: { householdId: string; startDate: string; endDate: string; budgetIds?: string[] },
  prisma: Pick<PrismaClient, 'budgetLimit'> = defaultPrisma,
): Promise<StandardBudgetLimitInput[]> {
  const periodKeys = monthPeriodKeys(input.startDate, input.endDate);
  const limits = await prisma.budgetLimit.findMany({
    where: {
      householdId: input.householdId,
      periodKey: { in: periodKeys },
      budget: { isDeleted: false },
      ...(input.budgetIds?.length ? { budgetId: { in: input.budgetIds } } : {}),
    },
    orderBy: [{ periodKey: 'asc' }, { budgetId: 'asc' }],
    include: {
      budget: {
        select: {
          id: true,
          name: true,
          categoryId: true,
          category: { select: { id: true, name: true } },
        },
      },
    },
  });

  return limits.map((limit) => ({
    id: limit.budget.id,
    name: limit.budget.name ?? limit.budget.category?.name ?? 'Budget',
    categoryId: limit.budget.categoryId ?? null,
    categoryName: limit.budget.category?.name ?? null,
    limitAmount: decimal(limit.limitAmount),
    spentAmount: decimal(limit.spentAmount),
    rolloverAmount: decimal(limit.rolloverAmount),
    periodKey: limit.periodKey,
  }));
}

export async function fetchStandardAuditContext(
  input: { householdId: string; startDate: string; endDate: string },
  prisma: Pick<PrismaClient, 'duplicateDismissal' | 'importHistory' | 'ruleExecutionLog' | 'account' | 'category'> = defaultPrisma,
): Promise<StandardAuditContextInput> {
  const start = new Date(`${input.startDate}T00:00:00.000Z`);
  const end = new Date(`${input.endDate}T23:59:59.999Z`);
  const [dismissedDuplicateCount, importIssueCount, ruleFailureCount, accountsExcludedFromReports, categoriesExcludedFromReports] = await Promise.all([
    prisma.duplicateDismissal.count({ where: { householdId: input.householdId, createdAt: { gte: start, lte: end } } }),
    prisma.importHistory.count({ where: { householdId: input.householdId, createdAt: { gte: start, lte: end }, OR: [{ status: { not: 'completed' } }, { rowsSkipped: { gt: 0 } }] } }),
    prisma.ruleExecutionLog.count({ where: { householdId: input.householdId, createdAt: { gte: start, lte: end }, status: { not: 'applied' } } }),
    prisma.account.count({ where: { householdId: input.householdId, excludeFromReports: true, isDeleted: false } }),
    prisma.category.count({ where: { householdId: input.householdId, excludeFromReports: true, isDeleted: false } }),
  ]);
  return { dismissedDuplicateCount, importIssueCount, ruleFailureCount, accountsExcludedFromReports, categoriesExcludedFromReports };
}

export async function fetchStandardWealthContext(
  input: { householdId: string; startDate: string; endDate: string },
  prisma: Pick<PrismaClient, 'netWorthSnapshot' | 'account' | 'manualAsset' | 'manualLiability' | 'investmentHolding'> = defaultPrisma,
): Promise<StandardWealthInput> {
  const start = new Date(`${input.startDate}T00:00:00.000Z`);
  const end = new Date(`${input.endDate}T23:59:59.999Z`);
  const [snapshots, accounts, manualAssets, manualLiabilities, holdings] = await Promise.all([
    prisma.netWorthSnapshot.findMany({
      where: { householdId: input.householdId, date: { gte: start, lte: end } },
      orderBy: { date: 'asc' },
    }),
    prisma.account.findMany({
      where: { householdId: input.householdId, isDeleted: false, isHidden: false, excludeFromNetWorth: false },
      select: { id: true, name: true, type: true, balance: true, balanceDecimal: true },
    }),
    prisma.manualAsset.findMany({ where: { householdId: input.householdId, isDeleted: false }, select: { currentValue: true, currentValueDecimal: true } }),
    prisma.manualLiability.findMany({ where: { householdId: input.householdId, isDeleted: false }, select: { type: true, currentBalance: true, currentBalanceDecimal: true } }),
    prisma.investmentHolding.findMany({
      where: {
        isDeleted: false,
        account: { householdId: input.householdId, isDeleted: false, isHidden: false, excludeFromNetWorth: false },
      },
      select: { shares: true, sharesDecimal: true, currentPrice: true, currentPriceDecimal: true },
    }),
  ]);
  // Read the Float, not the Decimal shadow column. The Decimal columns on
  // Account / InvestmentHolding / ManualAsset / ManualLiability were backfilled
  // once by the incomplete Float->Decimal migration and no runtime code writes
  // them, so preferring them here returned migration-day values forever while
  // reconciles, imports, transfers and the nightly balance job moved only the
  // Float. (NetWorthSnapshot below is different — see the comment there.)
  const cashValue = accounts
    .filter((account) => account.type !== 'investment')
    .reduce((sum, account) => sum.plus(decimal(account.balance ?? 0)), ZERO);
  const investmentValue = holdings.reduce((sum, holding) => {
    const shares = decimal(holding.shares ?? 0);
    const price = decimal(holding.currentPrice ?? 0);
    return sum.plus(shares.times(price));
  }, ZERO);
  const manualAssetValue = manualAssets.reduce((sum, asset) => sum.plus(decimal(asset.currentValue ?? 0)), ZERO);
  const manualLiabilityValue = manualLiabilities.reduce((sum, liability) => sum.plus(decimal(liability.currentBalance ?? 0)), ZERO);
  const accountContributions = accounts.map((account) => ({
    id: account.id,
    name: account.name,
    value: decimal(account.balance ?? 0),
  }));
  // Mirrors the Mortgage / Credit cards / Other liabilities lines the Legacy
  // Assets / Liabilities tab shows. ManualLiability.type is one of
  // mortgage | auto_loan | student_loan | credit_card | other.
  const liabilityGroups: Array<{ key: string; label: string; types: string[] }> = [
    { key: 'mortgage', label: 'Mortgage', types: ['mortgage'] },
    { key: 'creditCard', label: 'Credit cards', types: ['credit_card'] },
  ];
  const groupedTypes = new Set(liabilityGroups.flatMap((group) => group.types));
  const liabilityBreakdown = [
    ...liabilityGroups.map((group) => ({
      key: group.key,
      label: group.label,
      value: manualLiabilities
        .filter((liability) => group.types.includes(liability.type))
        .reduce((sum, liability) => sum.plus(decimal(liability.currentBalance ?? 0)), ZERO),
    })),
    {
      key: 'other',
      label: 'Other liabilities',
      value: manualLiabilities
        .filter((liability) => !groupedTypes.has(liability.type))
        .reduce((sum, liability) => sum.plus(decimal(liability.currentBalance ?? 0)), ZERO),
    },
  ];
  return {
    cashValue,
    investmentValue,
    manualAssetValue,
    manualLiabilityValue,
    accountContributions,
    liabilityBreakdown,
    // NetWorthSnapshot intentionally still prefers the Decimal column. These
    // rows are immutable history: once written they are never updated, so the
    // Decimal and the Float agree by construction and cannot drift.
    snapshots: snapshots.map((snapshot) => ({
      date: snapshot.date.toISOString().slice(0, 10),
      assets: decimal(snapshot.assetsDecimal ?? snapshot.assets ?? 0),
      liabilities: decimal(snapshot.liabilitiesDecimal ?? snapshot.liabilities ?? 0),
      netWorth: decimal(snapshot.netWorthDecimal ?? snapshot.netWorth ?? 0),
    })),
  };
}

export async function fetchStandardInvestmentContext(
  input: { householdId: string; startDate: string; endDate: string },
  prisma: Pick<PrismaClient, 'investmentHolding'> = defaultPrisma,
): Promise<StandardInvestmentInput> {
  const start = new Date(`${input.startDate}T00:00:00.000Z`);
  const end = new Date(`${input.endDate}T23:59:59.999Z`);
  const holdings = await prisma.investmentHolding.findMany({
    where: {
      isDeleted: false,
      account: { householdId: input.householdId, isDeleted: false, isHidden: false },
    },
    include: {
      account: { select: { id: true, name: true } },
      lots: {
        where: {
          date: { gte: start, lte: end },
          transactionType: 'sell',
          status: 'confirmed',
          isDeleted: false,
        },
        select: { realizedGainDecimal: true },
      },
      dividends: {
        where: { date: { gte: start, lte: end }, isDeleted: false },
        select: { amountDecimal: true },
      },
      recurringInvestments: { where: { status: 'active', isDeleted: false }, select: { id: true } },
    },
    orderBy: [{ accountId: 'asc' }, { symbol: 'asc' }],
  });
  return {
    holdings: holdings.map((holding) => {
      // Float, not the Decimal shadow column — see the note in the net-worth
      // generator above. realizedGainDecimal below is different: it has no
      // Float counterpart and investmentService writes it directly.
      const shares = decimal(holding.shares ?? 0);
      const price = decimal(holding.currentPrice ?? 0);
      return {
        id: holding.id,
        accountId: holding.account.id,
        accountName: holding.account.name,
        symbol: holding.symbol,
        name: holding.name,
        shares,
        currentValue: shares.times(price),
        costBasis: decimal(holding.costBasis ?? 0),
        realizedGainLoss: (holding.lots ?? []).reduce((sum, lot) => sum.plus(decimal(lot.realizedGainDecimal ?? 0)), ZERO),
        assetClass: holding.assetClass,
      };
    }),
    dividendTotal: holdings.reduce((sum, holding) => sum.plus(holding.dividends.reduce((inner, dividend) => inner.plus(decimal(dividend.amountDecimal)), ZERO)), ZERO),
    recurringInvestmentCount: holdings.reduce((sum, holding) => sum + holding.recurringInvestments.length, 0),
  };
}

// ─── Wealth-backed report builders (absorbed Legacy tabs) ─────────────────────
//
// These four report types are not functions of StandardReportRow[]. They follow
// the established buildNetWorthReport / buildInvestmentReport pattern: a context
// object is fetched separately in buildStandardReportForRequest and `filtered: []`
// is passed to baseResponse.

export function buildAllocationReport(input: { query: NormalizedReportQuery; rows: StandardReportRow[]; allocation?: StandardAllocationInput; generatedAt?: Date }): StandardReportResponse {
  const response = baseResponse({ ...input, filtered: [], title: 'Allocation & Drift Report' });
  const allocation = input.allocation;
  const byAssetClass = allocation?.byAssetClass ?? [];
  const totalValue = allocation?.totalValue ?? ZERO;
  const largestDrift = byAssetClass.reduce((worst, item) => {
    const drift = item.percent.minus(item.targetPercent);
    return drift.abs().gt(worst.abs()) ? drift : worst;
  }, ZERO);

  response.summaryCards = [
    card('totalValue', 'Portfolio Value', totalValue, response.currencyCode),
    { key: 'assetClassCount', label: 'Asset Classes', value: String(byAssetClass.length), formattedValue: String(byAssetClass.length) },
    { key: 'largestDrift', label: 'Largest Drift', value: largestDrift.toDecimalPlaces(2).toFixed(2), formattedValue: `${largestDrift.gte(ZERO) ? '+' : ''}${largestDrift.toDecimalPlaces(1).toFixed(1)}%` },
  ];

  response.charts = [
    {
      kind: 'donut',
      key: 'allocationByAssetClass',
      title: 'Current Allocation by Asset Class',
      nameKey: 'name',
      valueKey: 'value',
      format: 'currency',
      data: byAssetClass.map((item) => ({ name: item.assetClass, value: money(item.value) })),
    },
    {
      kind: 'groupedBar',
      key: 'allocationTargetVsCurrent',
      title: 'Target vs Current Weight',
      x: { key: 'assetClass', label: 'Asset Class', format: 'number' },
      series: [
        { key: 'current', label: 'Current', format: 'percent', role: 'actual' },
        { key: 'target', label: 'Target', format: 'percent', role: 'budget' },
      ],
      data: byAssetClass.map((item) => ({
        assetClass: item.assetClass,
        current: item.percent.toDecimalPlaces(2).toNumber(),
        target: item.targetPercent.toDecimalPlaces(2).toNumber(),
      })),
    },
    {
      kind: 'bar',
      key: 'allocationDrift',
      title: 'Drift from Target (percentage points)',
      x: { key: 'assetClass', label: 'Asset Class', format: 'number' },
      series: [{ key: 'drift', label: 'Drift', format: 'percent', role: 'net' }],
      data: byAssetClass.map((item) => ({
        assetClass: item.assetClass,
        drift: item.percent.minus(item.targetPercent).toDecimalPlaces(2).toNumber(),
      })),
      reference: { value: 0, label: 'On target' },
    },
  ];

  response.tables = [{
    key: 'allocationDrift',
    title: 'Allocation & Drift',
    columns: [
      { key: 'assetClass', label: 'Asset Class' },
      { key: 'value', label: 'Value' },
      { key: 'current', label: 'Current %' },
      { key: 'target', label: 'Target %' },
      { key: 'drift', label: 'Drift' },
    ],
    rows: byAssetClass.map((item) => ({
      id: item.assetClass,
      assetClass: item.assetClass,
      value: money(item.value),
      formattedValue: formatMoney(item.value, response.currencyCode),
      current: item.percent.toDecimalPlaces(2).toFixed(2),
      target: item.targetPercent.toDecimalPlaces(2).toFixed(2),
      drift: item.percent.minus(item.targetPercent).toDecimalPlaces(2).toFixed(2),
    })),
  }];

  if (!allocation) response.metadata.warnings.push('No investment allocation context was available.');
  else if (!byAssetClass.length) response.metadata.warnings.push('No investment holdings were found. Add holdings to see allocation drift.');
  response.metadata.calculationNotes.push('Target weights are the built-in defaults (US Stocks 50%, Bonds 30%, International Stocks 15%, Cash 5%); asset classes without a default target compare against 0%.');
  noteWealthOnlyFilters(response, input.query, 'Account and investment holding data');
  return response;
}

export function buildContributionRoomReport(input: { query: NormalizedReportQuery; rows: StandardReportRow[]; contributionRoom?: StandardContributionRoomInput; generatedAt?: Date }): StandardReportResponse {
  const response = baseResponse({ ...input, filtered: [], title: 'Contribution Room Report' });
  const accounts = input.contributionRoom?.accounts ?? [];
  const totalRoom = accounts.reduce((sum, account) => sum.plus(account.totalRoomEver), ZERO);
  const totalContributed = accounts.reduce((sum, account) => sum.plus(account.contributionsYtd), ZERO);
  const totalRemaining = accounts.reduce((sum, account) => sum.plus(account.roomRemaining), ZERO);
  const totalOver = accounts.reduce((sum, account) => sum.plus(account.overContribution), ZERO);

  response.summaryCards = [
    card('totalRoom', 'Total Room', totalRoom, response.currencyCode),
    card('totalContributed', 'Total Contributed', totalContributed, response.currencyCode),
    card('totalRemaining', 'Remaining Room', totalRemaining, response.currencyCode),
    card('totalOverContribution', 'Over-contribution', totalOver, response.currencyCode),
  ];

  const byType = new Map<string, { contributed: Decimal; remaining: Decimal }>();
  for (const account of accounts) {
    const existing = byType.get(account.type) ?? { contributed: ZERO, remaining: ZERO };
    existing.contributed = existing.contributed.plus(account.contributionsYtd);
    existing.remaining = existing.remaining.plus(account.roomRemaining);
    byType.set(account.type, existing);
  }

  response.charts = [{
    kind: 'groupedBar',
    key: 'contributionRoomByType',
    title: 'Contributed vs Remaining Room by Account Type',
    x: { key: 'accountType', label: 'Account Type', format: 'number' },
    series: [
      // Shared stack group, so the full bar height reads as the total room.
      { key: 'contributed', label: 'Contributed', format: 'currency', role: 'actual', stack: 'room' },
      { key: 'remaining', label: 'Remaining', format: 'currency', role: 'budget', stack: 'room' },
    ],
    data: Array.from(byType.entries()).map(([accountType, totals]) => ({
      accountType,
      contributed: money(totals.contributed),
      remaining: money(totals.remaining),
    })),
  }];

  response.tables = [{
    key: 'contributionRoom',
    title: 'Contribution Room by Account',
    columns: [
      { key: 'type', label: 'Type' },
      { key: 'name', label: 'Account' },
      { key: 'memberName', label: 'Member' },
      { key: 'contributionsYtd', label: 'Contributed YTD' },
      { key: 'roomRemaining', label: 'Room Remaining' },
      { key: 'overContribution', label: 'Over-contribution' },
      { key: 'pctUsed', label: '% Used' },
      { key: 'alert', label: 'Status' },
    ],
    rows: accounts.map((account) => ({
      id: account.id,
      type: account.type,
      name: account.name,
      memberName: account.memberName,
      contributionsYtd: money(account.contributionsYtd),
      roomRemaining: money(account.roomRemaining),
      overContribution: money(account.overContribution),
      pctUsed: account.pctUsed,
      alert: account.alert,
    })),
  }];

  if (!input.contributionRoom) response.metadata.warnings.push('No tax account context was available.');
  else if (!accounts.length) response.metadata.warnings.push('No tax-advantaged accounts have been configured yet.');
  if (totalOver.gt(ZERO)) response.metadata.warnings.push('One or more tax accounts are over-contributed.');
  noteWealthOnlyFilters(response, input.query, 'TaxAccount contribution and room data');
  return response;
}

export function buildDividendForecastReport(input: { query: NormalizedReportQuery; rows: StandardReportRow[]; dividendForecast?: StandardDividendForecastInput; generatedAt?: Date }): StandardReportResponse {
  const response = baseResponse({ ...input, filtered: [], title: 'Dividend Forecast Report' });
  const forecast = input.dividendForecast?.forecast ?? [];
  const byHolding = (input.dividendForecast?.byHolding ?? []).filter((item) => item.annualIncome.gt(ZERO));
  const firstYear = forecast[0]?.income ?? ZERO;
  const horizonTotal = forecast.reduce((sum, point) => sum.plus(point.income), ZERO);

  response.summaryCards = [
    card('firstYearIncome', 'Projected Income (Year 1)', firstYear, response.currencyCode),
    card('horizonIncome', `Projected Income (${input.dividendForecast?.years ?? forecast.length} Years)`, horizonTotal, response.currencyCode),
    { key: 'payingHoldings', label: 'Dividend-paying Holdings', value: String(byHolding.length), formattedValue: String(byHolding.length) },
  ];

  response.charts = [
    {
      kind: 'bar',
      key: 'dividendByYear',
      title: 'Projected Dividend Income by Year',
      x: { key: 'year', label: 'Year', format: 'number' },
      series: [{ key: 'income', label: 'Projected Income', format: 'currency', role: 'income' }],
      data: forecast.map((point) => ({ year: String(point.year), income: money(point.income) })),
    },
    {
      kind: 'donut',
      key: 'dividendByHolding',
      title: 'Projected Dividends by Holding',
      nameKey: 'name',
      valueKey: 'value',
      format: 'currency',
      data: byHolding.map((item) => ({ name: item.symbol, value: money(item.annualIncome) })),
    },
  ];

  response.tables = [{
    key: 'dividendForecast',
    title: 'Dividend Forecast',
    columns: [{ key: 'year', label: 'Year' }, { key: 'income', label: 'Projected Income' }],
    rows: forecast.map((point) => ({
      id: String(point.year),
      year: point.year,
      income: money(point.income),
      formattedIncome: formatMoney(point.income, response.currencyCode),
    })),
  }];

  if (!input.dividendForecast) response.metadata.warnings.push('No dividend forecast context was available.');
  else if (!forecast.length || horizonTotal.eq(ZERO)) response.metadata.warnings.push('No dividend-paying holdings were found. Add investments to see a dividend forecast.');
  if (input.dividendForecast?.basedOn) response.metadata.calculationNotes.push(input.dividendForecast.basedOn);
  response.metadata.calculationNotes.push(`The forecast horizon is fixed at ${input.dividendForecast?.years ?? 5} years and is not derived from the report date range.`);
  noteWealthOnlyFilters(response, input.query, 'investment holding and live dividend-yield data');
  return response;
}

export function buildRetirementReport(input: { query: NormalizedReportQuery; rows: StandardReportRow[]; retirement?: StandardRetirementInput; generatedAt?: Date }): StandardReportResponse {
  const response = baseResponse({ ...input, filtered: [], title: 'Retirement Simulation Report' });
  const retirement = input.retirement;
  const scenarios = retirement?.scenarios ?? [];
  const projectionYears = retirement?.projectionYears ?? 30;
  const portfolioValue = retirement?.portfolioValue ?? ZERO;

  response.summaryCards = [
    card('portfolioValue', 'Portfolio Value', portfolioValue, response.currencyCode),
    { key: 'projectionYears', label: 'Projection Horizon', value: String(projectionYears), formattedValue: `${projectionYears} years` },
    ...scenarios.map((scenario) => card(`scenario_${scenario.label.replace(/\s+/g, '_').toLowerCase()}`, `${scenario.label} (${(scenario.returnRate * 100).toFixed(0)}%/yr)`, scenario.endingBalance, response.currencyCode)),
  ];

  // One series per scenario, sampled yearly, so the report draws the growth paths
  // the Legacy tab only stated as ending balances.
  const years = Array.from({ length: projectionYears + 1 }, (_, index) => index);
  response.charts = [{
    kind: 'line',
    key: 'retirementProjection',
    title: 'Projected Portfolio Value by Scenario',
    x: { key: 'year', label: 'Years from now', format: 'number' },
    series: scenarios.map((scenario) => ({
      key: scenario.label.replace(/\s+/g, '_').toLowerCase(),
      label: scenario.label,
      format: 'currency' as const,
      role: 'categorical' as const,
    })),
    data: years.map((year) => {
      const point: ChartRow = { year: String(year) };
      for (const scenario of scenarios) {
        point[scenario.label.replace(/\s+/g, '_').toLowerCase()] = money(portfolioValue.times(decimal(1 + scenario.returnRate).pow(year)));
      }
      return point;
    }),
  }];

  response.tables = [{
    key: 'retirementScenarios',
    title: 'Scenarios',
    columns: [
      { key: 'label', label: 'Scenario' },
      { key: 'returnRate', label: 'Assumed Annual Return' },
      { key: 'endingBalance', label: `Projected Balance After ${projectionYears} Years` },
    ],
    rows: scenarios.map((scenario) => ({
      id: scenario.label,
      label: scenario.label,
      returnRate: `${(scenario.returnRate * 100).toFixed(0)}%`,
      endingBalance: money(scenario.endingBalance),
      formattedEndingBalance: formatMoney(scenario.endingBalance, response.currencyCode),
    })),
  }];

  if (!retirement) response.metadata.warnings.push('No retirement simulation context was available.');
  else if (!scenarios.length || portfolioValue.eq(ZERO)) response.metadata.warnings.push('No portfolio data is available. Add investments to run retirement simulations.');
  if (retirement?.note) response.metadata.calculationNotes.push(retirement.note);
  noteWealthOnlyFilters(response, input.query, 'investment holding data');
  return response;
}

// ─── Wealth-backed context fetchers ──────────────────────────────────────────

/**
 * Default target weights. Absorbed from TARGET_ALLOCATION in the Legacy
 * client/src/pages/reports/components/AllocationDriftSection.tsx, which hardcoded
 * them client-side. Asset classes with no entry target 0%.
 */
const DEFAULT_TARGET_ALLOCATION: Record<string, number> = {
  'US Stocks': 50,
  Bonds: 30,
  'International Stocks': 15,
  Cash: 5,
};

export async function fetchStandardAllocationContext(input: { householdId: string }): Promise<StandardAllocationInput> {
  // Shares getAllocation with GET /api/v1/investments/allocation; changing the
  // allocation maths there changes this report too, by design.
  const allocation = await getAllocation(input.householdId);
  return {
    totalValue: decimal(allocation.totalValue),
    byAssetClass: allocation.byAssetClass.map((item) => ({
      assetClass: item.assetClass,
      value: decimal(item.value),
      percent: decimal(item.percent),
      targetPercent: decimal(DEFAULT_TARGET_ALLOCATION[item.assetClass] ?? 0),
    })),
  };
}

export async function fetchStandardContributionRoomContext(
  input: { householdId: string },
  prisma: Pick<PrismaClient, 'taxAccount'> = defaultPrisma,
): Promise<StandardContributionRoomInput> {
  // Reproduces the per-account mapping in GET /api/v1/tax-accounts/household-summary
  // (server/src/routes/taxAccounts.ts). The CRA room rules themselves are shared:
  // both callers use calculateTfsaRoom / calculateRrspRoom from lib/taxRoomCalculator.
  // If that route's mapping changes, change it here too.
  const accounts = await prisma.taxAccount.findMany({ where: { householdId: input.householdId } });
  const currentYear = new Date().getFullYear();
  return {
    accounts: accounts.map((account) => {
      let roomRemaining = 0;
      let overContribution = 0;
      if (account.type === 'TFSA' && account.birthYear) {
        const calc = calculateTfsaRoom(account.birthYear, currentYear, account.contributionsYtd, account.withdrawalsYtd);
        roomRemaining = calc.roomRemaining;
        overContribution = calc.overContribution;
      } else if (account.type === 'RRSP') {
        const calc = calculateRrspRoom(currentYear, account.contributionsYtd, account.totalRoomEver);
        roomRemaining = calc.roomRemaining;
        overContribution = calc.overContribution;
      } else {
        roomRemaining = Math.max(0, account.totalRoomEver - account.contributionsYtd);
      }
      const pctUsed = account.totalRoomEver > 0 ? (account.contributionsYtd / account.totalRoomEver) * 100 : 0;
      return {
        id: account.id,
        name: account.name,
        type: account.type,
        memberName: account.memberName,
        contributionsYtd: decimal(account.contributionsYtd),
        totalRoomEver: decimal(account.totalRoomEver),
        roomRemaining: decimal(roomRemaining),
        overContribution: decimal(overContribution),
        pctUsed: Math.min(100, Math.round(pctUsed)),
        alert: overContribution > 0 ? 'over' : pctUsed > 90 ? 'warning' : 'ok',
      };
    }),
  };
}

/** The Legacy Dividend Forecast tab hardcoded years=5; keep five years as the default. */
const DIVIDEND_FORECAST_YEARS = 5;

export async function fetchStandardDividendForecastContext(
  input: { householdId: string },
  prisma: Pick<PrismaClient, 'investmentHolding'> = defaultPrisma,
): Promise<StandardDividendForecastInput> {
  // The yearly totals come from getDividendForecast, shared with
  // GET /api/v1/investments/dividend-forecast. That function returns no
  // per-holding split, so the donut recomputes shares * price * dividendYield
  // per holding with the same inputs.
  const [summary, holdings] = await Promise.all([
    getDividendForecast(input.householdId, DIVIDEND_FORECAST_YEARS),
    prisma.investmentHolding.findMany({
      where: { isDeleted: false, account: { householdId: input.householdId, isDeleted: false } },
      select: { symbol: true, name: true, shares: true, currentPrice: true },
    }),
  ]);
  const quotes = await getQuotes(holdings.map((holding) => holding.symbol));
  return {
    years: DIVIDEND_FORECAST_YEARS,
    forecast: summary.forecast.map((point) => ({ year: point.year, income: decimal(point.income) })),
    byHolding: holdings.map((holding) => {
      const quote = quotes.get(holding.symbol.toUpperCase());
      const price = quote?.price ?? holding.currentPrice ?? 0;
      const dividendYield = quote?.dividendYield ?? 0;
      return {
        symbol: holding.symbol,
        name: holding.name,
        annualIncome: decimal(holding.shares).times(decimal(price)).times(decimal(dividendYield)),
      };
    }),
    basedOn: summary.basedOn,
  };
}

/**
 * Deterministic compound-growth projections, reproducing the ~30 lines inside
 * GET /api/v1/investments/retirement-simulation (server/src/routeModules/investments.ts).
 * There is no Monte Carlo and no per-request iteration, so this is cheap enough to
 * re-run on every filter change. If that route gains real probabilistic modelling,
 * extract it into server/src/lib/ and have both callers share it.
 */
const RETIREMENT_PROJECTION_YEARS = 30;
const RETIREMENT_SCENARIOS: Array<{ label: string; returnRate: number }> = [
  { label: 'Conservative', returnRate: 0.05 },
  { label: 'Base case', returnRate: 0.07 },
  { label: 'Growth', returnRate: 0.09 },
];

export async function fetchStandardRetirementContext(
  input: { householdId: string },
  prisma: Pick<PrismaClient, 'investmentHolding'> = defaultPrisma,
): Promise<StandardRetirementInput> {
  const holdings = await prisma.investmentHolding.findMany({
    where: { isDeleted: false, account: { householdId: input.householdId, isDeleted: false } },
    select: { shares: true, currentPrice: true, costBasis: true },
  });
  const portfolioValue = holdings.reduce(
    (sum, holding) => sum.plus(decimal(holding.shares ?? 0).times(decimal(holding.currentPrice ?? holding.costBasis ?? 0))),
    ZERO,
  );
  return {
    portfolioValue,
    projectionYears: RETIREMENT_PROJECTION_YEARS,
    scenarios: RETIREMENT_SCENARIOS.map((scenario) => ({
      label: scenario.label,
      returnRate: scenario.returnRate,
      endingBalance: portfolioValue.times(decimal(1 + scenario.returnRate).pow(RETIREMENT_PROJECTION_YEARS)),
    })),
    note: 'Deterministic projections of your current portfolio value compounded at fixed assumed annual return rates over 30 years. Assumes no future contributions or withdrawals. These are illustrative scenarios, not predictions or probabilities.',
  };
}

/**
 * Cash Flow Forecast, absorbed from the Legacy Forecast tab
 * (client/src/pages/reports/components/CashFlowForecast.tsx). The projection itself
 * lives in server/src/lib/cashFlowForecast.ts and is shared verbatim with
 * GET /api/v1/cashflow/forecast — this builder only shapes it into the standard
 * contract, so the two can never disagree.
 */
export function buildCashFlowForecastReport(input: { query: NormalizedReportQuery; rows: StandardReportRow[]; cashFlowForecast?: StandardCashFlowForecastInput; generatedAt?: Date }): StandardReportResponse {
  const response = baseResponse({ ...input, filtered: [], title: 'Cash Flow Forecast Report' });
  const context = input.cashFlowForecast;
  const forecast = context?.forecast;
  const days = context?.days ?? 0;
  const projections = forecast?.projections ?? [];
  const currentBalance = decimal(forecast?.currentBalance ?? 0);
  const projectedEndBalance = decimal(forecast?.summary.projectedEndBalance ?? 0);
  const avgMonthlyIncome = decimal(forecast?.summary.avgMonthlyIncome ?? 0);
  const avgMonthlyExpense = decimal(forecast?.summary.avgMonthlyExpense ?? 0);
  const knownRecurringTotal = decimal(forecast?.summary.knownRecurringTotal ?? 0);

  response.summaryCards = [
    card('currentBalance', 'Current Balance', currentBalance, response.currencyCode),
    card('projectedEndBalance', `Projected Balance in ${days} Days`, projectedEndBalance, response.currencyCode),
    card('avgMonthlyNet', 'Average Monthly Net', avgMonthlyIncome.minus(avgMonthlyExpense), response.currencyCode),
    card('knownRecurringTotal', 'Known Recurring Total', knownRecurringTotal, response.currencyCode),
  ];

  response.charts = [{
    kind: 'line',
    key: 'cashFlowForecast',
    title: `Projected Balance over the Next ${days} Days`,
    x: { key: 'date', label: 'Date', format: 'date' },
    series: [{ key: 'projected', label: 'Projected Balance', format: 'currency', role: 'net' }],
    data: projections.map((point) => ({ date: point.date, projected: money(decimal(point.projected)) })),
  }];

  response.tables = [{
    key: 'cashFlowProjections',
    title: 'Daily Projections',
    columns: [
      { key: 'date', label: 'Date' },
      { key: 'dailyNet', label: 'Daily Net' },
      { key: 'projected', label: 'Projected Balance' },
    ],
    rows: projections.map((point) => ({
      id: point.date,
      date: point.date,
      dailyNet: money(decimal(point.dailyNet)),
      projected: money(decimal(point.projected)),
      formattedDailyNet: formatMoney(decimal(point.dailyNet), response.currencyCode),
      formattedProjected: formatMoney(decimal(point.projected), response.currencyCode),
    })),
  }];

  if (!forecast) {
    response.metadata.warnings.push('No cash flow forecast context was available.');
  } else {
    response.metadata.calculationNotes.push(`Projected over a ${days}-day window. The forecast supports 30, 60 and 90 day windows only, so the selected date range (${context?.requestedDays ?? 0} days forward from today) was clamped to the nearest of those.`);
    response.metadata.calculationNotes.push('Daily net is the average daily income minus average daily expense over the last 90 days, plus any RecurringItem falling due that day. Recurring Journals are excluded from the average so they are not counted twice.');
  }
  noteWealthOnlyFilters(response, input.query, 'Account balance and RecurringItem data');

  return response;
}

/** The windows the projection supports. Not a query parameter on the standard contract. */
const CASH_FLOW_FORECAST_WINDOWS = [30, 60, 90] as const;

export async function fetchStandardCashFlowForecastContext(
  input: { householdId: string; endDate: string; now?: Date },
  prisma: Pick<PrismaClient, 'account' | 'transactionJournal' | 'recurringItem'> = defaultPrisma,
): Promise<StandardCashFlowForecastInput> {
  const now = input.now ?? new Date();
  const end = new Date(`${input.endDate}T00:00:00Z`);
  const requestedDays = Number.isNaN(end.getTime())
    ? CASH_FLOW_FORECAST_WINDOWS[0]
    : Math.max(0, Math.round((end.getTime() - now.getTime()) / 86_400_000));
  const days = CASH_FLOW_FORECAST_WINDOWS.reduce((nearest, window) =>
    Math.abs(window - requestedDays) < Math.abs(nearest - requestedDays) ? window : nearest,
  CASH_FLOW_FORECAST_WINDOWS[0] as 30 | 60 | 90);

  return {
    days,
    requestedDays,
    forecast: await computeCashFlowForecast({ householdId: input.householdId, days, now }, prisma),
  };
}
