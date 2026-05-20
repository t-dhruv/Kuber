import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card } from "@/components/ui";
import {
  CashFlowReport,
  SavingsMonthly,
  fmtCurrencySigned,
  fmtPct,
  KpiCards,
  SummaryRow,
} from "../shared";

export function SavingsTab({
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
        .get(
          `/reports/cashflow?startDate=${startDate}&endDate=${endDate}${extraParams}`,
        )
        .then((r) => r.data),
  });

  const kpiCards = [
    {
      label: "Total Savings",
      value: fmtCurrencySigned(data?.net ?? 0),
      color: data && data.net >= 0 ? "var(--color-success)" : "var(--color-danger)",
    },
    {
      label: "Savings Rate",
      value: fmtPct(data?.savingsRate ?? 0),
      color: getSavingsRateColor(data?.savingsRate ?? 0),
    },
    {
      label: "Avg Monthly Savings",
      value: fmtCurrencySigned((data?.net ?? 0) / (data?.byMonth.length || 1)),
      color: "var(--color-text)",
    },
    {
      label: "Months Saved",
      value: `${data?.byMonth.filter((m) => m.net > 0).length ?? 0} / ${data?.byMonth.length ?? 0}`,
      color: "var(--color-text)",
    },
  ];

  const monthlyData = data?.monthly ?? [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <KpiCards cards={kpiCards} isLoading={isLoading} />

      {/* Summary */}
      <Card>
        <div style={{ padding: "1rem" }}>
          <h3
            style={{
              fontSize: "0.875rem",
              fontWeight: 700,
              textTransform: "uppercase",
              color: "var(--color-text-secondary)",
              marginBottom: "1rem",
            }}
          >
            Summary
          </h3>
          <SummaryRow label="Total Income" value={fmtCurrencySigned(data?.income ?? 0)} />
          <SummaryRow label="Total Expenses" value={fmtCurrencySigned(data?.expenses ?? 0)} />
          <SummaryRow label="Net Savings" value={fmtCurrencySigned(data?.net ?? 0)} />
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              paddingBottom: 0,
              borderBottom: "none",
            }}
          >
            <span style={{ fontSize: "0.875rem", color: "var(--color-text-secondary)" }}>
              Savings Rate
            </span>
            <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--color-text)" }}>
              {fmtPct(data?.savingsRate ?? 0)}
            </span>
          </div>
        </div>
      </Card>

      {/* Monthly Breakdown */}
      {monthlyData.length > 0 && (
        <Card>
          <div style={{ padding: "1rem" }}>
            <h3
              style={{
                fontSize: "0.875rem",
                fontWeight: 700,
                marginBottom: "1rem",
              }}
            >
              Monthly Breakdown
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {(monthlyData as SavingsMonthly[]).map((m, i) => (
                <div key={i}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginBottom: "0.375rem",
                    }}
                  >
                    <span style={{ fontSize: "0.875rem", fontWeight: 500 }}>
                      {m.month}
                    </span>
                    <span
                      style={{
                        fontSize: "0.875rem",
                        fontWeight: 600,
                        color:
                          m.net >= 0
                            ? "var(--color-success)"
                            : "var(--color-danger)",
                      }}
                    >
                      {fmtCurrencySigned(m.net)}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: "0.75rem",
                      color: "var(--color-text-secondary)",
                    }}
                  >
                    {fmtCurrencySigned(m.income)} income — {fmtCurrencySigned(m.expenses)} expenses
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

function getSavingsRateColor(rate: number): string {
  if (rate >= 20) return "var(--color-success)";
  if (rate >= 10) return "var(--color-warning)";
  return "var(--color-danger)";
}
