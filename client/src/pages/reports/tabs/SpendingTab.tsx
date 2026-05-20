import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "@/lib/api";
import { Card } from "@/components/ui";
import {
  SpendingReport,
  IncomeReport,
  ChartType,
  GroupBy,
  TransactionsResponse,
  fmtCurrency,
  fmtCurrencySigned,
  fmtPct,
  CATEGORICAL_COLORS,
  KpiCards,
  HorizontalBar,
} from "../shared";

interface CategoryTabProps {
  mode: "spending" | "income";
  startDate: string;
  endDate: string;
  extraParams?: string;
  onDrillClick?: (
    id: string,
    name: string,
    icon: string | null | undefined,
    mode: "spending" | "income",
    groupBy: string,
  ) => void;
}

export function SpendingTab({
  mode,
  startDate,
  endDate,
  extraParams = "",
  onDrillClick,
}: CategoryTabProps) {
  const [groupBy, setGroupBy] = useState<GroupBy>("category");
  const [chartType, setChartType] = useState<ChartType>("donut");
  const [showAll, setShowAll] = useState(false);
  const [txPage, setTxPage] = useState(1);

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
      queryKey: [
        `reports-${mode}-transactions`,
        startDate,
        endDate,
        txPage,
        extraParams,
      ],
      queryFn: () => {
        const amountFilter =
          mode === "spending" ? "&maxAmount=-0.01" : "&minAmount=0.01";
        return api
          .get(
            `/transactions?startDate=${startDate}&endDate=${endDate}${amountFilter}&page=${txPage}&pageSize=20${extraParams}`,
          )
          .then((r) => r.data);
      },
    },
  );

  const categories = reportData?.items ?? [];
  const displayedCategories = showAll ? categories : categories.slice(0, 8);
  const total = reportData?.total ?? 0;
  const topMerchant = reportData?.largest;
  const chartData: ChartEntry[] = displayedCategories.map((cat, i) => ({
    id: cat.id,
    name: cat.name,
    icon: cat.icon,
    value: Math.abs(cat.amount),
    percent: cat.percent,
    color: CATEGORICAL_COLORS[i % CATEGORICAL_COLORS.length],
  }));

  const groupByOptions: { value: GroupBy; label: string }[] = [
    { value: "category", label: "Category" },
    { value: "merchant", label: "Merchant" },
    { value: "account", label: "Account" },
  ];

  const chartTypeOptions: { value: ChartType; label: string }[] = [
    { value: "donut", label: "Donut" },
    { value: "pie", label: "Pie" },
    { value: "bar", label: "Bar" },
    { value: "line", label: "Line" },
  ];

  const kpiCards = [
    {
      label: mode === "spending" ? "Total Spending" : "Total Income",
      value: fmtCurrencySigned(total),
      color: mode === "spending" ? "var(--color-danger)" : "var(--color-success)",
    },
    {
      label: "Avg per Transaction",
      value: fmtCurrency(reportData?.average ?? 0),
      color: "var(--color-text)",
    },
    {
      label: "Transaction Count",
      value: `${reportData?.transactionCount ?? 0}`,
      color: "var(--color-text)",
    },
    {
      label: "Top Merchant",
      value: topMerchant?.merchantName ?? "—",
      color: "var(--color-text)",
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <KpiCards cards={kpiCards} isLoading={reportLoading} />

      {/* Details */}
      <Card>
        <div style={{ padding: "1rem" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "0.75rem",
              flexWrap: "wrap",
              marginBottom: "1rem",
            }}
          >
            <h3 style={{ fontSize: "0.875rem", fontWeight: 700 }}>
              Breakdown by {groupByOptions.find((option) => option.value === groupBy)?.label}
            </h3>

            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              <SegmentedButtons
                label="Group by"
                options={groupByOptions}
                value={groupBy}
                onChange={setGroupBy}
              />
              <SegmentedButtons
                label="Chart type"
                options={chartTypeOptions}
                value={chartType}
                onChange={setChartType}
              />
            </div>
          </div>

          <div style={{ marginBottom: "1.25rem" }}>
            {reportLoading ? (
              <div
                style={{
                  height: 280,
                  borderRadius: "var(--radius-md)",
                  backgroundColor: "var(--color-surface-hover)",
                }}
              />
            ) : chartData.length === 0 ? (
              <div
                style={{
                  height: 240,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--color-text-muted)",
                  fontSize: "0.875rem",
                }}
              >
                No {mode} data for this period.
              </div>
            ) : (
              <ChartView
                type={chartType}
                data={chartData}
                total={Math.abs(total)}
                onDrillClick={
                  onDrillClick
                    ? (id, name, icon) => onDrillClick(id, name, icon, mode, groupBy)
                    : undefined
                }
              />
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {displayedCategories.map((cat, i) => (
              <div key={i}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.375rem" }}>
                  <span style={{ fontSize: "0.875rem", fontWeight: 500 }}>
                    {cat.name}
                  </span>
                  <span style={{ fontSize: "0.875rem", fontWeight: 600 }}>
                    {fmtCurrencySigned(cat.amount)}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <HorizontalBar pct={cat.percent} color={CATEGORICAL_COLORS[i % CATEGORICAL_COLORS.length]} />
                  <span style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)", minWidth: 35 }}>
                    {Math.round(cat.percent)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
          {categories.length > 8 && !showAll && (
            <button
              onClick={() => setShowAll(true)}
              style={{
                marginTop: "1rem",
                padding: "0.5rem 1rem",
                borderRadius: "var(--radius-md)",
                fontSize: "0.8125rem",
                fontWeight: 500,
                border: "1px solid var(--color-border)",
                backgroundColor: "transparent",
                color: "var(--color-accent)",
                cursor: "pointer",
              }}
            >
              Show all {categories.length} items
            </button>
          )}
          {categories.length > 8 && showAll && (
            <button
              onClick={() => setShowAll(false)}
              style={{
                marginTop: "1rem",
                padding: "0.5rem 1rem",
                borderRadius: "var(--radius-md)",
                fontSize: "0.8125rem",
                fontWeight: 500,
                border: "1px solid var(--color-border)",
                backgroundColor: "transparent",
                color: "var(--color-accent)",
                cursor: "pointer",
              }}
            >
              Show fewer items
            </button>
          )}
        </div>
      </Card>

      {/* Transactions */}
      <Card>
        <div style={{ padding: "1rem" }}>
          <h3 style={{ fontSize: "0.875rem", fontWeight: 700, marginBottom: "1rem" }}>
            Recent Transactions ({txData?.total ?? 0})
          </h3>
          {txLoading ? (
            <div
              style={{
                height: 96,
                borderRadius: "var(--radius-md)",
                backgroundColor: "var(--color-surface-hover)",
              }}
            />
          ) : (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {txData?.transactions.slice(0, 20).map((tx) => (
                  <div key={tx.id} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8125rem", paddingBottom: "0.5rem", borderBottom: "1px solid var(--color-border)" }}>
                    <span>{tx.merchantName}</span>
                    <span style={{ fontWeight: 600 }}>{fmtCurrencySigned(tx.amount)}</span>
                  </div>
                ))}
              </div>
              {txData && txPage < txData.totalPages && (
                <button
                  type="button"
                  onClick={() => setTxPage((page) => page + 1)}
                  style={{
                    marginTop: "1rem",
                    padding: "0.5rem 1rem",
                    borderRadius: "var(--radius-md)",
                    fontSize: "0.8125rem",
                    fontWeight: 500,
                    border: "1px solid var(--color-border)",
                    backgroundColor: "transparent",
                    color: "var(--color-accent)",
                    cursor: "pointer",
                  }}
                >
                  Load more transactions
                </button>
              )}
            </>
          )}
        </div>
      </Card>
    </div>
  );
}

interface ChartEntry {
  id: string;
  name: string;
  icon?: string;
  value: number;
  percent: number;
  color: string;
}

function SegmentedButtons<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div
      aria-label={label}
      style={{
        display: "flex",
        backgroundColor: "var(--color-surface-hover)",
        borderRadius: "var(--radius-md)",
        padding: "0.125rem",
        flexWrap: "wrap",
      }}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          style={{
            padding: "0.25rem 0.625rem",
            borderRadius: "calc(var(--radius-md) - 2px)",
            border: "none",
            backgroundColor: value === option.value ? "var(--color-surface)" : "transparent",
            boxShadow: value === option.value ? "var(--shadow-sm)" : "none",
            color: value === option.value ? "var(--color-text)" : "var(--color-text-secondary)",
            cursor: "pointer",
            fontSize: "0.75rem",
            fontWeight: 500,
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function ChartView({
  type,
  data,
  total,
  onDrillClick,
}: {
  type: ChartType;
  data: ChartEntry[];
  total: number;
  onDrillClick?: (id: string, name: string, icon?: string) => void;
}) {
  if (type === "donut" || type === "pie") {
    return (
      <div role="img" aria-label="Spending breakdown chart" style={{ position: "relative" }}>
        <ResponsiveContainer width="100%" height={280}>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={type === "donut" ? 82 : 0}
              outerRadius={112}
              paddingAngle={2}
              onClick={(entry: ChartEntry) => {
                if (onDrillClick) onDrillClick(entry.id, entry.name, entry.icon);
              }}
              style={{ cursor: onDrillClick ? "pointer" : undefined }}
            >
              {data.map((entry) => (
                <Cell key={entry.id} fill={entry.color} />
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
            <div style={{ fontSize: "1.125rem", fontWeight: 700, color: "var(--color-text)" }}>
              {fmtCurrency(total)}
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
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
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={data} layout="vertical" margin={{ top: 0, right: 8, bottom: 0, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" horizontal={false} />
            <XAxis
              type="number"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 10, fill: "var(--color-text-muted)" }}
              tickFormatter={(value: number) => `$${(value / 1000).toFixed(0)}k`}
            />
            <YAxis
              type="category"
              dataKey="name"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: "var(--color-text-muted)" }}
              width={100}
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
            <Bar dataKey="value" radius={[0, 3, 3, 0]} maxBarSize={22}>
              {data.map((entry) => (
                <Cell key={entry.id} fill={entry.color} />
              ))}
            </Bar>
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    );
  }

  return (
    <div role="img" aria-label="Spending breakdown chart">
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
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
            tickFormatter={(value: number) => `$${(value / 1000).toFixed(0)}k`}
            width={42}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-md)",
              fontSize: "0.8125rem",
            }}
            formatter={(value: number, _name, item) => [
              `${fmtCurrency(value)} (${fmtPct((item.payload as ChartEntry).percent)})`,
              "Amount",
            ]}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke="var(--color-accent)"
            strokeWidth={2}
            dot={{ r: 4, fill: "var(--color-accent)" }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
