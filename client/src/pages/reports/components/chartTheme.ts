import { CATEGORICAL_COLORS, fmtCurrency, fmtCurrencySigned, fmtPct } from "../shared";
import type { ChartSeries, ChartValueFormat } from "../standardReportClient";

const ROLE_COLORS: Record<ChartSeries["role"], string> = {
  income: "var(--color-success)",
  expense: "var(--color-danger)",
  net: "var(--color-accent)",
  budget: "var(--color-text-secondary)",
  actual: "var(--color-accent)",
  neutral: "var(--color-text-secondary)",
  categorical: CATEGORICAL_COLORS[0],
};

/** Colour for a series. `index` is used only when the role is categorical. */
export function seriesColor(role: ChartSeries["role"], index: number): string {
  if (role === "categorical") return CATEGORICAL_COLORS[index % CATEGORICAL_COLORS.length];
  return ROLE_COLORS[role];
}

export function sliceColor(index: number): string {
  return CATEGORICAL_COLORS[index % CATEGORICAL_COLORS.length];
}

export function formatValue(value: number | string | null, format: ChartValueFormat): string {
  if (value === null || value === "") return "—";
  if (format === "date") return String(value);
  const numeric = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(numeric)) return String(value);
  if (format === "currency") return fmtCurrencySigned(numeric);
  if (format === "percent") return fmtPct(numeric);
  return new Intl.NumberFormat("en-US").format(numeric);
}

/** Axis ticks want the compact, unsigned form. */
export function formatTick(value: number | string, format: ChartValueFormat): string {
  if (format === "currency") return fmtCurrency(Number(value));
  return formatValue(value, format);
}
