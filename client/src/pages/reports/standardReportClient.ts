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
}

export interface StandardSavedReport {
  id: string;
  name: string;
  filters: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

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
  charts: Array<{ key: string; title: string; type: "line" | "bar" | "table"; data: Array<Record<string, string | number | null>> }>;
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
    includePending: bool(filters.includePending, false),
    includeTransfers: bool(filters.includeTransfers, false),
    currencyCode: typeof filters.currencyCode === "string" ? filters.currencyCode : undefined,
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
    ["budgetIds", filters.budgetIds],
    ["tagIds", filters.tagIds],
    ["merchantIds", filters.merchantIds],
  ];
  for (const [key, values] of multi) {
    if (values.length) params.set(key, values.join(","));
  }
  params.set("includePending", String(filters.includePending));
  params.set("includeTransfers", String(filters.includeTransfers));
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
