import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { api } from "@/lib/api";
import { Card, Skeleton } from "@/components/ui";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ForecastProjection {
  date: string;
  projected: number;
  dailyNet: number;
}

interface ForecastResponse {
  currentBalance: number;
  projections: ForecastProjection[];
  summary: {
    days: number;
    projectedEndBalance: number;
    avgMonthlyIncome: number;
    avgMonthlyExpense: number;
    knownRecurringTotal: number;
  };
}

// ─── Formatters ───────────────────────────────────────────────────────────────

const fmtCurrency = (amount: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);

const fmtCurrencyCompact = (amount: number) => {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return fmtCurrency(amount);
};

function fmtAxisDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00");
  if (days <= 30) {
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  // For 60/90 days show biweekly labels — handled via tick formatter + interval
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ─── Summary Cards ────────────────────────────────────────────────────────────

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
        flex: "1 1 150px",
        padding: "0.875rem 1rem",
        borderRadius: "var(--radius-lg)",
        border: "1px solid var(--color-border)",
        backgroundColor: "var(--color-surface)",
        display: "flex",
        flexDirection: "column",
        gap: "0.25rem",
      }}
    >
      <span
        style={{
          fontSize: "0.75rem",
          color: "var(--color-text-secondary)",
          fontWeight: 500,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: "1.125rem",
          fontWeight: 700,
          color: color ?? "var(--color-text)",
        }}
      >
        {value}
      </span>
    </div>
  );
}

// ─── Custom Tooltip ───────────────────────────────────────────────────────────

function ForecastTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}) {
  if (!active || !payload?.length || !label) return null;
  const projected = payload[0]?.value ?? 0;
  const d = new Date(label + "T00:00:00");
  const dateLabel = d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  return (
    <div
      style={{
        backgroundColor: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-md)",
        padding: "0.625rem 0.875rem",
        fontSize: "0.8125rem",
        boxShadow: "var(--shadow-md)",
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: "0.25rem", color: "var(--color-text)" }}>
        {dateLabel}
      </div>
      <div style={{ color: projected >= 0 ? "var(--color-success)" : "var(--color-danger)" }}>
        Balance: {fmtCurrency(projected)}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function CashFlowForecast() {
  const [days, setDays] = useState<30 | 60 | 90>(30);

  const { data, isLoading, isError } = useQuery<ForecastResponse>({
    queryKey: ["cashflow", "forecast", days],
    queryFn: async () => {
      const res = await api.get(`/cashflow/forecast?days=${days}`);
      return res.data;
    },
    staleTime: 5 * 60 * 1000,
  });

  // Determine x-axis tick interval based on days
  const tickInterval = days === 30 ? 6 : days === 60 ? 13 : 14;

  const netMonthly = (data?.summary.avgMonthlyIncome ?? 0) - (data?.summary.avgMonthlyExpense ?? 0);
  const endBalance = data?.summary.projectedEndBalance ?? 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      {/* Days selector */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <span
          style={{
            fontSize: "0.8125rem",
            fontWeight: 500,
            color: "var(--color-text-secondary)",
          }}
        >
          Forecast window:
        </span>
        {([30, 60, 90] as const).map((d) => (
          <button
            key={d}
            onClick={() => setDays(d)}
            style={{
              padding: "0.25rem 0.75rem",
              borderRadius: "var(--radius-md)",
              fontSize: "0.8125rem",
              fontWeight: days === d ? 600 : 400,
              border: days === d ? "1px solid var(--color-accent)" : "1px solid var(--color-border)",
              backgroundColor: days === d ? "var(--color-accent-light)" : "var(--color-surface)",
              color: days === d ? "var(--color-accent)" : "var(--color-text-secondary)",
              cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            {d}d
          </button>
        ))}
      </div>

      {/* Summary cards */}
      {isLoading ? (
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} style={{ flex: "1 1 150px" }}>
              <Skeleton height={72} />
            </div>
          ))}
        </div>
      ) : (
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <SummaryCard
            label="Current Balance"
            value={fmtCurrency(data?.currentBalance ?? 0)}
          />
          <SummaryCard
            label={`Projected (${days}d)`}
            value={fmtCurrency(endBalance)}
            color={
              endBalance >= (data?.currentBalance ?? 0)
                ? "var(--color-success)"
                : "var(--color-danger)"
            }
          />
          <SummaryCard
            label="Avg Monthly Income"
            value={fmtCurrency(data?.summary.avgMonthlyIncome ?? 0)}
            color="var(--color-success)"
          />
          <SummaryCard
            label="Avg Monthly Expenses"
            value={fmtCurrency(data?.summary.avgMonthlyExpense ?? 0)}
            color="var(--color-danger)"
          />
          <SummaryCard
            label="Net Monthly"
            value={fmtCurrencyCompact(netMonthly)}
            color={netMonthly >= 0 ? "var(--color-success)" : "var(--color-danger)"}
          />
        </div>
      )}

      {/* Chart */}
      <Card>
        <div style={{ padding: "1rem 1.25rem 0.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontWeight: 600, fontSize: "0.9375rem", color: "var(--color-text)" }}>
              Projected Balance
            </span>
            {data?.summary.knownRecurringTotal !== undefined &&
              data.summary.knownRecurringTotal !== 0 && (
                <span
                  style={{
                    fontSize: "0.75rem",
                    color: "var(--color-text-secondary)",
                  }}
                >
                  Includes {fmtCurrency(Math.abs(data.summary.knownRecurringTotal))} known recurring
                  {data.summary.knownRecurringTotal < 0 ? " expenses" : " income"}
                </span>
              )}
          </div>
        </div>

        {isLoading && (
          <div style={{ padding: "1rem 1.25rem" }}>
            <Skeleton height={280} />
          </div>
        )}

        {isError && (
          <div
            style={{
              padding: "2rem",
              textAlign: "center",
              color: "var(--color-text-secondary)",
              fontSize: "0.875rem",
            }}
          >
            Failed to load forecast data.
          </div>
        )}

        {!isLoading && !isError && data && (
          <div style={{ padding: "0.5rem 0 1rem" }}>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart
                data={data.projections}
                margin={{ top: 8, right: 24, left: 16, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="forecastGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0c8599" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#0c8599" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--color-border)"
                  vertical={false}
                />
                <XAxis
                  dataKey="date"
                  tickFormatter={(v) => fmtAxisDate(v, days)}
                  interval={tickInterval}
                  tick={{ fontSize: 11, fill: "var(--color-text-secondary)" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={(v) => fmtCurrencyCompact(v)}
                  tick={{ fontSize: 11, fill: "var(--color-text-secondary)" }}
                  axisLine={false}
                  tickLine={false}
                  width={72}
                />
                <Tooltip content={<ForecastTooltip />} />
                <ReferenceLine
                  y={0}
                  stroke="var(--color-danger)"
                  strokeDasharray="4 4"
                  strokeOpacity={0.7}
                />
                <Area
                  type="monotone"
                  dataKey="projected"
                  fill="url(#forecastGradient)"
                  stroke="none"
                />
                <Line
                  type="monotone"
                  dataKey="projected"
                  stroke="#0c8599"
                  strokeWidth={2}
                  strokeDasharray="6 3"
                  dot={false}
                  activeDot={{ r: 4, fill: "#0c8599" }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      {/* Disclaimer */}
      <p
        style={{
          fontSize: "0.75rem",
          color: "var(--color-text-secondary)",
          margin: 0,
        }}
      >
        Projections are estimates based on your last 90 days of transaction history plus known
        recurring items. Actual results may vary.
      </p>
    </div>
  );
}
