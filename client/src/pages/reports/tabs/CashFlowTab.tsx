import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card } from "@/components/ui";
import { ReportsSankeyChart, type SankeyData } from "../components/ReportsSankeyChart";
import {
  CashFlowReport,
  fmtCurrencySigned,
  fmtPct,
  netColor,
  savingsColor,
  KpiCards,
  SummaryRow,
} from "../shared";

export function CashFlowTab({
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

  const { data: sankeyData } = useQuery<SankeyData>({
    queryKey: ["reports-sankey", startDate, endDate, extraParams],
    queryFn: () =>
      api
        .get(
          `/cashflow/sankey?startDate=${startDate}&endDate=${endDate}${extraParams}`,
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
          <SummaryRow label="Net Income" value={fmtCurrencySigned(data?.net ?? 0)} />
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
            <span
              style={{
                fontSize: "0.875rem",
                fontWeight: 600,
                color: "var(--color-text)",
              }}
            >
              {fmtPct(data?.savingsRate ?? 0)}
            </span>
          </div>
        </div>
      </Card>

      {/* Sankey Chart */}
      {sankeyData && (
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
              Cash Flow Diagram
            </h3>
            <ReportsSankeyChart data={sankeyData} />
          </div>
        </Card>
      )}
    </div>
  );
}
