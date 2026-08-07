import type { DatePreset } from "./dateRange";
import type { ReportTab } from "./shared";

export type StandardReportType =
  | "overview"
  | "income_vs_expense"
  | "cash_flow"
  | "category"
  | "budget"
  | "tag"
  | "account"
  | "merchant"
  | "audit"
  | "net_worth"
  | "investment";

export type StandardGroupBy = "day" | "week" | "month" | "quarter" | "year";
export type StandardReportTab = ReportTab | "category" | "budget" | "tag" | "account" | "merchant" | "audit";

export interface StandardReportFilters {
  tab: StandardReportTab;
  datePreset?: DatePreset;
  startDate: string;
  endDate: string;
  groupBy: StandardGroupBy;
  accountIds: string[];
  categoryIds: string[];
  budgetIds: string[];
  tagIds: string[];
  merchantIds: string[];
  includePending: boolean;
  includeTransfers: boolean;
  currencyCode?: string;
  categoryGroupIds: string[];
  transactionTypes: string[];
  includeHidden: boolean;
  includeSplits: boolean;
  includeExcludedFromReports: boolean;
  comparisonMode: "none" | "previous_period" | "previous_year";
  sortBy?: string;
  sortDirection: "asc" | "desc";
  limit: number;
  minAmount?: number;
  maxAmount?: number;
  searchText?: string;
  onlyUncategorized: boolean;
  reconciledState: "any" | "reconciled" | "unreconciled";
}

/**
 * The single source of truth for what "unfiltered" means. Used by initial state, URL
 * omission, chip visibility and saved-report fallback. A filter added without a default
 * here shows up as a permanent chip nobody can remove.
 *
 * `includeSplits: true` and `limit: 25` mirror the server's own defaults in
 * `normalizeReportQuery` — keep them in step.
 */
export const DEFAULT_STANDARD_FILTERS: Omit<StandardReportFilters, "tab" | "startDate" | "endDate"> = {
  groupBy: "month",
  accountIds: [],
  categoryIds: [],
  categoryGroupIds: [],
  budgetIds: [],
  tagIds: [],
  merchantIds: [],
  transactionTypes: [],
  includePending: false,
  includeTransfers: false,
  includeHidden: false,
  includeSplits: true,
  includeExcludedFromReports: false,
  comparisonMode: "none",
  sortDirection: "desc",
  limit: 25,
  onlyUncategorized: false,
  reconciledState: "any",
};

/** Transaction types the Journal records, as filtered by `normalizeReportQuery`. */
export const TRANSACTION_TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "deposit", label: "Deposit" },
  { value: "withdrawal", label: "Withdrawal" },
  { value: "transfer", label: "Transfer" },
];

export interface StandardSavedReport {
  id: string;
  name: string;
  filters: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export type ChartValueFormat = "currency" | "percent" | "number" | "date";

export interface ChartSeries {
  /** Key into each data row. */
  key: string;
  /** Human label shown in legend and tooltip. */
  label: string;
  format: ChartValueFormat;
  /** Semantic colour role; the client maps these to CSS custom properties. */
  role: "income" | "expense" | "net" | "budget" | "actual" | "neutral" | "categorical";
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
  kind: "line" | "area" | "bar" | "stackedBar" | "groupedBar" | "waterfall";
  key: string;
  title: string;
  x: ChartAxis;
  series: ChartSeries[];
  data: ChartRow[];
  /** Optional reference line, e.g. a zero baseline or a budget limit. */
  reference?: { value: number; label: string };
}

export interface PartitionChartSpec {
  kind: "pie" | "donut" | "treemap";
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
  kind: "sankey";
  key: string;
  title: string;
  format: ChartValueFormat;
  nodes: Array<{ id: string; label: string; column: number; role: "income" | "total" | "bucket" | "category" }>;
  links: Array<{ source: string; target: string; value: number }>;
}

export interface HeatmapChartSpec {
  kind: "heatmap";
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
    filtersApplied: Record<string, unknown>;
    warnings: string[];
    calculationNotes: string[];
  };
}

export interface StandardReportOptions {
  reportTypes: Array<{ type: StandardReportType; label: string; available: boolean }>;
  groupBy: StandardGroupBy[];
  comparisonModes: string[];
  accounts: Array<{ id: string; name: string; type: string; currency: string }>;
  categories: Array<{ id: string; name: string; type: string; groupId: string | null; icon: string | null }>;
  categoryGroups: Array<{ id: string; name: string }>;
  budgets: Array<{ id: string; name: string; categoryId: string | null; categoryName: string | null }>;
  tags: Array<{ id: string; name: string; color: string | null }>;
  merchants: Array<{ id: string; name: string }>;
}

const TAB_TO_TYPE: Partial<Record<StandardReportTab, StandardReportType>> = {
  overview: "overview",
  cashflow: "cash_flow",
  savings: "cash_flow",
  spending: "category",
  category: "category",
  income: "income_vs_expense",
  variance: "budget",
  budget: "budget",
  tag: "tag",
  account: "account",
  merchant: "merchant",
  audit: "audit",
  networth: "net_worth",
  investmentperformance: "investment",
};

const TYPE_TO_TAB: Partial<Record<StandardReportType, StandardReportTab>> = {
  overview: "overview",
  cash_flow: "cashflow",
  category: "category",
  income_vs_expense: "income",
  budget: "budget",
  tag: "tag",
  account: "account",
  merchant: "merchant",
  audit: "audit",
  net_worth: "networth",
  investment: "investmentperformance",
};

export function mapReportTabToType(tab: StandardReportTab): StandardReportType {
  return TAB_TO_TYPE[tab] ?? "overview";
}

function stringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string" && item.length > 0);
  if (typeof value === "string" && value.trim()) return value.split(",").map((item) => item.trim()).filter(Boolean);
  return [];
}

function bool(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.toLowerCase() === "true";
  return fallback;
}

function numberOrUndefined(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);

    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

export function normalizeSavedReportFilters(filters: Record<string, unknown>): Partial<StandardReportFilters> & { isFavorite?: boolean } {
  const reportType = typeof filters.reportType === "string" ? filters.reportType as StandardReportType : undefined;
  const tab = typeof filters.tab === "string" ? filters.tab as StandardReportTab : reportType ? TYPE_TO_TAB[reportType] : undefined;
  return {
    tab,
    datePreset: typeof filters.datePreset === "string" ? filters.datePreset as DatePreset : undefined,
    startDate: typeof filters.startDate === "string" ? filters.startDate : undefined,
    endDate: typeof filters.endDate === "string" ? filters.endDate : undefined,
    groupBy: typeof filters.groupBy === "string" ? filters.groupBy as StandardGroupBy : undefined,
    accountIds: stringArray(filters.accountIds),
    categoryIds: stringArray(filters.categoryIds),
    budgetIds: stringArray(filters.budgetIds),
    tagIds: stringArray(filters.tagIds),
    merchantIds: stringArray(filters.merchantIds),
    includePending: bool(filters.includePending, DEFAULT_STANDARD_FILTERS.includePending),
    includeTransfers: bool(filters.includeTransfers, DEFAULT_STANDARD_FILTERS.includeTransfers),
    currencyCode: typeof filters.currencyCode === "string" ? filters.currencyCode : undefined,
    categoryGroupIds: stringArray(filters.categoryGroupIds),
    transactionTypes: stringArray(filters.transactionTypes),
    includeHidden: bool(filters.includeHidden, DEFAULT_STANDARD_FILTERS.includeHidden),
    includeSplits: bool(filters.includeSplits, DEFAULT_STANDARD_FILTERS.includeSplits),
    includeExcludedFromReports: bool(
      filters.includeExcludedFromReports,
      DEFAULT_STANDARD_FILTERS.includeExcludedFromReports,
    ),
    comparisonMode:
      filters.comparisonMode === "previous_period" || filters.comparisonMode === "previous_year"
        ? filters.comparisonMode
        : DEFAULT_STANDARD_FILTERS.comparisonMode,
    sortBy: typeof filters.sortBy === "string" && filters.sortBy ? filters.sortBy : undefined,
    sortDirection: filters.sortDirection === "asc" ? "asc" : DEFAULT_STANDARD_FILTERS.sortDirection,
    limit: numberOrUndefined(filters.limit) ?? DEFAULT_STANDARD_FILTERS.limit,
    minAmount: numberOrUndefined(filters.minAmount),
    maxAmount: numberOrUndefined(filters.maxAmount),
    searchText:
      typeof filters.searchText === "string" && filters.searchText.trim() ? filters.searchText.trim() : undefined,
    onlyUncategorized: bool(filters.onlyUncategorized, DEFAULT_STANDARD_FILTERS.onlyUncategorized),
    reconciledState:
      filters.reconciledState === "reconciled" || filters.reconciledState === "unreconciled"
        ? filters.reconciledState
        : DEFAULT_STANDARD_FILTERS.reconciledState,
    isFavorite: bool(filters.isFavorite, false),
  };
}

export function serializeReportFilters(filters: StandardReportFilters, isFavorite = false): Record<string, unknown> {
  return {
    reportType: mapReportTabToType(filters.tab),
    tab: filters.tab,
    datePreset: filters.datePreset,
    startDate: filters.startDate,
    endDate: filters.endDate,
    groupBy: filters.groupBy,
    accountIds: filters.accountIds,
    categoryIds: filters.categoryIds,
    budgetIds: filters.budgetIds,
    tagIds: filters.tagIds,
    merchantIds: filters.merchantIds,
    includePending: filters.includePending,
    includeTransfers: filters.includeTransfers,
    currencyCode: filters.currencyCode,
    categoryGroupIds: filters.categoryGroupIds,
    transactionTypes: filters.transactionTypes,
    includeHidden: filters.includeHidden,
    includeSplits: filters.includeSplits,
    includeExcludedFromReports: filters.includeExcludedFromReports,
    comparisonMode: filters.comparisonMode,
    sortBy: filters.sortBy,
    sortDirection: filters.sortDirection,
    limit: filters.limit,
    minAmount: filters.minAmount,
    maxAmount: filters.maxAmount,
    searchText: filters.searchText,
    onlyUncategorized: filters.onlyUncategorized,
    reconciledState: filters.reconciledState,
    isFavorite,
  };
}

export function buildStandardReportParams(filters: StandardReportFilters): URLSearchParams {
  const params = new URLSearchParams();
  params.set("reportType", mapReportTabToType(filters.tab));
  params.set("startDate", filters.startDate);
  params.set("endDate", filters.endDate);
  params.set("groupBy", filters.groupBy);
  const multi: Array<[string, string[]]> = [
    ["accountIds", filters.accountIds],
    ["categoryIds", filters.categoryIds],
    ["categoryGroupIds", filters.categoryGroupIds],
    ["budgetIds", filters.budgetIds],
    ["tagIds", filters.tagIds],
    ["merchantIds", filters.merchantIds],
    ["transactionTypes", filters.transactionTypes],
  ];
  for (const [key, values] of multi) {
    if (values?.length) params.set(key, values.join(","));
  }
  params.set("includePending", String(filters.includePending));
  params.set("includeTransfers", String(filters.includeTransfers));
  params.set("includeHidden", String(filters.includeHidden));
  params.set("includeSplits", String(filters.includeSplits));
  params.set("includeExcludedFromReports", String(filters.includeExcludedFromReports));
  params.set("comparisonMode", filters.comparisonMode);
  params.set("sortDirection", filters.sortDirection);
  params.set("limit", String(filters.limit));
  params.set("onlyUncategorized", String(filters.onlyUncategorized));
  params.set("reconciledState", filters.reconciledState);
  if (filters.sortBy) params.set("sortBy", filters.sortBy);
  // An absent bound and a bound of zero are different filters, so only send when present.
  if (filters.minAmount !== undefined) params.set("minAmount", String(filters.minAmount));
  if (filters.maxAmount !== undefined) params.set("maxAmount", String(filters.maxAmount));
  if (filters.searchText) params.set("searchText", filters.searchText);
  if (filters.currencyCode) params.set("currencyCode", filters.currencyCode.toUpperCase());
  return params;
}

export function standardReportPath(filters: StandardReportFilters): string {
  return `/reports/standard/generate?${buildStandardReportParams(filters).toString()}`;
}

export function standardDrilldownPath(filters: StandardReportFilters, drilldownParams: Record<string, string>): string {
  const params = buildStandardReportParams(filters);
  for (const [key, value] of Object.entries(drilldownParams)) params.set(key, value);
  return `/reports/standard/drilldown?${params.toString()}`;
}

export function standardExportPath(format: "csv" | "json", filters: StandardReportFilters, tableKey?: string): string {
  const params = buildStandardReportParams(filters);
  if (format === "csv" && tableKey) params.set("tableKey", tableKey);
  return `/reports/standard/export/${format}?${params.toString()}`;
}
