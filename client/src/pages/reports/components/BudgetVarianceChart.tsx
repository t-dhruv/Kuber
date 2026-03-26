import { useQuery } from "@tanstack/react-query";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { api } from "@/lib/api";
import { Card, Skeleton } from "@/components/ui";

interface BudgetVarianceCategory {
  categoryId: string;
  name: string;
  emoji: string | null;
  budgeted: number;
  actual: number;
  variance: number;
  variancePct: number;
}

interface BudgetVarianceData {
  categories: BudgetVarianceCategory[];
  totals: {
    budgeted: number;
    actual: number;
    variance: number;
  };
}

const fmtCurrency = (amount: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    Math.abs(amount),
  );

const fmtCurrencySigned = (amount: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);

interface Props {
  from: string;
  to: string;
}

function SummaryCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div
      style={{
        flex: 1,
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-md)",
        padding: "1rem 1.25rem",
      }}
    >
      <div
        style={{
          fontSize: "0.75rem",
          color: "var(--color-text-secondary)",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          marginBottom: "0.375rem",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: "1.375rem",
          fontWeight: 700,
          color: color ?? "var(--color-text)",
        }}
      >
        {value}
      </div>
    </div>
  );
}

// Custom tooltip for the bar chart
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const budgeted = payload.find((p: any) => p.dataKey === "budgeted")?.value ?? 0;
  const actual = payload.find((p: any) => p.dataKey === "actual")?.value ?? 0;
  const variance = budgeted - actual;
  const isOver = variance < 0;
  return (
    <div
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-md)",
        padding: "0.75rem 1rem",
        fontSize: "0.8125rem",
        boxShadow: "var(--shadow-md)",
        minWidth: 180,
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: "0.5rem", color: "var(--color-text)" }}>
        {label}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", marginBottom: "0.25rem" }}>
        <span style={{ color: "var(--color-text-secondary)" }}>Budgeted</span>
        <span style={{ fontWeight: 600 }}>{fmtCurrency(budgeted)}</span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", marginBottom: "0.25rem" }}>
        <span style={{ color: "var(--color-text-secondary)" }}>Actual</span>
        <span style={{ fontWeight: 600 }}>{fmtCurrency(actual)}</span>
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: "1rem",
          borderTop: "1px solid var(--color-border)",
          paddingTop: "0.25rem",
          marginTop: "0.25rem",
        }}
      >
        <span style={{ color: "var(--color-text-secondary)" }}>Variance</span>
        <span style={{ fontWeight: 600, color: isOver ? "#e03131" : "#2f9e44" }}>
          {isOver ? "-" : "+"}{fmtCurrency(Math.abs(variance))}
        </span>
      </div>
    </div>
  );
}

export function BudgetVarianceChart({ from, to }: Props) {
  const { data, isLoading, isError } = useQuery<BudgetVarianceData>({
    queryKey: ["reports", "budget-variance", from, to],
    queryFn: () =>
      api.get(`/reports/budget-variance?from=${from}&to=${to}`).then((r) => r.data),
    enabled: Boolean(from && to),
  });

  if (isLoading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <div style={{ display: "flex", gap: "1rem" }}>
          <Skeleton height={80} style={{ flex: 1 }} />
          <Skeleton height={80} style={{ flex: 1 }} />
          <Skeleton height={80} style={{ flex: 1 }} />
        </div>
        <Skeleton height={320} />
      </div>
    );
  }

  if (isError) {
    return (
      <div
        style={{
          padding: "2rem",
          textAlign: "center",
          color: "var(--color-text-secondary)",
          fontSize: "0.875rem",
        }}
      >
        Failed to load budget variance data.
      </div>
    );
  }

  if (!data || data.categories.length === 0) {
    return (
      <div
        style={{
          padding: "3rem 2rem",
          textAlign: "center",
          color: "var(--color-text-secondary)",
          fontSize: "0.9375rem",
        }}
      >
        <div style={{ fontSize: "2rem", marginBottom: "0.75rem" }}>📊</div>
        <div style={{ fontWeight: 600, marginBottom: "0.375rem", color: "var(--color-text)" }}>
          No budgets set
        </div>
        <div>Create budgets in the Budget page to see variance analysis here.</div>
      </div>
    );
  }

  const { categories, totals } = data;
  const varianceColor = totals.variance >= 0 ? "#2f9e44" : "#e03131";
  const varianceSign = totals.variance >= 0 ? "+" : "";

  // Prepare chart data — truncate long names
  const chartData = categories.map((c) => ({
    name: (c.emoji ? c.emoji + " " : "") + (c.name.length > 14 ? c.name.slice(0, 13) + "…" : c.name),
    fullName: c.name,
    budgeted: c.budgeted,
    actual: c.actual,
    isOver: c.variance < 0,
  }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      {/* Summary cards */}
      <div style={{ display: "flex", gap: "1rem" }}>
        <SummaryCard label="Total Budgeted" value={fmtCurrency(totals.budgeted)} />
        <SummaryCard label="Total Actual" value={fmtCurrency(totals.actual)} />
        <SummaryCard
          label="Total Variance"
          value={`${varianceSign}${fmtCurrencySigned(totals.variance)}`}
          color={varianceColor}
        />
      </div>

      {/* Bar chart */}
      <Card padding="lg">
        <ResponsiveContainer width="100%" height={320}>
          <BarChart
            data={chartData}
            margin={{ top: 4, right: 8, left: 8, bottom: 40 }}
            barCategoryGap="30%"
            barGap={2}
          >
            <CartesianGrid vertical={false} stroke="var(--color-border)" strokeDasharray="3 3" />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 11, fill: "var(--color-text-secondary)" }}
              angle={-35}
              textAnchor="end"
              interval={0}
              height={60}
            />
            <YAxis
              tickFormatter={(v) => `$${(v / 1000).toFixed(v >= 1000 ? 1 : 0)}${v >= 1000 ? "k" : ""}`}
              tick={{ fontSize: 11, fill: "var(--color-text-secondary)" }}
              axisLine={false}
              tickLine={false}
              width={52}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              wrapperStyle={{ fontSize: "0.8125rem", paddingTop: "0.5rem" }}
            />
            <Bar dataKey="budgeted" name="Budgeted" fill="#868e96" radius={[3, 3, 0, 0]} />
            <Bar dataKey="actual" name="Actual" radius={[3, 3, 0, 0]}>
              {chartData.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={entry.isOver ? "#e03131" : "#2f9e44"}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* Table breakdown */}
      <Card padding="none">
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid var(--color-border)" }}>
                <th style={{ padding: "0.75rem 1rem", textAlign: "left", color: "var(--color-text-secondary)", fontWeight: 500 }}>Category</th>
                <th style={{ padding: "0.75rem 1rem", textAlign: "right", color: "var(--color-text-secondary)", fontWeight: 500 }}>Budgeted</th>
                <th style={{ padding: "0.75rem 1rem", textAlign: "right", color: "var(--color-text-secondary)", fontWeight: 500 }}>Actual</th>
                <th style={{ padding: "0.75rem 1rem", textAlign: "right", color: "var(--color-text-secondary)", fontWeight: 500 }}>Variance</th>
                <th style={{ padding: "0.75rem 1rem", textAlign: "right", color: "var(--color-text-secondary)", fontWeight: 500 }}>% of Budget</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((c) => {
                const isOver = c.variance < 0;
                const pctUsed = c.budgeted > 0 ? (c.actual / c.budgeted) * 100 : null;
                return (
                  <tr
                    key={c.categoryId}
                    style={{ borderBottom: "1px solid var(--color-border)" }}
                  >
                    <td style={{ padding: "0.625rem 1rem", color: "var(--color-text)" }}>
                      {c.emoji && <span style={{ marginRight: "0.375rem" }}>{c.emoji}</span>}
                      {c.name}
                    </td>
                    <td style={{ padding: "0.625rem 1rem", textAlign: "right", color: "var(--color-text-secondary)" }}>
                      {c.budgeted > 0 ? fmtCurrency(c.budgeted) : "—"}
                    </td>
                    <td style={{ padding: "0.625rem 1rem", textAlign: "right", fontWeight: 600, color: "var(--color-text)" }}>
                      {fmtCurrency(c.actual)}
                    </td>
                    <td
                      style={{
                        padding: "0.625rem 1rem",
                        textAlign: "right",
                        fontWeight: 600,
                        color: c.budgeted === 0 ? "var(--color-text-secondary)" : isOver ? "#e03131" : "#2f9e44",
                      }}
                    >
                      {c.budgeted === 0 ? "—" : (isOver ? "-" : "+") + fmtCurrency(Math.abs(c.variance))}
                    </td>
                    <td style={{ padding: "0.625rem 1rem", textAlign: "right", color: "var(--color-text-secondary)" }}>
                      {pctUsed !== null ? `${Math.round(pctUsed)}%` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
