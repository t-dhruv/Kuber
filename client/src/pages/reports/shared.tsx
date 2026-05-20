import { useState, useEffect } from "react";
import { ChevronDown } from "lucide-react";
import { SegmentControl } from "@/components/ui";
import { DATE_PRESETS, type DatePreset } from "./dateRange";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ReportTab =
  | "overview"
  | "cashflow"
  | "savings"
  | "spending"
  | "income"
  | "forecast"
  | "tax"
  | "variance"
  | "benchmarks"
  | "networth"
  | "assetsliabilities"
  | "investmentperformance"
  | "allocationdrift"
  | "contributionroom"
  | "dividendforecast"
  | "retirementsimulation";
export type ChartType = "donut" | "pie" | "bar" | "line";
export type GroupBy = "category" | "merchant" | "account";
export type ReportTabGroup = "core" | "wealth" | "advanced";

export interface CategoryBreakdown {
  id: string;
  name: string;
  icon?: string;
  amount: number;
  percent: number;
  transactionCount: number;
}

export interface SpendingReport {
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

export interface IncomeReport {
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

export interface CashFlowMonth {
  month: number;
  income: number;
  expenses: number;
  net: number;
}

export interface CashFlowMonthly {
  month: string; // e.g. "Jan 2025"
  income: number;
  expenses: number;
  net: number;
}

export interface SavingsMonthly extends CashFlowMonthly {
  savingsRate: number;
}

export interface CashFlowReport {
  income: number;
  expenses: number;
  net: number;
  savingsRate: number;
  byMonth: CashFlowMonth[];
  monthly: CashFlowMonthly[];
}

export interface CompareItem {
  id: string;
  name: string;
  icon: string | null;
  current: number;
  prior: number;
  delta: number;
  deltaPercent: number;
}

export interface CompareReport {
  items: CompareItem[];
  currentTotal: number;
  priorTotal: number;
  totalDelta: number;
}

export interface MonthlySeriesItem {
  id: string;
  name: string;
  icon: string | null;
  data: number[];
}

export interface MonthlyReport {
  months: string[];
  series: MonthlySeriesItem[];
}

export interface ReportTransaction {
  id: string;
  merchantName: string;
  merchant?: string;
  categoryName: string | null;
  categoryIcon?: string | null;
  categoryColor?: string | null;
  accountName: string;
  amount: number;
  date: string;
}

export interface TransactionsResponse {
  transactions: ReportTransaction[];
  total: number;
  page: number;
  totalPages: number;
}

export interface SavedReport {
  id: string;
  name: string;
  filters: {
    tab?: ReportTab;
    datePreset?: DatePreset;
    startDate?: string;
    endDate?: string;
    excludeCategoryIds?: string[];
    excludeAccountIds?: string[];
  };
  createdAt: string;
  updatedAt: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const CATEGORICAL_COLORS = [
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

export const MONTH_NAMES = [
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

export const TAB_GROUPS: {
  id: ReportTabGroup;
  label: string;
  tabs: { value: ReportTab; label: string }[];
}[] = [
  {
    id: "core",
    label: "Core",
    tabs: [
      { value: "overview", label: "Overview" },
      { value: "cashflow", label: "Cash Flow" },
      { value: "savings", label: "Savings" },
      { value: "spending", label: "Spending" },
      { value: "income", label: "Income" },
      { value: "variance", label: "Variance" },
      { value: "forecast", label: "Forecast" },
      { value: "tax", label: "Tax Summary" },
      { value: "benchmarks", label: "Benchmarks" },
    ],
  },
  {
    id: "wealth",
    label: "Wealth",
    tabs: [
      { value: "networth", label: "Net Worth" },
      { value: "assetsliabilities", label: "Assets / Liabilities" },
      { value: "investmentperformance", label: "Investment Performance" },
    ],
  },
  {
    id: "advanced",
    label: "Advanced",
    tabs: [
      { value: "allocationdrift", label: "Allocation & Drift" },
      { value: "contributionroom", label: "Contribution Room" },
      { value: "dividendforecast", label: "Dividend Forecast" },
      { value: "retirementsimulation", label: "Retirement Simulation" },
    ],
  },
];

// ─── Formatters ───────────────────────────────────────────────────────────────

export const fmtCurrency = (amount: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    Math.abs(amount),
  );

export const fmtCurrencySigned = (amount: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    amount,
  );

export const fmtPct = (value: number) => `${Math.round(value)}%`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function merchantInitial(name: string) {
  return (name ?? "?")[0].toUpperCase();
}

export function netColor(net: number): string {
  return net >= 0 ? "var(--color-success)" : "var(--color-danger)";
}

export function savingsColor(pct: number): string {
  if (pct >= 20) return "var(--color-success)";
  if (pct >= 10) return "var(--color-warning)";
  return "var(--color-danger)";
}

// ─── Components ───────────────────────────────────────────────────────────────

export function HorizontalBar({ pct, color }: { pct: number; color: string }) {
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

export function LegendDot({
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

export function DatePresetDropdown({
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

export function TabBar({
  tab,
  onChange,
}: {
  tab: ReportTab;
  onChange: (t: ReportTab) => void;
}) {
  const [activeGroup, setActiveGroup] = useState<ReportTabGroup>(() => {
    const found = TAB_GROUPS.find((g) => g.tabs.some((t) => t.value === tab));
    return found?.id ?? "core";
  });

  useEffect(() => {
    const group = TAB_GROUPS.find((g) => g.tabs.some((t) => t.value === tab));
    if (group && group.id !== activeGroup) {
      setActiveGroup(group.id);
    }
  }, [tab, activeGroup]);

  const groupOptions = TAB_GROUPS.map((g) => ({
    value: g.id,
    label: g.label,
  }));
  const currentGroup = TAB_GROUPS.find((g) => g.id === activeGroup);

  const handleGroupChange = (groupId: ReportTabGroup) => {
    const group = TAB_GROUPS.find((g) => g.id === groupId);
    if (!group) return;
    setActiveGroup(groupId);
    onChange(group.tabs[0].value);
  };

  return (
    <div
      role="navigation"
      aria-label="Reports sections navigation"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "0.5rem",
      }}
    >
      <SegmentControl
        options={groupOptions}
        value={activeGroup}
        onChange={(v) => handleGroupChange(v as ReportTabGroup)}
        size="sm"
      />

      {currentGroup && (
        <SegmentControl
          options={currentGroup.tabs.map((t) => ({
            value: t.value,
            label: t.label,
          }))}
          value={tab}
          onChange={onChange}
          size="md"
        />
      )}
    </div>
  );
}

export function KpiCards({
  cards,
  isLoading,
}: {
  cards: { label: string; value: string; color: string }[];
  isLoading: boolean;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {cards.map((card, i) => (
        <div
          key={i}
          style={{
            padding: "1rem",
            borderRadius: "var(--radius-lg)",
            backgroundColor: "var(--color-surface-hover)",
            border: "1px solid var(--color-border)",
          }}
        >
          <div
            style={{
              fontSize: "0.75rem",
              fontWeight: 600,
              color: "var(--color-text-secondary)",
              textTransform: "uppercase",
              letterSpacing: "0.5px",
              marginBottom: "0.375rem",
            }}
          >
            {card.label}
          </div>
          {isLoading ? (
            <div
              style={{
                height: 28,
                borderRadius: "var(--radius-md)",
                backgroundColor: "var(--color-border)",
              }}
            />
          ) : (
            <div
              style={{
                fontSize: "1.5rem",
                fontWeight: 700,
                color: card.color,
              }}
            >
              {card.value}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        paddingBottom: "0.75rem",
        borderBottom: "1px solid var(--color-border)",
      }}
    >
      <span style={{ fontSize: "0.875rem", color: "var(--color-text-secondary)" }}>
        {label}
      </span>
      <span
        style={{
          fontSize: "0.875rem",
          fontWeight: 600,
          color: "var(--color-text)",
        }}
      >
        {value}
      </span>
    </div>
  );
}
