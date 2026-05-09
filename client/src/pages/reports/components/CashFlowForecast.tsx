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
import { getChartColor } from "@/lib/colors";
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
    <div className="flex-[1_1_150px] px-4 py-3.5 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] flex flex-col gap-1">
      <span className="text-xs text-[var(--color-text-secondary)] font-medium uppercase tracking-[0.04em]">
        {label}
      </span>
      <span
        className="text-lg font-bold"
        style={{ color: color ?? "var(--color-text)" }}
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
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] px-3.5 py-2.5 text-[0.8125rem] shadow-[var(--shadow-md)]">
      <div className="font-semibold mb-1 text-[var(--color-text)]">
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
    <div className="flex flex-col gap-4">
      {/* Days selector */}
      <div className="flex items-center gap-2">
        <span className="text-[0.8125rem] font-medium text-[var(--color-text-secondary)]">
          Forecast window:
        </span>
        {([30, 60, 90] as const).map((d) => (
          <button
            key={d}
            onClick={() => setDays(d)}
            className="px-3 py-1 rounded-[var(--radius-md)] text-[0.8125rem] cursor-pointer transition-all duration-150"
            style={{
              fontWeight: days === d ? 600 : 400,
              border: days === d ? "1px solid var(--color-accent)" : "1px solid var(--color-border)",
              backgroundColor: days === d ? "var(--color-accent-light)" : "var(--color-surface)",
              color: days === d ? "var(--color-accent)" : "var(--color-text-secondary)",
            }}
          >
            {d}d
          </button>
        ))}
      </div>

      {/* Summary cards */}
      {isLoading ? (
        <div className="flex gap-3 flex-wrap">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex-[1_1_150px]">
              <Skeleton height={72} />
            </div>
          ))}
        </div>
      ) : (
        <div className="flex gap-3 flex-wrap">
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
        <div className="px-5 pt-4 pb-2">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-[0.9375rem] text-[var(--color-text)]">
              Projected Balance
            </span>
            {data?.summary.knownRecurringTotal !== undefined &&
              data.summary.knownRecurringTotal !== 0 && (
                <span className="text-xs text-[var(--color-text-secondary)]">
                  Includes {fmtCurrency(Math.abs(data.summary.knownRecurringTotal))} known recurring
                  {data.summary.knownRecurringTotal < 0 ? " expenses" : " income"}
                </span>
              )}
          </div>
        </div>

        {isLoading && (
          <div className="px-5 py-4">
            <Skeleton height={280} />
          </div>
        )}

        {isError && (
          <div className="p-8 text-center text-[var(--color-text-secondary)] text-sm">
            Failed to load forecast data.
          </div>
        )}

        {!isLoading && !isError && data && (
          <div className="py-2 pb-4">
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart
                data={data.projections}
                margin={{ top: 8, right: 24, left: 16, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="forecastGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={getChartColor(6)} stopOpacity={0.25} />
                    <stop offset="95%" stopColor={getChartColor(6)} stopOpacity={0.02} />
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
                  stroke={getChartColor(6)}
                  strokeWidth={2}
                  strokeDasharray="6 3"
                  dot={false}
                  activeDot={{ r: 4, fill: getChartColor(6) }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      {/* Disclaimer */}
      <p className="text-xs text-[var(--color-text-secondary)] m-0">
        Projections are estimates based on your last 90 days of transaction history plus known
        recurring items. Actual results may vary.
      </p>
    </div>
  );
}
