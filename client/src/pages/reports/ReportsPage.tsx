import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
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
  Sankey,
  Rectangle,
} from "recharts";
import { SlidersHorizontal, BookmarkPlus, ChevronDown, Trash2, Bookmark } from "lucide-react";
import { api } from "@/lib/api";
import { Card, CardDivider, Skeleton, Modal, ModalFooter, Button, Input, notify } from "@/components/ui";

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
type ReportTab = "cashflow" | "spending" | "income";
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
  largest?: { merchantName: string; amount: number };
  average: number;
  transactionCount: number;
  items: CategoryBreakdown[];
}

interface IncomeReport {
  total: number;
  largest?: { merchantName: string; amount: number };
  average: number;
  transactionCount: number;
  items: CategoryBreakdown[];
}

interface CashFlowMonth {
  month: number;
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
}

interface ReportTransaction {
  id: string;
  merchant: string;
  categoryName: string;
  categoryIcon?: string;
  categoryColor?: string;
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
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: "0.75rem",
      }}
    >
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

// ─── Reports Sankey Chart ─────────────────────────────────────────────────────

const SANKEY_COLORS = [
  "#E5622A",
  "#1971c2",
  "#9c36b5",
  "#0c8599",
  "#e67700",
  "#f06595",
  "#5c7cfa",
  "#f59f00",
  "#868e96",
  "#2f9e44",
];

const MAX_SANKEY_CATEGORIES = 8;

function ReportsSankeyChart({
  income,
  net,
  spendingItems,
  startDate,
  endDate,
}: {
  income: number;
  net: number;
  spendingItems: {
    id: string;
    name: string;
    icon: string | null;
    amount: number;
  }[];
  startDate: string;
  endDate: string;
}) {
  const navigate = useNavigate();
  const [hovered, setHovered] = useState<number | null>(null);
  if (income <= 0 || spendingItems.length === 0) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: 220,
          color: "var(--color-text-muted)",
          fontSize: "0.875rem",
        }}
      >
        No data for this period
      </div>
    );
  }

  // Take top N categories, group rest into "Other"
  const sorted = [...spendingItems].sort((a, b) => b.amount - a.amount);
  const topItems = sorted.slice(0, MAX_SANKEY_CATEGORIES);
  const otherAmount = sorted
    .slice(MAX_SANKEY_CATEGORIES)
    .reduce((s, i) => s + i.amount, 0);
  if (otherAmount > 0)
    topItems.push({
      id: "__other__",
      name: "Other",
      icon: null,
      amount: Math.round(otherAmount * 100) / 100,
    });

  const hasSavings = net > 0;
  const nodes = [
    { name: "Income" },
    ...topItems.map((i) => ({ name: i.name })),
    ...(hasSavings ? [{ name: "Savings" }] : []),
  ];

  const links = [
    ...topItems.map((item, i) => ({
      source: 0,
      target: i + 1,
      value: Math.round(item.amount * 100) / 100,
    })),
    ...(hasSavings
      ? [
          {
            source: 0,
            target: nodes.length - 1,
            value: Math.round(net * 100) / 100,
          },
        ]
      : []),
  ];

  const validLinks = links.filter((l) => l.value > 0);
  if (validLinks.length === 0) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: 220,
          color: "var(--color-text-muted)",
          fontSize: "0.875rem",
        }}
      >
        No transactions in this period
      </div>
    );
  }

  const amtMap = new Map<string, number>([
    ['Income', income],
    ...topItems.map(i => [i.name, i.amount] as [string, number]),
    ...(hasSavings ? [['Savings', net] as [string, number]] : []),
  ]);

  function handleNodeClick(index: number, name: string) {
    if (index === 0) return; // Income node
    if (hasSavings && index === nodes.length - 1) return; // Savings
    navigate(`/transactions?search=${encodeURIComponent(name)}&startDate=${startDate}&endDate=${endDate}`);
  }

  return (
    <div>
      <p style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginBottom: "0.5rem", textAlign: "center" }}>
        Click a category to view transactions
      </p>
      <div style={{ height: 320 }}>
        <ResponsiveContainer width="100%" height="100%">
          <Sankey
            data={{ nodes, links: validLinks }}
            nodePadding={10}
            nodeWidth={18}
            margin={{ top: 8, right: 140, bottom: 8, left: 80 }}
            link={({ sourceX, sourceY, sourceControlX, targetControlX, targetX, targetY, linkWidth }: any) => (
              <path
                d={`M${sourceX},${sourceY} C${sourceControlX},${sourceY} ${targetControlX},${targetY} ${targetX},${targetY}`}
                fill="none"
                stroke="var(--color-border)"
                strokeWidth={linkWidth}
                strokeOpacity={0.45}
              />
            )}
            node={({ x, y, width, height, index, payload }: {
              x: number; y: number; width: number; height: number; index: number; payload: { name: string };
            }) => {
              const isIncome = index === 0;
              const isSavings = hasSavings && index === nodes.length - 1;
              const isClickable = !isIncome && !isSavings;
              const isHov = hovered === index;
              const color = isIncome ? "var(--color-success)" : isSavings ? "#2f9e44" : SANKEY_COLORS[(index - 1) % SANKEY_COLORS.length];
              const nodeAmt = amtMap.get(payload.name) ?? 0;
              const amtStr = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Math.abs(nodeAmt));
              return (
                <g
                  onClick={() => handleNodeClick(index, payload.name)}
                  onMouseEnter={() => setHovered(index)}
                  onMouseLeave={() => setHovered(null)}
                  style={{ cursor: isClickable ? "pointer" : "default" }}
                >
                  <Rectangle x={x} y={y} width={width} height={Math.max(height, 4)} fill={color} fillOpacity={isHov ? 1 : 0.85} radius={3} />
                  <text
                    x={isIncome ? x - 8 : x + width + 8}
                    y={y + height / 2 - (isHov ? 7 : 0)}
                    textAnchor={isIncome ? "end" : "start"}
                    dominantBaseline="middle"
                    style={{ fontSize: "0.6875rem", fill: isHov ? "var(--color-text)" : "var(--color-text-secondary)", fontFamily: "inherit", fontWeight: isHov ? 600 : 400 }}
                  >
                    {payload.name}
                  </text>
                  {isHov && (
                    <text
                      x={isIncome ? x - 8 : x + width + 8}
                      y={y + height / 2 + 8}
                      textAnchor={isIncome ? "end" : "start"}
                      dominantBaseline="middle"
                      style={{ fontSize: "0.625rem", fill: color, fontFamily: "inherit", fontWeight: 600 }}
                    >
                      {amtStr}
                    </text>
                  )}
                  {isHov && isClickable && (
                    <text
                      x={isIncome ? x - 8 : x + width + 8}
                      y={y + height / 2 + 20}
                      textAnchor={isIncome ? "end" : "start"}
                      dominantBaseline="middle"
                      style={{ fontSize: "0.5625rem", fill: "var(--color-accent)", fontFamily: "inherit" }}
                    >
                      View transactions →
                    </text>
                  )}
                </g>
              );
            }}
          />
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── Cash Flow Tab ────────────────────────────────────────────────────────────

function CashFlowTab({
  startDate,
  endDate,
}: {
  startDate: string;
  endDate: string;
}) {
  const { data, isLoading } = useQuery<CashFlowReport>({
    queryKey: ["reports-cashflow", startDate, endDate],
    queryFn: () =>
      api
        .get(`/reports/cashflow?startDate=${startDate}&endDate=${endDate}`)
        .then((r) => r.data),
  });

  const { data: spendingData } = useQuery<{
    total: number;
    items: { id: string; name: string; icon: string | null; amount: number }[];
  }>({
    queryKey: ["reports-spending-sankey", startDate, endDate],
    queryFn: () =>
      api
        .get(
          `/reports/spending?startDate=${startDate}&endDate=${endDate}&groupBy=category`,
        )
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
    if (!data?.byMonth) return [];
    return data.byMonth.map((m) => ({
      month: MONTH_NAMES[m.month - 1],
      monthIndex: m.month,
      income: m.income,
      expenses: m.expenses,
      net: m.net,
    }));
  }, [data]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <KpiCards cards={kpiCards} isLoading={isLoading} />

      {/* Bar chart */}
      <Card padding="lg">
        {isLoading ? (
          <Skeleton height={240} width="100%" />
        ) : (
          <>
            <div
              style={{
                marginBottom: "0.75rem",
                display: "flex",
                alignItems: "center",
                gap: "1.25rem",
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
                Cash Flow Overview
              </span>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "1rem",
                  marginLeft: "auto",
                }}
              >
                <LegendDot color="var(--color-success)" label="Income" />
                <LegendDot color="var(--color-danger)" label="Expenses" />
                <LegendDot color="var(--color-text-muted)" label="Net" line />
              </div>
            </div>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <ComposedChart
                  data={chartData}
                  margin={{ top: 4, right: 8, bottom: 0, left: 0 }}
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
                    fill="var(--color-success)"
                    radius={[3, 3, 0, 0]}
                    maxBarSize={28}
                    opacity={0.85}
                  />
                  <Bar
                    dataKey="expenses"
                    name="expenses"
                    fill="var(--color-danger)"
                    radius={[3, 3, 0, 0]}
                    maxBarSize={28}
                    opacity={0.85}
                  />
                  <Line
                    type="monotone"
                    dataKey="net"
                    name="net"
                    stroke="var(--color-text-muted)"
                    strokeWidth={2}
                    dot={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
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
                No cash flow data for this period.
              </div>
            )}
          </>
        )}
      </Card>

      {/* Money Flow Sankey */}
      <Card padding="lg">
        <div
          style={{
            marginBottom: "0.75rem",
            fontSize: "0.875rem",
            fontWeight: 600,
            color: "var(--color-text-secondary)",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
          }}
        >
          Money Flow
        </div>
        <ReportsSankeyChart
          income={data?.income ?? 0}
          net={data?.net ?? 0}
          spendingItems={spendingData?.items ?? []}
          startDate={startDate}
          endDate={endDate}
        />
      </Card>
    </div>
  );
}

// ─── Spending / Income tab (shared layout) ────────────────────────────────────

interface CategoryTabProps {
  mode: "spending" | "income";
  startDate: string;
  endDate: string;
}

function CategoryTab({ mode, startDate, endDate }: CategoryTabProps) {
  const [groupBy, setGroupBy] = useState<GroupBy>("category");
  const [chartType, setChartType] = useState<ChartType>("donut");
  const [showAll, setShowAll] = useState(false);
  const [txPage, setTxPage] = useState(1);

  const { data: reportData, isLoading: reportLoading } = useQuery<
    SpendingReport | IncomeReport
  >({
    queryKey: [`reports-${mode}`, startDate, endDate, groupBy],
    queryFn: () =>
      api
        .get(
          `/reports/${mode}?startDate=${startDate}&endDate=${endDate}&groupBy=${groupBy}`,
        )
        .then((r) => r.data),
    enabled: true,
  });

  const { data: txData, isLoading: txLoading } = useQuery<TransactionsResponse>(
    {
      queryKey: [`reports-${mode}-transactions`, startDate, endDate, txPage],
      queryFn: () =>
        api
          .get(
            `/transactions?startDate=${startDate}&endDate=${endDate}&type=${mode}&page=${txPage}&pageSize=20`,
          )
          .then((r) => r.data),
    },
  );

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
    name: cat.name,
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
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "55% 45%",
          gap: "1rem",
          alignItems: "start",
        }}
      >
        {/* Left: chart */}
        <Card padding="lg">
          {reportLoading ? (
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
  name: string;
  value: number;
  pct: number;
  color: string;
}

function ChartView({
  type,
  data,
  total,
  color,
}: {
  type: ChartType;
  data: PieEntry[];
  total: number;
  color: string;
}) {
  if (type === "donut" || type === "pie") {
    const innerRadius = type === "donut" ? 80 : 0;

    return (
      <div style={{ position: "relative" }}>
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
    );
  }

  // Line chart
  return (
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
      {/* Avatar */}
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: "var(--radius-md)",
          backgroundColor: txn.categoryColor ?? "var(--color-accent)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: txn.categoryIcon ? "1rem" : "0.875rem",
          fontWeight: 700,
          color: "#fff",
          flexShrink: 0,
        }}
      >
        {txn.categoryIcon ?? merchantInitial(txn.merchant)}
      </div>

      {/* Merchant + category */}
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
          {txn.merchant}
        </div>
        <div
          style={{
            fontSize: "0.75rem",
            color: "var(--color-text-muted)",
            marginTop: "0.0625rem",
          }}
        >
          {txn.categoryName} · {txn.accountName}
        </div>
      </div>

      {/* Date */}
      <div
        style={{
          fontSize: "0.75rem",
          color: "var(--color-text-muted)",
          whiteSpace: "nowrap",
          flexShrink: 0,
        }}
      >
        {new Date(txn.date).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        })}
      </div>

      {/* Amount */}
      <div
        style={{
          fontSize: "0.9375rem",
          fontWeight: 600,
          color: isNegative ? "var(--color-danger)" : "var(--color-success)",
          whiteSpace: "nowrap",
          flexShrink: 0,
          minWidth: 72,
          textAlign: "right",
        }}
      >
        {isNegative ? "−" : "+"}
        {fmtCurrency(txn.amount)}
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
        <Button variant="secondary" onClick={() => { setName(""); onClose(); }}>Cancel</Button>
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

  const { startDate, endDate } = useMemo(
    () => computeDateRange(datePreset),
    [datePreset],
  );

  const currentFilters: SavedReport["filters"] = { tab, datePreset, startDate, endDate };

  function loadSavedView(filters: SavedReport["filters"]) {
    if (filters.tab) setTab(filters.tab);
    if (filters.datePreset) setDatePreset(filters.datePreset as DatePreset);
  }

  return (
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

          <button
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
            <SlidersHorizontal size={14} />
            Filters
          </button>

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

      {/* Tab content */}
      {tab === "cashflow" && (
        <CashFlowTab startDate={startDate} endDate={endDate} />
      )}
      {tab === "spending" && (
        <CategoryTab mode="spending" startDate={startDate} endDate={endDate} />
      )}
      {tab === "income" && (
        <CategoryTab mode="income" startDate={startDate} endDate={endDate} />
      )}

      <SaveViewModal
        open={saveModalOpen}
        onClose={() => setSaveModalOpen(false)}
        filters={currentFilters}
      />
    </div>
  );
}
