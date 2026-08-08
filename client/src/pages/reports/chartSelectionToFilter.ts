import type { ChartSelection } from "./components/ReportChart";
import type { StandardGroupBy, StandardReportFilters } from "./standardReportClient";

/**
 * Chart keys are chosen by the server in `server/src/lib/reporting/standard.ts`. Nothing in
 * the type system connects these strings to that file: renaming a chart `key` there must be
 * accompanied by a rename here, or the click silently stops filtering.
 */
type IdentityField = "categoryIds" | "merchantIds" | "accountIds" | "tagIds" | "budgetIds";

const IDENTITY_CHARTS: Record<string, IdentityField> = {
  spendingByCategory: "categoryIds",
  categorySpendingShare: "categoryIds",
  categoryIncomeShare: "categoryIds",
  topMerchants: "merchantIds",
  accountComparison: "accountIds",
  accountNetChange: "accountIds",
  tagSpendingShare: "tagIds",
  budgetVsActual: "budgetIds",
  budgetUtilization: "budgetIds",
};

/** Charts whose x-axis is a period key: clicking one narrows the date range instead. */
const PERIOD_CHARTS = new Set([
  "incomeExpenseTrend",
  "cashFlowByPeriod",
  "netByPeriod",
  "netTrend",
  "runningCashFlow",
  "cashFlowWaterfall",
  "categoryTrend",
  "tagTrend",
  "merchantTrend",
  "savingsRateTrend",
]);

/**
 * Placeholder ids the server emits for rows with no underlying entity. Sending one as a
 * real id would filter the report down to nothing, so a click on those rows does nothing.
 */
const SYNTHETIC_IDS = new Set(["__none__", "__uncategorized__", "__unknown__", "__ungrouped__", "__untagged__"]);

/**
 * Whether a click on this chart can produce a filter at all. Drives the pointer cursor so
 * charts the mapping does not cover never advertise an affordance they do not have.
 */
export function chartKeyIsFilterable(chartKey: string): boolean {
  return chartKey in IDENTITY_CHARTS || PERIOD_CHARTS.has(chartKey);
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function isoDate(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

/**
 * Invert the server's `periodKey()` (`server/src/lib/reporting/standard.ts`).
 *
 * The week scheme is deliberately *not* ISO-8601: the server counts whole 7-day blocks from
 * January 1, so week 1 is Jan 1–7 regardless of weekday. This mirrors that arithmetic. If the
 * server ever moves to ISO week numbering, this function must change in the same commit.
 */
export function periodKeyToRange(
  periodKey: string,
  groupBy: StandardGroupBy,
): { startDate: string; endDate: string } | null {
  if (groupBy === "year") {
    if (!/^\d{4}$/.test(periodKey)) return null;
    return { startDate: `${periodKey}-01-01`, endDate: `${periodKey}-12-31` };
  }

  if (groupBy === "quarter") {
    const match = /^(\d{4})-Q([1-4])$/.exec(periodKey);
    if (!match) return null;
    const year = match[1];
    const quarter = Number(match[2]);
    const startMonth = (quarter - 1) * 3 + 1;
    const endMonth = startMonth + 2;
    const endDay = new Date(Date.UTC(Number(year), endMonth, 0)).getUTCDate();
    return { startDate: `${year}-${pad(startMonth)}-01`, endDate: `${year}-${pad(endMonth)}-${pad(endDay)}` };
  }

  if (groupBy === "month") {
    const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(periodKey);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const endDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return { startDate: `${match[1]}-${match[2]}-01`, endDate: `${match[1]}-${match[2]}-${pad(endDay)}` };
  }

  if (groupBy === "week") {
    const match = /^(\d{4})-W(\d{2})$/.exec(periodKey);
    if (!match) return null;
    const year = Number(match[1]);
    const week = Number(match[2]);
    if (week < 1 || week > 53) return null;
    const start = Date.UTC(year, 0, 1) + (week - 1) * 604800000;
    const end = start + 6 * 86400000;
    // The final block of a year runs past December 31; days beyond it belong to next
    // year's week 1, so clamp rather than pulling them in.
    const yearEnd = Date.UTC(year, 11, 31);
    return { startDate: isoDate(start), endDate: isoDate(Math.min(end, yearEnd)) };
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(periodKey)) return null;
  return { startDate: periodKey, endDate: periodKey };
}

function toggleId(current: string[], id: string): string[] {
  return current.includes(id) ? current.filter((candidate) => candidate !== id) : [...current, id];
}

/**
 * Translate a chart click into a filter change.
 * Returns `null` when the selection carries nothing filterable — the caller then
 * does nothing at all, rather than guessing.
 */
export function chartSelectionToFilter(
  filters: StandardReportFilters,
  selection: ChartSelection,
): StandardReportFilters | null {
  const field = IDENTITY_CHARTS[selection.chartKey];
  if (field) {
    const id = selection.id;
    if (!id || SYNTHETIC_IDS.has(id)) return null;
    return { ...filters, [field]: toggleId(filters[field], id) };
  }

  if (PERIOD_CHARTS.has(selection.chartKey)) {
    if (!selection.x) return null;
    const range = periodKeyToRange(selection.x, filters.groupBy);
    if (!range) return null;
    return { ...filters, ...range, datePreset: "custom" };
  }

  return null;
}
