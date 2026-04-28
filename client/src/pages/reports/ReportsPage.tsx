import { useState, useMemo, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { ReportsSankeyChart, type SankeyData } from "./components/ReportsSankeyChart";
import { DrillPanel } from "./components/DrillPanel";
import { BudgetVarianceChart } from "./components/BudgetVarianceChart";
import { CashFlowForecast } from "./components/CashFlowForecast";
import { SlidersHorizontal, BookmarkPlus, ChevronDown, Trash2, Bookmark, X, BarChart2, GitMerge, Receipt } from "lucide-react";
import { ExportButtons } from "./components/ExportButtons";
import { TaxSummaryTab } from "./components/TaxSummaryTab";
import { api } from "@/lib/api";
import { Card, CardDivider, Skeleton, Modal, ModalFooter, Button, Input, notify } from "@/components/ui";
import { InstitutionLogo } from "@/components/ui/InstitutionLogo";

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORICAL_COLORS = [
  "#E5622A", // coral / accent
  "#1971c2", // blue
  "#9c36b5", // purple
  "#0c8599", // teal
  "#e67700", // orange
  "#2f9e44", // green
  "#f06595", // pink
  "#5c7cfa", // indigo
  "#f59f00", // yellow
  "#868e96", // slate
];

const DATE_PRESETS = [
  { value: "thisMonth", label: "This month" },
  { value: "lastMonth", label: "Last month" },
  { value: "last3months", label: "Last 3 months" },
  { value: "last6months", label: "Last 6 months" },
  { value: "thisYear", label: "This year" },
  { value: "lastYear", label: "Last year" },
  { value: "custom", label: "Custom range" },
] as const;

type DatePreset = (typeof DATE_PRESETS)[number]["value"];
type ReportTab = "cashflow" | "spending" | "income" | "forecast" | "tax" | "variance" | "benchmarks";
type ChartType = "donut" | "pie" | "bar" | "line";
type GroupBy = "category" | "merchant" | "account";

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

// ─── Formatters ───────────────────────────────────────────────────────────────

const fmtCurrency = (amount: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    Math.abs(amount),
  );

const fmtCurrencySigned = (amount: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    amount,
  );

const fmtPct = (value: number) => `${Math.round(value)}%`;

function fmtDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// ─── Date preset computation ──────────────────────────────────────────────────

function computeDateRange(preset: DatePreset): {
  startDate: string;
  endDate: string;
} {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();

  switch (preset) {
    case "thisMonth":
      return {
        startDate: fmtDate(new Date(y, m, 1)),
        endDate: fmtDate(new Date(y, m + 1, 0)),
      };
    case "lastMonth":
      return {
        startDate: fmtDate(new Date(y, m - 1, 1)),
        endDate: fmtDate(new Date(y, m, 0)),
      };
    case "last3months": {
      const start = new Date(y, m - 2, 1);
      return {
        startDate: fmtDate(start),
        endDate: fmtDate(new Date(y, m + 1, 0)),
      };
    }
    case "last6months": {
      const start = new Date(y, m - 5, 1);
      return {
        startDate: fmtDate(start),
        endDate: fmtDate(new Date(y, m + 1, 0)),
      };
    }
    case "thisYear":
      return {
        startDate: fmtDate(new Date(y, 0, 1)),
        endDate: fmtDate(new Date(y, 11, 31)),
      };
    case "lastYear":
      return {
        startDate: fmtDate(new Date(y - 1, 0, 1)),
        endDate: fmtDate(new Date(y - 1, 11, 31)),
      };
    default:
      return {
        startDate: fmtDate(new Date(y, m - 2, 1)),
        endDate: fmtDate(new Date(y, m + 1, 0)),
      };
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface CategoryBreakdown {
  id: string;
  name: string;
  icon?: string;
  amount: number;
  percent: number;
  transactionCount: number;
}

interface SpendingReport {
  total: number;
  largest?: { merchantName: string; amount: number; date: string };
  average: number;
  transactionCount: number;
  startDate: string;
  endDate: string;
  firstDate: string | null;
  lastDate: string | null;
  items: CategoryBreakdown[];
}

interface IncomeReport {
  total: number;
  largest?: { merchantName: string; amount: number; date: string };
  average: number;
  transactionCount: number;
  startDate: string;
  endDate: string;
  firstDate: string | null;
  lastDate: string | null;
  items: CategoryBreakdown[];
}

interface CashFlowMonth {
  month: number;
  income: number;
  expenses: number;
  net: number;
}

interface CashFlowMonthly {
  month: string; // e.g. "Jan 2025"
  income: number;
  expenses: number;
  net: number;
}

interface CashFlowReport {
  income: number;
  expenses: number;
  net: number;
  savingsRate: number;
  byMonth: CashFlowMonth[];
  monthly: CashFlowMonthly[];
}

// ─── Compare / Monthly types ──────────────────────────────────────────────────

interface CompareItem {
  id: string;
  name: string;
  icon: string | null;
  current: number;
  prior: number;
  delta: number;
  deltaPercent: number;
}

interface CompareReport {
  items: CompareItem[];
  currentTotal: number;
  priorTotal: number;
  totalDelta: number;
}

interface MonthlySeriesItem {
  id: string;
  name: string;
  icon: string | null;
  data: number[];
}

interface MonthlyReport {
  months: string[];
  series: MonthlySeriesItem[];
}

interface ReportTransaction {
  id: string;
  merchantName: string;
  /** @deprecated kept for backwards compat — use merchantName */
  merchant?: string;
  categoryName: string | null;
  categoryIcon?: string | null;
  categoryColor?: string | null;
  accountName: string;
  amount: number;
  date: string;
}

interface TransactionsResponse {
  transactions: ReportTransaction[];
  total: number;
  page: number;
  totalPages: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function merchantInitial(name: string) {
  return (name ?? "?")[0].toUpperCase();
}

function netColor(net: number): string {
  return net >= 0 ? "var(--color-success)" : "var(--color-danger)";
}

function savingsColor(pct: number): string {
  if (pct >= 20) return "var(--color-success)";
  if (pct >= 10) return "var(--color-warning)";
  return "var(--color-danger)";
}

// ─── HorizontalBar ────────────────────────────────────────────────────────────

function HorizontalBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div
      style={{
        flex: 1,
        height: 6,
        backgroundColor: "var(--color-border)",
        borderRadius: "var(--radius-full)",
        overflow: "hidden",
        minWidth: 60,
      }}
    >
      <div
        style={{
          height: "100%",
          width: `${Math.min(pct, 100)}%`,
          backgroundColor: color,
          borderRadius: "var(--radius-full)",
          transition: "width 0.4s ease",
        }}
      />
    </div>
  );
}

// ─── LegendDot ────────────────────────────────────────────────────────────────

function LegendDot({
  color,
  label,
  line,
}: {
  color: string;
  label: string;
  line?: boolean;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
      {line ? (
        <div
          style={{
            width: 16,
            height: 2,
            backgroundColor: color,
            borderRadius: 1,
          }}
        />
      ) : (
        <div
          style={{
            width: 10,
            height: 10,
            borderRadius: 2,
            backgroundColor: color,
          }}
        />
      )}
      <span
        style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)" }}
      >
        {label}
      </span>
    </div>
  );
}

// ─── DatePresetDropdown ───────────────────────────────────────────────────────

function DatePresetDropdown({
  value,
  onChange,
}: {
  value: DatePreset;
  onChange: (v: DatePreset) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = DATE_PRESETS.find((p) => p.value === value);

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.375rem",
          padding: "0.3125rem 0.75rem",
          borderRadius: "var(--radius-md)",
          fontSize: "0.8125rem",
          fontWeight: 500,
          border: "1px solid var(--color-border)",
          backgroundColor: "var(--color-surface)",
          color: "var(--color-text)",
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        {selected?.label ?? "Select range"}
        <ChevronDown
          size={13}
          style={{ color: "var(--color-text-secondary)" }}
        />
      </button>

      {open && (
        <>
          <div
            style={{ position: "fixed", inset: 0, zIndex: 40 }}
            onClick={() => setOpen(false)}
          />
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 4px)",
              right: 0,
              zIndex: 41,
              backgroundColor: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-md)",
              boxShadow: "var(--shadow-md)",
              minWidth: 160,
              overflow: "hidden",
            }}
          >
            {DATE_PRESETS.map((preset) => (
              <button
                key={preset.value}
                onClick={() => {
                  onChange(preset.value);
                  setOpen(false);
                }}
                style={{
                  display: "block",
                  width: "100%",
                  padding: "0.5rem 0.875rem",
                  fontSize: "0.8125rem",
                  textAlign: "left",
                  border: "none",
                  cursor: "pointer",
                  backgroundColor:
                    value === preset.value
                      ? "var(--color-accent-light)"
                      : "transparent",
                  color:
                    value === preset.value
                      ? "var(--color-accent)"
                      : "var(--color-text)",
                  fontWeight: value === preset.value ? 600 : 400,
                }}
                onMouseEnter={(e) => {
                  if (value !== preset.value)
                    e.currentTarget.style.backgroundColor =
                      "var(--color-surface-hover)";
                }}
                onMouseLeave={(e) => {
                  if (value !== preset.value)
                    e.currentTarget.style.backgroundColor = "transparent";
                }}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Spending Benchmarks Tab ──────────────────────────────────────────────────

interface BenchmarkCategory {
  key: string;
  label: string;
  blsMonthlyAvg: number;
  blsPctOfIncome: number;
  actualTotal: number;
  actualMonthlyAvg: number;
}

function SpendingBenchmarksTab({ startDate, endDate }: { startDate: string; endDate: string }) {
  const { data, isLoading, isError } = useQuery<{
    startDate: string;
    endDate: string;
    months: number;
    categories: BenchmarkCategory[];
  }>({
    queryKey: ['reports', 'benchmarks', startDate, endDate],
    queryFn: () =>
      api.get(`/reports/benchmarks?startDate=${startDate}&endDate=${endDate}`).then((r) => r.data),
  });

  const fmtC = (n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

  if (isLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '1rem 0' }}>
        {[1,2,3,4,5].map((i) => (
          <div key={i} style={{ height: '3.5rem', borderRadius: 'var(--radius-md)', background: 'var(--color-surface-hover)', animation: 'pulse 1.5s infinite' }} />
        ))}
      </div>
    );
  }

  if (isError || !data) {
    return <p style={{ color: 'var(--color-danger)', fontSize: '0.875rem', padding: '1rem 0' }}>Failed to load benchmarks.</p>;
  }

  const maxMonthly = Math.max(...data.categories.map((c) => Math.max(c.blsMonthlyAvg, c.actualMonthlyAvg)), 1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', paddingTop: '1rem' }}>
      <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
        Comparing your monthly averages ({data.months} month{data.months !== 1 ? 's' : ''}) against BLS Consumer Expenditure Survey 2023 national averages.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {data.categories.map((cat) => {
          const overBudget = cat.actualMonthlyAvg > cat.blsMonthlyAvg;
          const pct = cat.blsMonthlyAvg > 0 ? ((cat.actualMonthlyAvg - cat.blsMonthlyAvg) / cat.blsMonthlyAvg) * 100 : 0;
          return (
            <div key={cat.key} style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: '0.875rem 1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.5rem' }}>
                <span style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--color-text)' }}>{cat.label}</span>
                <span style={{ fontSize: '0.75rem', color: overBudget ? 'var(--color-danger)' : 'var(--color-success)', fontWeight: 600 }}>
                  {cat.actualMonthlyAvg === 0 ? 'No spending' : overBudget ? `+${Math.round(pct)}% vs avg` : `${Math.round(pct)}% vs avg`}
                </span>
              </div>

              {/* BLS bar */}
              <div style={{ marginBottom: '0.4rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.6875rem', color: 'var(--color-text-muted)', marginBottom: '0.2rem' }}>
                  <span>BLS avg</span><span>{fmtC(cat.blsMonthlyAvg)}/mo</span>
                </div>
                <div style={{ height: '6px', background: 'var(--color-border)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${(cat.blsMonthlyAvg / maxMonthly) * 100}%`, background: 'var(--color-text-muted)', borderRadius: 'var(--radius-full)' }} />
                </div>
              </div>

              {/* Actual bar */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.6875rem', color: 'var(--color-text-muted)', marginBottom: '0.2rem' }}>
                  <span>You</span><span>{fmtC(cat.actualMonthlyAvg)}/mo</span>
                </div>
                <div style={{ height: '6px', background: 'var(--color-border)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${(cat.actualMonthlyAvg / maxMonthly) * 100}%`, background: overBudget ? 'var(--color-danger)' : 'var(--color-success)', borderRadius: 'var(--radius-full)' }} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <p style={{ margin: 0, fontSize: '0.6875rem', color: 'var(--color-text-muted)' }}>
        Source: U.S. Bureau of Labor Statistics, Consumer Expenditure Survey 2023. Averages based on all U.S. consumer units (~$80k avg income).
      </p>
    </div>
  );
}

// ─── Tab bar ──────────────────────────────────────────────────────────────────

function TabBar({
  tab,
  onChange,
}: {
  tab: ReportTab;
  onChange: (t: ReportTab) => void;
}) {
  const TABS: { value: ReportTab; label: string }[] = [
    { value: "cashflow", label: "Cash Flow" },
    { value: "spending", label: "Spending" },
    { value: "income", label: "Income" },
    { value: "variance", label: "Variance" },
    { value: "forecast", label: "Forecast" },
    { value: "tax", label: "Tax Summary" },
    { value: "benchmarks", label: "Benchmarks" },
  ];

  return (
    <div
      style={{
        display: "flex",
        gap: 0,
        borderBottom: "1px solid var(--color-border)",
      }}
    >
      {TABS.map((t) => (
        <button
          key={t.value}
          onClick={() => onChange(t.value)}
          style={{
            padding: "0.5rem 1rem",
            fontSize: "0.875rem",
            fontWeight: tab === t.value ? 600 : 400,
            color:
              tab === t.value
                ? "var(--color-accent)"
                : "var(--color-text-secondary)",
            border: "none",
            borderBottom:
              tab === t.value
                ? "2px solid var(--color-accent)"
                : "2px solid transparent",
            backgroundColor: "transparent",
            cursor: "pointer",
            marginBottom: "-1px",
            transition: "color 0.15s",
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ─── KPI Cards ────────────────────────────────────────────────────────────────

function KpiCards({
  cards,
  isLoading,
}: {
  cards: { label: string; value: string; color: string }[];
  isLoading: boolean;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {cards.map((card) => (
        <Card key={card.label} padding="lg">
          {isLoading ? (
            <>
              <Skeleton
                height={12}
                width="70%"
                style={{ marginBottom: "0.625rem" }}
              />
              <Skeleton height={28} width="85%" />
            </>
          ) : (
            <>
              <div
                style={{
                  fontSize: "0.75rem",
                  fontWeight: 500,
                  color: "var(--color-text-secondary)",
                  marginBottom: "0.375rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                }}
              >
                {card.label}
              </div>
              <div
                style={{
                  fontSize: "1.5rem",
                  fontWeight: 700,
                  color: card.color,
                  lineHeight: 1.1,
                }}
              >
                {card.value}
              </div>
            </>
          )}
        </Card>
      ))}
    </div>
  );
}

// ReportsSankeyChart is now imported from ./components/ReportsSankeyChart

// ─── Cash Flow Tab ────────────────────────────────────────────────────────────

function CashFlowTab({
  startDate,
  endDate,
  extraParams = "",
}: {
  startDate: string;
  endDate: string;
  extraParams?: string;
}) {
  const { data, isLoading } = useQuery<CashFlowReport>({
    queryKey: ["reports-cashflow", startDate, endDate, extraParams],
    queryFn: () =>
      api
        .get(`/reports/cashflow?startDate=${startDate}&endDate=${endDate}${extraParams}`)
        .then((r) => r.data),
  });

  const { data: sankeyData } = useQuery<SankeyData>({
    queryKey: ["reports-sankey", startDate, endDate, extraParams],
    queryFn: () =>
      api
        .get(`/cashflow/sankey?startDate=${startDate}&endDate=${endDate}${extraParams}`)
        .then((r) => r.data),
  });

  const kpiCards = [
    {
      label: "Total Income",
      value: fmtCurrencySigned(data?.income ?? 0),
      color: "var(--color-success)",
    },
    {
      label: "Total Expenses",
      value: fmtCurrencySigned(data?.expenses ?? 0),
      color: "var(--color-danger)",
    },
    {
      label: "Net Income",
      value: fmtCurrencySigned(data?.net ?? 0),
      color: netColor(data?.net ?? 0),
    },
    {
      label: "Savings Rate",
      value: fmtPct(data?.savingsRate ?? 0),
      color: savingsColor(data?.savingsRate ?? 0),
    },
  ];

  // Build chart data keyed by month index
  const chartData = useMemo(() => {
    if (!data?.monthly) return [];
    return data.monthly.map((m) => ({
      month: m.month.split(" ")[0], // e.g. "Jan"
      fullMonth: m.month,           // e.g. "Jan 2025"
      income: m.income,
      expenses: m.expenses,
      net: m.net,
    }));
  }, [data]);

  // "bar" = grouped bar + line chart, "sankey" = money flow Sankey
  const [cfChartView, setCfChartView] = useState<"bar" | "sankey">("bar");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <KpiCards cards={kpiCards} isLoading={isLoading} />

      {/* Combined chart card with view toggle */}
      <Card padding="lg">
        {isLoading ? (
          <Skeleton height={300} width="100%" />
        ) : (
          <>
            {/* Header row */}
            <div
              style={{
                marginBottom: "0.75rem",
                display: "flex",
                alignItems: "center",
                gap: "1rem",
              }}
            >
              <span
                style={{
                  fontSize: "0.875rem",
                  fontWeight: 600,
                  color: "var(--color-text-secondary)",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                }}
              >
                {cfChartView === "bar" ? "Cash Flow Overview" : "Money Flow"}
              </span>

              {/* View toggle icons */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.25rem",
                  marginLeft: "auto",
                  backgroundColor: "var(--color-surface-hover)",
                  borderRadius: "var(--radius-md)",
                  padding: "0.125rem",
                }}
              >
                <button
                  title="Bar chart view"
                  onClick={() => setCfChartView("bar")}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 28,
                    height: 28,
                    borderRadius: "calc(var(--radius-md) - 2px)",
                    border: "none",
                    cursor: "pointer",
                    backgroundColor:
                      cfChartView === "bar"
                        ? "var(--color-surface)"
                        : "transparent",
                    color:
                      cfChartView === "bar"
                        ? "var(--color-accent)"
                        : "var(--color-text-muted)",
                    boxShadow:
                      cfChartView === "bar" ? "var(--shadow-sm)" : "none",
                    transition: "all 0.15s",
                  }}
                >
                  <BarChart2 size={14} />
                </button>
                <button
                  title="Money flow (Sankey) view"
                  onClick={() => setCfChartView("sankey")}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 28,
                    height: 28,
                    borderRadius: "calc(var(--radius-md) - 2px)",
                    border: "none",
                    cursor: "pointer",
                    backgroundColor:
                      cfChartView === "sankey"
                        ? "var(--color-surface)"
                        : "transparent",
                    color:
                      cfChartView === "sankey"
                        ? "var(--color-accent)"
                        : "var(--color-text-muted)",
                    boxShadow:
                      cfChartView === "sankey" ? "var(--shadow-sm)" : "none",
                    transition: "all 0.15s",
                  }}
                >
                  <GitMerge size={14} />
                </button>
              </div>

              {/* Legend (only for bar view) */}
              {cfChartView === "bar" && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "1rem",
                  }}
                >
                  <LegendDot color="#2f9e44" label="Income" />
                  <LegendDot color="#E5622A" label="Expenses" />
                  <LegendDot color="#1971c2" label="Net" line />
                </div>
              )}
            </div>

            {/* Bar chart view */}
            {cfChartView === "bar" && (
              chartData.length > 0 ? (
                <div role="img" aria-label="Cash flow overview chart">
                  <ResponsiveContainer width="100%" height={260}>
                    <ComposedChart
                      data={chartData}
                      margin={{ top: 4, right: 8, bottom: 0, left: 0 }}
                      barCategoryGap="20%"
                      barGap={4}
                    >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="var(--color-border)"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="month"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 11, fill: "var(--color-text-muted)" }}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 11, fill: "var(--color-text-muted)" }}
                      tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
                      width={42}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "var(--color-surface)",
                        border: "1px solid var(--color-border)",
                        borderRadius: "var(--radius-md)",
                        fontSize: "0.8125rem",
                      }}
                      labelFormatter={(label: string, payload: { payload?: { fullMonth?: string } }[]) => {
                        const full = payload?.[0]?.payload?.fullMonth;
                        return full ?? label;
                      }}
                      formatter={(value: number, name: string) => [
                        fmtCurrencySigned(value),
                        name === "income"
                          ? "Income"
                          : name === "expenses"
                            ? "Expenses"
                            : "Net",
                      ]}
                    />
                    <Bar
                      dataKey="income"
                      name="income"
                      fill="#2f9e44"
                      radius={[3, 3, 0, 0]}
                      maxBarSize={26}
                      opacity={0.88}
                    />
                    <Bar
                      dataKey="expenses"
                      name="expenses"
                      fill="#E5622A"
                      radius={[3, 3, 0, 0]}
                      maxBarSize={26}
                      opacity={0.88}
                    />
                    <Line
                      type="monotone"
                      dataKey="net"
                      name="net"
                      stroke="#1971c2"
                      strokeWidth={2}
                      strokeDasharray="5 3"
                      dot={{ r: 3, fill: "#1971c2", strokeWidth: 0 }}
                    />
                  </ComposedChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    height: 260,
                    color: "var(--color-text-muted)",
                    fontSize: "0.875rem",
                  }}
                >
                  No cash flow data for this period.
                </div>
              )
            )}

            {/* Sankey view */}
            {cfChartView === "sankey" && sankeyData && (
              <ReportsSankeyChart data={sankeyData} />
            )}
            {cfChartView === "sankey" && !sankeyData && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  height: 260,
                  color: "var(--color-text-muted)",
                  fontSize: "0.875rem",
                }}
              >
                No money flow data for this period.
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}

// ─── Spending / Income tab (shared layout) ────────────────────────────────────

interface CategoryTabProps {
  mode: "spending" | "income";
  startDate: string;
  endDate: string;
  extraParams?: string;
  onDrillClick?: (id: string, name: string, icon: string | null | undefined, mode: "spending" | "income", groupBy: string) => void;
}

function CategoryTab({ mode, startDate, endDate, extraParams = "", onDrillClick }: CategoryTabProps) {
  const [groupBy, setGroupBy] = useState<GroupBy>("category");
  const [chartType, setChartType] = useState<ChartType>("donut");
  const [showAll, setShowAll] = useState(false);
  const [txPage, setTxPage] = useState(1);
  const [viewMode, setViewMode] = useState<'totals' | 'change'>('totals');
  const [monthlyGrouping, setMonthlyGrouping] = useState<MonthlyGrouping>('monthly');

  const { data: reportData, isLoading: reportLoading } = useQuery<
    SpendingReport | IncomeReport
  >({
    queryKey: [`reports-${mode}`, startDate, endDate, groupBy, extraParams],
    queryFn: () =>
      api
        .get(
          `/reports/${mode}?startDate=${startDate}&endDate=${endDate}&groupBy=${groupBy}${extraParams}`,
        )
        .then((r) => r.data),
    enabled: true,
  });

  const { data: txData, isLoading: txLoading } = useQuery<TransactionsResponse>(
    {
      queryKey: [`reports-${mode}-transactions`, startDate, endDate, txPage, extraParams],
      queryFn: () => {
        // Filter by sign: spending = negative amounts, income = positive amounts
        const amountFilter = mode === "spending" ? "&maxAmount=-0.01" : "&minAmount=0.01";
        return api
          .get(
            `/transactions?startDate=${startDate}&endDate=${endDate}${amountFilter}&page=${txPage}&pageSize=20${extraParams}`,
          )
          .then((r) => r.data);
      },
    },
  );

  const { data: compareData, isLoading: compareLoading } = useQuery<CompareReport>({
    queryKey: [`reports-${mode}-compare`, startDate, endDate, groupBy, extraParams],
    queryFn: () =>
      api
        .get(`/reports/${mode}/compare?startDate=${startDate}&endDate=${endDate}&groupBy=${groupBy}${extraParams}`)
        .then((r) => r.data),
    enabled: viewMode === 'change',
  });

  const { data: monthlyData, isLoading: monthlyLoading } = useQuery<MonthlyReport>({
    queryKey: [`reports-${mode}-monthly`, startDate, endDate, groupBy, extraParams],
    queryFn: () =>
      api
        .get(`/reports/${mode}/monthly?startDate=${startDate}&endDate=${endDate}&groupBy=${groupBy}${extraParams}`)
        .then((r) => r.data),
    enabled: viewMode === 'change',
  });

  const categories = reportData?.items ?? [];
  const displayedCategories = showAll ? categories : categories.slice(0, 8);
  const total = reportData?.total ?? 0;

  // KPI cards
  const color =
    mode === "spending" ? "var(--color-danger)" : "var(--color-success)";
  const kpiCards = [
    {
      label: mode === "spending" ? "Total Spending" : "Total Income",
      value: fmtCurrency(total),
      color,
    },
    {
      label: "Transactions",
      value: String(reportData?.transactionCount ?? 0),
      color: "var(--color-text)",
    },
    {
      label: "Largest Transaction",
      value: reportData?.largest ? fmtCurrency(reportData.largest.amount) : "—",
      color: "var(--color-text)",
    },
    {
      label: "Avg Transaction",
      value: fmtCurrency(reportData?.average ?? 0),
      color: "var(--color-text-secondary)",
    },
  ];

  const GROUP_BY_OPTIONS: { value: GroupBy; label: string }[] = [
    { value: "category", label: "By category" },
    { value: "merchant", label: "By merchant" },
    { value: "account", label: "By account" },
  ];

  const CHART_TYPES: { value: ChartType; label: string }[] = [
    { value: "donut", label: "Donut" },
    { value: "pie", label: "Pie" },
    { value: "bar", label: "Bar" },
    { value: "line", label: "Line" },
  ];

  // Recharts pie data
  const pieData = displayedCategories.map((cat, i) => ({
    id: cat.id,
    name: cat.name,
    icon: cat.icon,
    value: cat.amount,
    pct: cat.percent,
    color: CATEGORICAL_COLORS[i % CATEGORICAL_COLORS.length],
  }));

  const transactions = txData?.transactions ?? [];
  const txTotal = txData?.total ?? 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <KpiCards cards={kpiCards} isLoading={reportLoading} />

      {/* Chart area header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "0.5rem",
        }}
      >
        <span
          style={{
            fontSize: "1rem",
            fontWeight: 600,
            color: "var(--color-text)",
          }}
        >
          {mode === "spending" ? "Spending" : "Income"} by Category
        </span>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            flexWrap: "wrap",
          }}
        >
          {/* Totals / Change toggle */}
          <div
            style={{
              display: 'flex',
              backgroundColor: 'var(--color-surface-hover)',
              borderRadius: 'var(--radius-md)',
              padding: '0.125rem',
            }}
          >
            {(['totals', 'change'] as Array<'totals' | 'change'>).map((vm) => (
              <button
                key={vm}
                onClick={() => setViewMode(vm)}
                style={{
                  padding: '0.25rem 0.625rem',
                  borderRadius: 'calc(var(--radius-md) - 2px)',
                  fontSize: '0.75rem',
                  fontWeight: 500,
                  border: 'none',
                  cursor: 'pointer',
                  backgroundColor: viewMode === vm ? 'var(--color-surface)' : 'transparent',
                  color: viewMode === vm ? 'var(--color-text)' : 'var(--color-text-secondary)',
                  boxShadow: viewMode === vm ? 'var(--shadow-sm)' : 'none',
                  transition: 'all 0.15s',
                  textTransform: 'capitalize',
                }}
              >
                {vm === 'totals' ? 'Totals' : 'Change'}
              </button>
            ))}
          </div>

          {/* Group by */}
          <GroupByDropdown
            value={groupBy}
            onChange={setGroupBy}
            options={GROUP_BY_OPTIONS}
          />

          {/* Chart type selector */}
          <div
            style={{
              display: "flex",
              backgroundColor: "var(--color-surface-hover)",
              borderRadius: "var(--radius-md)",
              padding: "0.125rem",
            }}
          >
            {CHART_TYPES.map((ct) => (
              <button
                key={ct.value}
                onClick={() => setChartType(ct.value)}
                style={{
                  padding: "0.25rem 0.625rem",
                  borderRadius: "calc(var(--radius-md) - 2px)",
                  fontSize: "0.75rem",
                  fontWeight: 500,
                  border: "none",
                  cursor: "pointer",
                  backgroundColor:
                    chartType === ct.value
                      ? "var(--color-surface)"
                      : "transparent",
                  color:
                    chartType === ct.value
                      ? "var(--color-text)"
                      : "var(--color-text-secondary)",
                  boxShadow:
                    chartType === ct.value ? "var(--shadow-sm)" : "none",
                  transition: "all 0.15s",
                }}
              >
                {ct.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main 2-column chart layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[55fr_45fr] gap-4 items-start">
        {/* Left: chart */}
        <Card padding="lg">
          {viewMode === 'change' ? (
            <>
              <CompareView
                data={compareData}
                isLoading={compareLoading}
                mode={mode}
                monthlyGrouping={monthlyGrouping}
                onMonthlyGroupingChange={setMonthlyGrouping}
                onDrillClick={onDrillClick ? (id, name, icon, m) => onDrillClick(id, name, icon, m, groupBy) : undefined}
              />
              {!compareLoading && compareData && compareData.items.length > 0 && (
                <div style={{ marginTop: '1.25rem' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.75rem' }}>
                    Monthly Breakdown
                  </div>
                  <MonthlyView data={monthlyData} isLoading={monthlyLoading} grouping={monthlyGrouping} />
                </div>
              )}
            </>
          ) : reportLoading ? (
            <Skeleton height={320} width="100%" />
          ) : categories.length === 0 ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                height: 240,
                color: "var(--color-text-muted)",
                fontSize: "0.875rem",
              }}
            >
              No {mode} data for this period.
            </div>
          ) : (
            <>
              <ChartView
                type={chartType}
                data={pieData}
                total={total}
                color={color}
                onDrillClick={onDrillClick ? (id, name, icon) => onDrillClick(id, name, icon, mode, groupBy) : undefined}
              />

              {/* Legend */}
              <div
                style={{
                  marginTop: "1rem",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.375rem",
                }}
              >
                {displayedCategories.map((cat, i) => (
                  <div
                    key={cat.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                    }}
                  >
                    <div
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: 2,
                        backgroundColor:
                          CATEGORICAL_COLORS[i % CATEGORICAL_COLORS.length],
                        flexShrink: 0,
                      }}
                    />
                    <span
                      style={{
                        fontSize: "0.8125rem",
                        color: "var(--color-text)",
                        flex: 1,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {cat.icon ? `${cat.icon} ` : ""}
                      {cat.name}
                    </span>
                    <span
                      style={{
                        fontSize: "0.8125rem",
                        fontWeight: 600,
                        color: "var(--color-text)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {fmtCurrency(cat.amount)}
                    </span>
                    <span
                      style={{
                        fontSize: "0.75rem",
                        color: "var(--color-text-muted)",
                        minWidth: 36,
                        textAlign: "right",
                      }}
                    >
                      {fmtPct(cat.percent)}
                    </span>
                  </div>
                ))}
              </div>

              {categories.length > 8 && (
                <button
                  onClick={() => setShowAll((s) => !s)}
                  style={{
                    marginTop: "0.75rem",
                    fontSize: "0.8125rem",
                    fontWeight: 500,
                    color: "var(--color-accent)",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: 0,
                  }}
                >
                  {showAll
                    ? "Show fewer categories"
                    : `Show all ${categories.length} categories`}
                </button>
              )}
            </>
          )}
        </Card>

        {/* Right: summary panel */}
        <Card padding="lg">
          {reportLoading ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.75rem",
              }}
            >
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} height={24} width="100%" />
              ))}
            </div>
          ) : (
            <>
              {/* Summary stats */}
              <div style={{ marginBottom: "1rem" }}>
                <div
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    color: "var(--color-text-secondary)",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    marginBottom: "0.75rem",
                  }}
                >
                  Summary
                </div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.5rem",
                  }}
                >
                  <SummaryRow
                    label={mode === "spending" ? "Total spending" : "Total income"}
                    value={fmtCurrency(reportData?.total ?? 0)}
                  />
                  <SummaryRow
                    label="Total transactions"
                    value={String(reportData?.transactionCount ?? 0)}
                  />
                  {reportData?.largest && (
                    <SummaryRow
                      label="Largest transaction"
                      value={`${reportData.largest.merchantName} — ${fmtCurrency(reportData.largest.amount)}`}
                    />
                  )}
                  <SummaryRow
                    label="Average transaction"
                    value={fmtCurrency(reportData?.average ?? 0)}
                  />
                  {reportData?.firstDate && (
                    <SummaryRow
                      label="First transaction"
                      value={new Date(reportData.firstDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    />
                  )}
                  {reportData?.lastDate && (
                    <SummaryRow
                      label="Last transaction"
                      value={new Date(reportData.lastDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    />
                  )}
                </div>
              </div>

              <CardDivider />

              {/* Category list */}
              <div style={{ marginTop: "1rem" }}>
                <div
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    color: "var(--color-text-secondary)",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    marginBottom: "0.75rem",
                  }}
                >
                  Breakdown
                </div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.625rem",
                  }}
                >
                  {displayedCategories.map((cat, i) => (
                    <div key={cat.id}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.5rem",
                          marginBottom: "0.25rem",
                        }}
                      >
                        <div
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: 2,
                            backgroundColor:
                              CATEGORICAL_COLORS[i % CATEGORICAL_COLORS.length],
                            flexShrink: 0,
                          }}
                        />
                        <span
                          style={{
                            fontSize: "0.8125rem",
                            color: "var(--color-text)",
                            flex: 1,
                          }}
                        >
                          {cat.name}
                        </span>
                        <span
                          style={{
                            fontSize: "0.8125rem",
                            fontWeight: 600,
                            color: "var(--color-text)",
                          }}
                        >
                          {fmtCurrency(cat.amount)}
                        </span>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.5rem",
                          paddingLeft: "1rem",
                        }}
                      >
                        <HorizontalBar
                          pct={cat.percent}
                          color={
                            CATEGORICAL_COLORS[i % CATEGORICAL_COLORS.length]
                          }
                        />
                        <span
                          style={{
                            fontSize: "0.75rem",
                            color: "var(--color-text-muted)",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {cat.transactionCount} txn
                          {cat.transactionCount !== 1 ? "s" : ""}
                        </span>
                      </div>
                    </div>
                  ))}
                  {categories.length === 0 && (
                    <span
                      style={{
                        fontSize: "0.875rem",
                        color: "var(--color-text-muted)",
                      }}
                    >
                      No data.
                    </span>
                  )}
                </div>
              </div>
            </>
          )}
        </Card>
      </div>

      {/* Transaction list */}
      <Card padding="lg">
        <div
          style={{
            fontSize: "0.875rem",
            fontWeight: 600,
            color: "var(--color-text-secondary)",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            marginBottom: "1rem",
          }}
        >
          Transactions ({txTotal})
        </div>

        {txLoading ? (
          <div
            style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}
          >
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} height={48} width="100%" />
            ))}
          </div>
        ) : transactions.length === 0 ? (
          <div
            style={{
              color: "var(--color-text-muted)",
              fontSize: "0.875rem",
              padding: "1rem 0",
            }}
          >
            No transactions found for this period.
          </div>
        ) : (
          <>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {transactions.map((txn, idx) => (
                <TransactionRow
                  key={txn.id}
                  txn={txn}
                  isLast={idx === transactions.length - 1}
                />
              ))}
            </div>

            {txPage * 20 < txTotal && (
              <button
                onClick={() => setTxPage((p) => p + 1)}
                style={{
                  marginTop: "1rem",
                  display: "block",
                  width: "100%",
                  padding: "0.625rem",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--color-border)",
                  backgroundColor: "var(--color-surface)",
                  color: "var(--color-text-secondary)",
                  fontSize: "0.875rem",
                  fontWeight: 500,
                  cursor: "pointer",
                  transition: "background-color 0.15s",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.backgroundColor =
                    "var(--color-surface-hover)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.backgroundColor =
                    "var(--color-surface)")
                }
              >
                Load more ({txTotal - txPage * 20} remaining)
              </button>
            )}
          </>
        )}
      </Card>
    </div>
  );
}

// ─── ChartView ────────────────────────────────────────────────────────────────

interface PieEntry {
  id: string;
  name: string;
  icon?: string;
  value: number;
  pct: number;
  color: string;
}

function ChartView({
  type,
  data,
  total,
  color,
  onDrillClick,
}: {
  type: ChartType;
  data: PieEntry[];
  total: number;
  color: string;
  onDrillClick?: (id: string, name: string, icon?: string) => void;
}) {
  if (type === "donut" || type === "pie") {
    const innerRadius = type === "donut" ? 80 : 0;

    return (
      <div role="img" aria-label="Spending breakdown chart" style={{ position: "relative" }}>
        <ResponsiveContainer width="100%" height={240}>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={innerRadius}
              outerRadius={110}
              paddingAngle={2}
              animationBegin={0}
              animationDuration={600}
              onClick={(entry: PieEntry) => {
                if (entry.id && onDrillClick) {
                  onDrillClick(entry.id, entry.name, entry.icon);
                }
              }}
              style={{ cursor: onDrillClick ? "pointer" : undefined }}
            >
              {data.map((entry, i) => (
                <Cell key={`cell-${i}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: "var(--color-surface)",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-md)",
                fontSize: "0.8125rem",
              }}
              formatter={(value: number) => [fmtCurrency(value), "Amount"]}
            />
          </PieChart>
        </ResponsiveContainer>

        {type === "donut" && (
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              textAlign: "center",
              pointerEvents: "none",
            }}
          >
            <div
              style={{
                fontSize: "1.125rem",
                fontWeight: 700,
                color: "var(--color-text)",
              }}
            >
              {fmtCurrency(total)}
            </div>
            <div
              style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}
            >
              total
            </div>
          </div>
        )}
      </div>
    );
  }

  if (type === "bar") {
    return (
      <div role="img" aria-label="Spending breakdown chart">
        <ResponsiveContainer width="100%" height={240}>
          <ComposedChart
            data={data}
            layout="vertical"
            margin={{ top: 0, right: 8, bottom: 0, left: 8 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--color-border)"
            horizontal={false}
          />
          <XAxis
            type="number"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 10, fill: "var(--color-text-muted)" }}
            tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
          />
          <YAxis
            type="category"
            dataKey="name"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: "var(--color-text-muted)" }}
            width={90}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-md)",
              fontSize: "0.8125rem",
            }}
            formatter={(value: number) => [fmtCurrency(value), "Amount"]}
          />
          <Bar
            dataKey="value"
            radius={[0, 3, 3, 0]}
            maxBarSize={20}
            animationDuration={600}
          >
            {data.map((entry, i) => (
              <Cell key={`cell-${i}`} fill={entry.color} />
            ))}
          </Bar>
        </ComposedChart>
        </ResponsiveContainer>
      </div>
    );
  }

  // Line chart
  return (
    <div role="img" aria-label="Spending breakdown chart">
      <ResponsiveContainer width="100%" height={240}>
      <ComposedChart
        data={data}
        margin={{ top: 4, right: 8, bottom: 0, left: 0 }}
      >
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="var(--color-border)"
          vertical={false}
        />
        <XAxis
          dataKey="name"
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 10, fill: "var(--color-text-muted)" }}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 10, fill: "var(--color-text-muted)" }}
          tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
          width={42}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-md)",
            fontSize: "0.8125rem",
          }}
          formatter={(value: number) => [fmtCurrency(value), "Amount"]}
        />
        <Line
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={2}
          dot={{ r: 4, fill: color }}
          animationDuration={600}
        />
      </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}


// ─── CompareView ──────────────────────────────────────────────────────────────

type MonthlyGrouping = 'monthly' | 'quarterly';

function CompareView({
  data,
  isLoading,
  mode,
  monthlyGrouping,
  onMonthlyGroupingChange,
  onDrillClick,
}: {
  data: CompareReport | undefined;
  isLoading: boolean;
  mode: 'spending' | 'income';
  monthlyGrouping: MonthlyGrouping;
  onMonthlyGroupingChange: (v: MonthlyGrouping) => void;
  onDrillClick?: (id: string, name: string, icon: string | null | undefined, mode: "spending" | "income") => void;
}) {
  if (isLoading) return <Skeleton height={320} width="100%" />;
  if (!data || data.items.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 240, color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
        No data for this period.
      </div>
    );
  }

  const top10 = data.items.slice(0, 10);
  const isSpending = mode === 'spending';

  function deltaColor(delta: number): string {
    const good = isSpending ? delta <= 0 : delta >= 0;
    return good ? 'var(--color-success)' : 'var(--color-danger)';
  }

  function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; dataKey: string }>; label?: string }) {
    if (!active || !payload?.length) return null;
    const curVal = payload.find((p) => p.dataKey === 'current')?.value ?? 0;
    const priVal = payload.find((p) => p.dataKey === 'prior')?.value ?? 0;
    const delta = curVal - priVal;
    const pct = priVal !== 0 ? Math.round((delta / priVal) * 100) : 0;
    return (
      <div style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '0.625rem 0.875rem', fontSize: '0.8125rem' }}>
        <div style={{ fontWeight: 600, marginBottom: '0.375rem', color: 'var(--color-text)' }}>{label}</div>
        <div style={{ color: '#1971c2' }}>This period: {fmtCurrency(curVal)}</div>
        <div style={{ color: 'var(--color-text-muted)' }}>Prior period: {fmtCurrency(priVal)}</div>
        <div style={{ color: deltaColor(delta), fontWeight: 600, marginTop: '0.25rem' }}>
          {delta >= 0 ? '+' : ''}{fmtCurrencySigned(delta)} ({delta >= 0 ? '+' : ''}{pct}%)
        </div>
      </div>
    );
  }

  const totalDeltaColor = deltaColor(data.totalDelta);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <LegendDot color="#1971c2" label="This period" />
          <LegendDot color="var(--color-border)" label="Prior period" />
          <span style={{ fontSize: '0.8125rem', color: totalDeltaColor, fontWeight: 600 }}>
            Total: {data.totalDelta >= 0 ? '+' : ''}{fmtCurrencySigned(data.totalDelta)}
          </span>
        </div>
        <div style={{ display: 'flex', backgroundColor: 'var(--color-surface-hover)', borderRadius: 'var(--radius-md)', padding: '0.125rem' }}>
          {(['monthly', 'quarterly'] as MonthlyGrouping[]).map((g) => (
            <button
              key={g}
              onClick={() => onMonthlyGroupingChange(g)}
              style={{
                padding: '0.25rem 0.625rem',
                borderRadius: 'calc(var(--radius-md) - 2px)',
                fontSize: '0.75rem',
                fontWeight: 500,
                border: 'none',
                cursor: 'pointer',
                backgroundColor: monthlyGrouping === g ? 'var(--color-surface)' : 'transparent',
                color: monthlyGrouping === g ? 'var(--color-text)' : 'var(--color-text-secondary)',
                boxShadow: monthlyGrouping === g ? 'var(--shadow-sm)' : 'none',
                transition: 'all 0.15s',
                textTransform: 'capitalize',
              }}
            >
              {g === 'monthly' ? 'Monthly' : 'Quarterly'}
            </button>
          ))}
        </div>
      </div>
      <div role="img" aria-label="Spending comparison chart">
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={top10} layout="vertical" margin={{ top: 0, right: 8, bottom: 0, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" horizontal={false} />
          <XAxis type="number" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} />
          <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }} width={90} />
          <Tooltip content={<CustomTooltip />} />
          <Bar dataKey="current" name="current" fill="#1971c2" radius={[0, 3, 3, 0]} maxBarSize={14} opacity={0.9} onClick={(entry: CompareItem) => { if (entry?.id && onDrillClick) { onDrillClick(entry.id, entry.name, entry.icon, mode); } }} style={{ cursor: onDrillClick ? "pointer" : undefined }} />
          <Bar dataKey="prior" name="prior" fill="var(--color-border)" radius={[0, 3, 3, 0]} maxBarSize={14} opacity={0.7} />
        </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
        {top10.map((item) => (
          <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem' }}>
            <span style={{ flex: 1, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {item.icon ? item.icon + ' ' : ''}{item.name}
            </span>
            <span style={{ color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>{fmtCurrency(item.prior)}</span>
            <span style={{ color: 'var(--color-text-secondary)' }}>&rarr;</span>
            <span style={{ fontWeight: 600, color: 'var(--color-text)', whiteSpace: 'nowrap' }}>{fmtCurrency(item.current)}</span>
            <span style={{ fontWeight: 600, color: deltaColor(item.delta), whiteSpace: 'nowrap', minWidth: 64, textAlign: 'right' }}>
              {item.delta >= 0 ? '+' : ''}{fmtCurrencySigned(item.delta)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── MonthlyView ──────────────────────────────────────────────────────────────

function MonthlyView({ data, isLoading, grouping }: { data: MonthlyReport | undefined; isLoading: boolean; grouping: MonthlyGrouping }) {
  if (isLoading) return <Skeleton height={280} width="100%" />;
  if (!data || data.series.length === 0 || data.months.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 240, color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
        No monthly data for this period.
      </div>
    );
  }

  interface ChartPoint { label: string; [key: string]: number | string }
  let chartData: ChartPoint[];

  if (grouping === 'monthly') {
    chartData = data.months.map((m, mi) => {
      const point: ChartPoint = { label: m };
      data.series.forEach((s) => { point[s.id] = s.data[mi] ?? 0; });
      return point;
    });
  } else {
    const qMap = new Map<string, ChartPoint>();
    data.months.forEach((m, mi) => {
      const parts = m.split(' ');
      const year = parts[1];
      const monthIdx = MONTH_NAMES.indexOf(parts[0]);
      const quarter = Math.floor(monthIdx / 3) + 1;
      const qKey = `Q${quarter} ${year}`;
      if (!qMap.has(qKey)) {
        const p: ChartPoint = { label: qKey };
        data.series.forEach((s) => { p[s.id] = 0; });
        qMap.set(qKey, p);
      }
      const p = qMap.get(qKey)!;
      data.series.forEach((s) => { (p[s.id] as number) += s.data[mi] ?? 0; });
    });
    chartData = Array.from(qMap.values()).map((p) => {
      const rounded: ChartPoint = { label: p.label };
      data.series.forEach((s) => { rounded[s.id] = Math.round((p[s.id] as number) * 100) / 100; });
      return rounded;
    });
  }

  const top8 = data.series.slice(0, 8);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.25rem' }}>
        {top8.map((s, i) => <LegendDot key={s.id} color={CATEGORICAL_COLORS[i % CATEGORICAL_COLORS.length]} label={s.name} />)}
      </div>
      <div role="img" aria-label="Monthly spending breakdown chart">
        <ResponsiveContainer width="100%" height={240}>
          <ComposedChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }} />
          <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} width={42} />
          <Tooltip
            contentStyle={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', fontSize: '0.8125rem' }}
            formatter={(value: number, name: string) => { const s = data.series.find((x) => x.id === name); return [fmtCurrency(value), s?.name ?? name]; }}
          />
          {top8.map((s, i) => (
            <Bar key={s.id} dataKey={s.id} stackId="stack" fill={CATEGORICAL_COLORS[i % CATEGORICAL_COLORS.length]} maxBarSize={32} radius={i === top8.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]} />
          ))}
        </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── GroupByDropdown ──────────────────────────────────────────────────────────

function GroupByDropdown({
  value,
  onChange,
  options,
}: {
  value: GroupBy;
  onChange: (v: GroupBy) => void;
  options: { value: GroupBy; label: string }[];
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.375rem",
          padding: "0.25rem 0.625rem",
          borderRadius: "var(--radius-md)",
          fontSize: "0.75rem",
          fontWeight: 500,
          border: "1px solid var(--color-border)",
          backgroundColor: "var(--color-surface)",
          color: "var(--color-text-secondary)",
          cursor: "pointer",
        }}
      >
        {selected?.label}
        <ChevronDown size={12} />
      </button>

      {open && (
        <>
          <div
            style={{ position: "fixed", inset: 0, zIndex: 40 }}
            onClick={() => setOpen(false)}
          />
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 4px)",
              right: 0,
              zIndex: 41,
              backgroundColor: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-md)",
              boxShadow: "var(--shadow-md)",
              minWidth: 130,
              overflow: "hidden",
            }}
          >
            {options.map((opt) => (
              <button
                key={opt.value}
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                style={{
                  display: "block",
                  width: "100%",
                  padding: "0.4375rem 0.75rem",
                  fontSize: "0.8125rem",
                  textAlign: "left",
                  border: "none",
                  cursor: "pointer",
                  backgroundColor:
                    value === opt.value
                      ? "var(--color-accent-light)"
                      : "transparent",
                  color:
                    value === opt.value
                      ? "var(--color-accent)"
                      : "var(--color-text)",
                  fontWeight: value === opt.value ? 600 : 400,
                }}
                onMouseEnter={(e) => {
                  if (value !== opt.value)
                    e.currentTarget.style.backgroundColor =
                      "var(--color-surface-hover)";
                }}
                onMouseLeave={(e) => {
                  if (value !== opt.value)
                    e.currentTarget.style.backgroundColor = "transparent";
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── SummaryRow ───────────────────────────────────────────────────────────────

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: "0.5rem",
        alignItems: "baseline",
      }}
    >
      <span
        style={{ fontSize: "0.8125rem", color: "var(--color-text-secondary)" }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: "0.8125rem",
          fontWeight: 600,
          color: "var(--color-text)",
          textAlign: "right",
          maxWidth: "55%",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {value}
      </span>
    </div>
  );
}

// ─── TransactionRow ───────────────────────────────────────────────────────────

function TransactionRow({
  txn,
  isLast,
}: {
  txn: ReportTransaction;
  isLast: boolean;
}) {
  const isNegative = txn.amount < 0;
  const displayName = txn.merchantName ?? txn.merchant ?? "Unknown";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.75rem",
        padding: "0.625rem 0.25rem",
        borderBottom: isLast ? "none" : "1px solid var(--color-border)",
        transition: "background-color 0.1s",
      }}
      onMouseEnter={(e) =>
        (e.currentTarget.style.backgroundColor = "var(--color-surface-hover)")
      }
      onMouseLeave={(e) =>
        (e.currentTarget.style.backgroundColor = "transparent")
      }
    >
      {/* Avatar — colored circle with emoji or initial */}
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: "50%",
          backgroundColor: txn.categoryColor ?? "var(--color-accent)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: txn.categoryIcon ? "1.0625rem" : "0.875rem",
          fontWeight: 700,
          color: "#fff",
          flexShrink: 0,
        }}
      >
        {txn.categoryIcon ?? merchantInitial(displayName)}
      </div>

      {/* Merchant + category subtitle */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: "0.875rem",
            fontWeight: 500,
            color: "var(--color-text)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {displayName}
        </div>
        <div
          style={{
            fontSize: "0.75rem",
            color: "var(--color-text-muted)",
            marginTop: "0.0625rem",
            display: "flex",
            alignItems: "center",
            gap: "0.25rem",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {txn.categoryIcon && (
            <span style={{ fontSize: "0.75rem" }}>{txn.categoryIcon}</span>
          )}
          <span>{txn.categoryName ?? "Uncategorized"}</span>
        </div>
      </div>

      {/* Account pill */}
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          padding: "0.125rem 0.5rem",
          borderRadius: "var(--radius-full)",
          backgroundColor: "var(--color-surface-hover)",
          fontSize: "0.6875rem",
          color: "var(--color-text-muted)",
          whiteSpace: "nowrap",
          flexShrink: 0,
          maxWidth: 110,
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {txn.accountName}
      </div>

      {/* Amount + date stacked */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          flexShrink: 0,
          minWidth: 72,
        }}
      >
        <div
          style={{
            fontSize: "0.9375rem",
            fontWeight: 600,
            color: isNegative ? "var(--color-danger)" : "var(--color-success)",
            whiteSpace: "nowrap",
          }}
        >
          {isNegative ? "−" : "+"}
          {fmtCurrency(txn.amount)}
        </div>
        <div
          style={{
            fontSize: "0.6875rem",
            color: "var(--color-text-muted)",
            marginTop: "0.125rem",
            whiteSpace: "nowrap",
          }}
        >
          {new Date(txn.date).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          })}
        </div>
      </div>
    </div>
  );
}

// ─── FiltersPanel ─────────────────────────────────────────────────────────────

interface FilterOption {
  id: string;
  name: string;
  icon?: string | null;
  color?: string | null;
  type?: string | null;
}

interface FiltersPanelProps {
  open: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
  categoryIds: string[];
  accountIds: string[];
  tagIds: string[];
  minAmount: string;
  maxAmount: string;
  onCategoryChange: (ids: string[]) => void;
  onAccountChange: (ids: string[]) => void;
  onTagChange: (ids: string[]) => void;
  onMinAmountChange: (v: string) => void;
  onMaxAmountChange: (v: string) => void;
  onClearAll: () => void;
}

type FilterSection = "categories" | "accounts" | "tags" | "amount";

function FiltersPanel({
  open,
  onClose,
  anchorRef,
  categoryIds,
  accountIds,
  tagIds,
  minAmount,
  maxAmount,
  onCategoryChange,
  onAccountChange,
  onTagChange,
  onMinAmountChange,
  onMaxAmountChange,
  onClearAll,
}: FiltersPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [section, setSection] = useState<FilterSection>("categories");

  const { data: categoriesData = [] } = useQuery<FilterOption[]>({
    queryKey: ["categories"],
    queryFn: () => api.get("/categories").then((r) => r.data),
    enabled: open,
  });

  const { data: accountsData = [] } = useQuery<FilterOption[]>({
    queryKey: ["accounts"],
    queryFn: () => api.get("/accounts").then((r) => r.data),
    enabled: open,
  });

  const { data: tagsData = [] } = useQuery<FilterOption[]>({
    queryKey: ["settings", "tags"],
    queryFn: () => api.get("/settings/tags").then((r) => r.data),
    enabled: open,
  });

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      const anchor = anchorRef.current;
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        (!anchor || !anchor.contains(e.target as Node))
      ) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open, onClose, anchorRef]);

  if (!open) return null;

  function toggleId(ids: string[], id: string, onChange: (ids: string[]) => void) {
    if (ids.includes(id)) {
      onChange(ids.filter((x) => x !== id));
    } else {
      onChange([...ids, id]);
    }
  }

  const NAV_ITEMS: { value: FilterSection; label: string }[] = [
    { value: "categories", label: "Categories" },
    { value: "accounts", label: "Accounts" },
    { value: "tags", label: "Tags" },
    { value: "amount", label: "Amount" },
  ];

  const checkboxStyle = (checked: boolean): React.CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    padding: "0.375rem 0.5rem",
    borderRadius: "var(--radius-sm)",
    cursor: "pointer",
    backgroundColor: checked ? "var(--color-accent-light)" : "transparent",
    transition: "background-color 0.1s",
    userSelect: "none",
  });

  return (
    <div
      ref={panelRef}
      style={{
        position: "absolute",
        top: "calc(100% + 6px)",
        right: 0,
        zIndex: 50,
        width: 420,
        backgroundColor: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "var(--shadow-lg)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0.75rem 1rem",
          borderBottom: "1px solid var(--color-border)",
        }}
      >
        <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--color-text)" }}>
          Filters
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <button
            onClick={onClearAll}
            style={{
              fontSize: "0.75rem",
              fontWeight: 500,
              color: "var(--color-accent)",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "0.125rem 0.375rem",
            }}
          >
            Clear all
          </button>
          <button
            onClick={onClose}
            style={{
              display: "flex",
              alignItems: "center",
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--color-text-muted)",
              padding: "0.125rem",
            }}
          >
            <X size={15} />
          </button>
        </div>
      </div>

      {/* Body: left nav + right content */}
      <div style={{ display: "flex", height: 320 }}>
        {/* Left nav */}
        <div
          style={{
            width: 110,
            borderRight: "1px solid var(--color-border)",
            display: "flex",
            flexDirection: "column",
            padding: "0.375rem 0",
          }}
        >
          {NAV_ITEMS.map((item) => (
            <button
              key={item.value}
              onClick={() => setSection(item.value)}
              style={{
                padding: "0.5rem 0.875rem",
                fontSize: "0.8125rem",
                fontWeight: section === item.value ? 600 : 400,
                color: section === item.value ? "var(--color-accent)" : "var(--color-text-secondary)",
                backgroundColor: section === item.value ? "var(--color-accent-light)" : "transparent",
                border: "none",
                textAlign: "left",
                cursor: "pointer",
                transition: "background-color 0.1s",
              }}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* Right content */}
        <div
          style={{
            flex: 1,
            padding: "0.5rem",
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: "0.125rem",
          }}
        >
          {section === "categories" && (
            categoriesData.length === 0 ? (
              <span style={{ fontSize: "0.8125rem", color: "var(--color-text-muted)", padding: "0.5rem" }}>
                No categories
              </span>
            ) : (
              categoriesData.map((cat) => (
                <label
                  key={cat.id}
                  style={checkboxStyle(categoryIds.includes(cat.id))}
                >
                  <input
                    type="checkbox"
                    checked={categoryIds.includes(cat.id)}
                    onChange={() => toggleId(categoryIds, cat.id, onCategoryChange)}
                    style={{ accentColor: "var(--color-accent)" }}
                  />
                  {cat.icon && <span style={{ fontSize: "1.125rem", lineHeight: 1 }}>{cat.icon}</span>}
                  <span style={{ fontSize: "0.8125rem", color: "var(--color-text)" }}>
                    {cat.name}
                  </span>
                </label>
              ))
            )
          )}

          {section === "accounts" && (
            accountsData.length === 0 ? (
              <span style={{ fontSize: "0.8125rem", color: "var(--color-text-muted)", padding: "0.5rem" }}>
                No accounts
              </span>
            ) : (
              accountsData.map((acc) => (
                <label
                  key={acc.id}
                  style={checkboxStyle(accountIds.includes(acc.id))}
                >
                  <input
                    type="checkbox"
                    checked={accountIds.includes(acc.id)}
                    onChange={() => toggleId(accountIds, acc.id, onAccountChange)}
                    style={{ accentColor: "var(--color-accent)" }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "0.8125rem", color: "var(--color-text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {acc.name}
                    </div>
                    {acc.type && (
                      <div style={{ fontSize: "0.6875rem", color: "var(--color-text-muted)" }}>
                        {acc.type}
                      </div>
                    )}
                  </div>
                </label>
              ))
            )
          )}

          {section === "tags" && (
            tagsData.length === 0 ? (
              <span style={{ fontSize: "0.8125rem", color: "var(--color-text-muted)", padding: "0.5rem" }}>
                No tags
              </span>
            ) : (
              tagsData.map((tag) => (
                <label
                  key={tag.id}
                  style={checkboxStyle(tagIds.includes(tag.id))}
                >
                  <input
                    type="checkbox"
                    checked={tagIds.includes(tag.id)}
                    onChange={() => toggleId(tagIds, tag.id, onTagChange)}
                    style={{ accentColor: "var(--color-accent)" }}
                  />
                  <div
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      backgroundColor: tag.color ?? "var(--color-text-muted)",
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ fontSize: "0.8125rem", color: "var(--color-text)" }}>
                    {tag.name}
                  </span>
                </label>
              ))
            )
          )}

          {section === "amount" && (
            <div style={{ padding: "0.5rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.75rem",
                    fontWeight: 500,
                    color: "var(--color-text-secondary)",
                    marginBottom: "0.375rem",
                  }}
                >
                  Min amount ($)
                </label>
                <input
                  type="number"
                  min={0}
                  value={minAmount}
                  onChange={(e) => onMinAmountChange(e.target.value)}
                  placeholder="0"
                  style={{
                    width: "100%",
                    padding: "0.4375rem 0.625rem",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--color-border)",
                    backgroundColor: "var(--color-surface)",
                    color: "var(--color-text)",
                    fontSize: "0.875rem",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.75rem",
                    fontWeight: 500,
                    color: "var(--color-text-secondary)",
                    marginBottom: "0.375rem",
                  }}
                >
                  Max amount ($)
                </label>
                <input
                  type="number"
                  min={0}
                  value={maxAmount}
                  onChange={(e) => onMaxAmountChange(e.target.value)}
                  placeholder="No limit"
                  style={{
                    width: "100%",
                    padding: "0.4375rem 0.625rem",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--color-border)",
                    backgroundColor: "var(--color-surface)",
                    color: "var(--color-text)",
                    fontSize: "0.875rem",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

// ─── Saved Views ──────────────────────────────────────────────────────────────

interface SavedReport {
  id: string;
  name: string;
  filters: {
    tab?: ReportTab;
    datePreset?: DatePreset;
    startDate?: string;
    endDate?: string;
  };
  createdAt: string;
}

function SavedViewsDropdown({
  onLoad,
}: {
  onLoad: (filters: SavedReport["filters"]) => void;
}) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: saved = [] } = useQuery<SavedReport[]>({
    queryKey: ["reports", "saved"],
    queryFn: () => api.get("/reports/saved").then((r) => r.data),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/reports/saved/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reports", "saved"] });
    },
    onError: () => notify.error("Failed to delete saved view"),
  });

  if (saved.length === 0) return null;

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.375rem",
          padding: "0.3125rem 0.75rem",
          borderRadius: "var(--radius-md)",
          fontSize: "0.8125rem",
          fontWeight: 500,
          border: "1px solid var(--color-border)",
          backgroundColor: "var(--color-surface)",
          color: "var(--color-text-secondary)",
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        <Bookmark size={14} />
        Views
        <ChevronDown size={12} />
      </button>

      {open && (
        <>
          <div
            style={{ position: "fixed", inset: 0, zIndex: 40 }}
            onClick={() => setOpen(false)}
          />
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 4px)",
              right: 0,
              zIndex: 41,
              minWidth: 220,
              backgroundColor: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-md)",
              boxShadow: "var(--shadow-md)",
              overflow: "hidden",
            }}
          >
            {saved.map((sv) => (
              <div
                key={sv.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "0.5rem 0.75rem",
                  gap: "0.5rem",
                  borderBottom: "1px solid var(--color-border)",
                }}
              >
                <button
                  onClick={() => {
                    onLoad(sv.filters);
                    setOpen(false);
                  }}
                  style={{
                    flex: 1,
                    textAlign: "left",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    fontSize: "0.8125rem",
                    color: "var(--color-text)",
                    padding: 0,
                  }}
                >
                  {sv.name}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteMutation.mutate(sv.id);
                  }}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "var(--color-text-muted)",
                    padding: "0.125rem",
                    display: "flex",
                    alignItems: "center",
                  }}
                  title="Delete saved view"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Save View Modal ──────────────────────────────────────────────────────────

function SaveViewModal({
  open,
  onClose,
  filters,
}: {
  open: boolean;
  onClose: () => void;
  filters: SavedReport["filters"];
}) {
  const [name, setName] = useState("");
  const queryClient = useQueryClient();

  const saveMutation = useMutation({
    mutationFn: (payload: { name: string; filters: SavedReport["filters"] }) =>
      api.post("/reports/saved", payload).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reports", "saved"] });
      notify.success("View saved");
      setName("");
      onClose();
    },
    onError: () => notify.error("Failed to save view"),
  });

  function handleSave() {
    if (!name.trim()) return;
    saveMutation.mutate({ name: name.trim(), filters });
  }

  return (
    <Modal
      open={open}
      onClose={() => { setName(""); onClose(); }}
      title="Save Report View"
      description="Save the current filters as a named view you can quickly reload."
      size="sm"
    >
      <Input
        label="View name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Q1 Spending"
        autoFocus
        onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
      />
      <ModalFooter>
        <Button variant="ghost" onClick={() => { setName(""); onClose(); }}>Cancel</Button>
        <Button
          variant="primary"
          onClick={handleSave}
          disabled={!name.trim() || saveMutation.isPending}
        >
          {saveMutation.isPending ? "Saving…" : "Save view"}
        </Button>
      </ModalFooter>
    </Modal>
  );
}

export default function ReportsPage() {
  const [tab, setTab] = useState<ReportTab>("cashflow");
  const [datePreset, setDatePreset] = useState<DatePreset>("last3months");
  const [saveModalOpen, setSaveModalOpen] = useState(false);

  // Filter state
  const [filterCategoryIds, setFilterCategoryIds] = useState<string[]>([]);
  const [filterAccountIds, setFilterAccountIds] = useState<string[]>([]);
  const [filterTagIds, setFilterTagIds] = useState<string[]>([]);
  const [filterMinAmount, setFilterMinAmount] = useState<string>("");
  const [filterMaxAmount, setFilterMaxAmount] = useState<string>("");
  const [showFilters, setShowFilters] = useState(false);
  const filterButtonRef = useRef<HTMLButtonElement>(null);

  const [drillFilter, setDrillFilter] = useState<{
    groupId: string;
    groupName: string;
    groupIcon?: string | null;
    mode: "spending" | "income";
    groupBy: string;
    startDate: string;
    endDate: string;
  } | null>(null);

  const activeFilterCount =
    filterCategoryIds.length +
    filterAccountIds.length +
    filterTagIds.length +
    (filterMinAmount ? 1 : 0) +
    (filterMaxAmount ? 1 : 0);

  function clearAllFilters() {
    setFilterCategoryIds([]);
    setFilterAccountIds([]);
    setFilterTagIds([]);
    setFilterMinAmount("");
    setFilterMaxAmount("");
  }

  const { startDate, endDate } = useMemo(
    () => computeDateRange(datePreset),
    [datePreset],
  );

  const currentFilters: SavedReport["filters"] = { tab, datePreset, startDate, endDate };

  function loadSavedView(filters: SavedReport["filters"]) {
    if (filters.tab) setTab(filters.tab);
    if (filters.datePreset) setDatePreset(filters.datePreset as DatePreset);
  }

  function handleDrillClick(
    groupId: string,
    groupName: string,
    groupIcon: string | null | undefined,
    mode: "spending" | "income",
    groupBy: string,
  ) {
    setDrillFilter({
      groupId,
      groupName,
      groupIcon,
      mode,
      groupBy,
      startDate,
      endDate,
    });
  }

  useEffect(() => {
    setDrillFilter(null);
  }, [tab, startDate, endDate]);

  // Build extra filter query params string for passing to child tabs
  const extraFilterParams = useMemo(() => {
    const parts: string[] = [];
    if (filterCategoryIds.length) parts.push(`categoryIds=${filterCategoryIds.join(",")}`);
    if (filterAccountIds.length) parts.push(`accountIds=${filterAccountIds.join(",")}`);
    if (filterTagIds.length) parts.push(`tagIds=${filterTagIds.join(",")}`);
    if (filterMinAmount) parts.push(`minAmount=${filterMinAmount}`);
    if (filterMaxAmount) parts.push(`maxAmount=${filterMaxAmount}`);
    return parts.length ? `&${parts.join("&")}` : "";
  }, [filterCategoryIds, filterAccountIds, filterTagIds, filterMinAmount, filterMaxAmount]);

  return (
    <div className="flex h-full overflow-hidden">
      <div className="flex-1 overflow-y-auto min-w-0">
    <div
      style={{
        padding: "1rem 0",
        display: "flex",
        flexDirection: "column",
        gap: "1rem",
      }}
    >
      {/* Page header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "0.75rem",
        }}
      >
        <h1
          style={{
            fontSize: "1.375rem",
            fontWeight: 700,
            color: "var(--color-text)",
            margin: 0,
          }}
        >
          Reports
        </h1>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            flexWrap: "wrap",
          }}
        >
          <DatePresetDropdown value={datePreset} onChange={setDatePreset} />

          {/* Filters button with dropdown panel */}
          <div style={{ position: "relative" }}>
            <button
              ref={filterButtonRef}
              onClick={() => setShowFilters((s) => !s)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.375rem",
                padding: "0.3125rem 0.75rem",
                borderRadius: "var(--radius-md)",
                fontSize: "0.8125rem",
                fontWeight: 500,
                border: activeFilterCount > 0
                  ? "1px solid var(--color-accent)"
                  : "1px solid var(--color-border)",
                backgroundColor: activeFilterCount > 0
                  ? "var(--color-accent-light)"
                  : "var(--color-surface)",
                color: activeFilterCount > 0
                  ? "var(--color-accent)"
                  : "var(--color-text-secondary)",
                cursor: "pointer",
              }}
            >
              <SlidersHorizontal size={14} />
              Filters
              {activeFilterCount > 0 && (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    minWidth: 18,
                    height: 18,
                    borderRadius: 9,
                    backgroundColor: "var(--color-accent)",
                    color: "#fff",
                    fontSize: "0.6875rem",
                    fontWeight: 700,
                    padding: "0 4px",
                  }}
                >
                  {activeFilterCount}
                </span>
              )}
            </button>

            <FiltersPanel
              open={showFilters}
              onClose={() => setShowFilters(false)}
              anchorRef={filterButtonRef}
              categoryIds={filterCategoryIds}
              accountIds={filterAccountIds}
              tagIds={filterTagIds}
              minAmount={filterMinAmount}
              maxAmount={filterMaxAmount}
              onCategoryChange={setFilterCategoryIds}
              onAccountChange={setFilterAccountIds}
              onTagChange={setFilterTagIds}
              onMinAmountChange={setFilterMinAmount}
              onMaxAmountChange={setFilterMaxAmount}
              onClearAll={clearAllFilters}
            />
          </div>

          <SavedViewsDropdown onLoad={loadSavedView} />

          <button
            onClick={() => setSaveModalOpen(true)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.375rem",
              padding: "0.3125rem 0.75rem",
              borderRadius: "var(--radius-md)",
              fontSize: "0.8125rem",
              fontWeight: 500,
              border: "1px solid var(--color-border)",
              backgroundColor: "var(--color-surface)",
              color: "var(--color-text-secondary)",
              cursor: "pointer",
            }}
          >
            <BookmarkPlus size={14} />
            Save
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <TabBar tab={tab} onChange={setTab} />

      {/* Export toolbar — shown for data tabs (not forecast/tax which have their own export) */}
      {(tab === "cashflow" || tab === "spending" || tab === "income") && (
        <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: "0.25rem" }}>
          <ExportButtons
            type={tab === "cashflow" ? "cashflow" : "spending"}
            from={startDate}
            to={endDate}
          />
        </div>
      )}

      {/* Tab content */}
      {tab === "cashflow" && (
        <CashFlowTab startDate={startDate} endDate={endDate} extraParams={extraFilterParams} />
      )}
      {tab === "spending" && (
        <CategoryTab mode="spending" startDate={startDate} endDate={endDate} extraParams={extraFilterParams} onDrillClick={handleDrillClick} />
      )}
      {tab === "income" && (
        <CategoryTab mode="income" startDate={startDate} endDate={endDate} extraParams={extraFilterParams} onDrillClick={handleDrillClick} />
      )}
      {tab === "variance" && <BudgetVarianceChart from={startDate} to={endDate} />}
      {tab === "forecast" && <CashFlowForecast />}
      {tab === "tax" && <TaxSummaryTab />}
      {tab === "benchmarks" && <SpendingBenchmarksTab startDate={startDate} endDate={endDate} />}

      <SaveViewModal
        open={saveModalOpen}
        onClose={() => setSaveModalOpen(false)}
        filters={currentFilters}
      />
    </div>
      </div>
      {drillFilter && (
        <div className="w-80 shrink-0 overflow-hidden">
          <DrillPanel
            filter={drillFilter}
            onClose={() => setDrillFilter(null)}
          />
        </div>
      )}
    </div>
  );
}
