import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, X } from "lucide-react";
import { api } from "@/lib/api";
import { Button, Card } from "@/components/ui";
import {
  standardDrilldownPath,
  standardReportPath,
  type StandardReportFilters,
  type StandardReportResponse,
} from "../standardReportClient";

interface DrilldownResponse {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  items: Array<{
    id: string;
    date: string;
    description: string;
    amountDecimal: string;
    currencyCode: string;
    account: { id: string; name: string } | null;
    category: { id: string; name: string } | null;
    merchant: { id: string; name: string } | null;
    tags: Array<{ id: string; name: string }>;
    pending: boolean;
    hidden: boolean;
    reconciled: boolean;
  }>;
}

function valueLabel(value: unknown): string {
  if (value == null) return "";
  return String(value);
}

export function StandardReportPanel({ filters }: { filters: StandardReportFilters }) {
  const [drilldown, setDrilldown] = useState<{ label: string; params: Record<string, string> } | null>(null);
  const reportQuery = useQuery<StandardReportResponse>({
    queryKey: ["reports", "standard", filters],
    queryFn: () => api.get(standardReportPath(filters)).then((r) => r.data),
  });

  const drilldownQuery = useQuery<DrilldownResponse>({
    queryKey: ["reports", "standard-drilldown", filters, drilldown?.params],
    queryFn: () => api.get(standardDrilldownPath(filters, drilldown?.params ?? {})).then((r) => r.data),
    enabled: Boolean(drilldown),
  });

  if (reportQuery.isLoading) {
    return (
      <div className="grid gap-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((item) => (
            <div key={item} className="h-24 rounded-md bg-[var(--color-surface-hover)] border border-[var(--color-border)]" />
          ))}
        </div>
        <div className="h-64 rounded-md bg-[var(--color-surface-hover)] border border-[var(--color-border)]" />
      </div>
    );
  }

  if (reportQuery.isError || !reportQuery.data) {
    return (
      <Card style={{ padding: "1rem" }}>
        <p style={{ color: "var(--color-danger)", margin: 0 }}>Unable to load this report.</p>
      </Card>
    );
  }

  const report = reportQuery.data;

  return (
    <div className="grid gap-4">
      {(report.metadata.warnings.length > 0 || report.metadata.calculationNotes.length > 0) && (
        <Card style={{ padding: "1rem" }}>
          <div className="grid gap-2">
            {report.metadata.warnings.map((warning) => (
              <div key={warning} style={{ color: "var(--color-warning)", fontSize: "0.875rem" }}>{warning}</div>
            ))}
            {report.metadata.calculationNotes.map((note) => (
              <div key={note} style={{ color: "var(--color-text-secondary)", fontSize: "0.8125rem" }}>{note}</div>
            ))}
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {report.summaryCards.map((card) => (
          <Card key={card.key} style={{ padding: "1rem" }}>
            <div style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)", fontWeight: 600, textTransform: "uppercase" }}>
              {card.label}
            </div>
            <div style={{ fontSize: "1.5rem", fontWeight: 700, marginTop: "0.25rem" }}>{card.formattedValue}</div>
            {card.drilldown && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setDrilldown({ label: card.label, params: card.drilldown ?? {} })}
                style={{ marginTop: "0.5rem" }}
                icon={<ChevronRight size={14} />}
              >
                Drill down
              </Button>
            )}
          </Card>
        ))}
      </div>

      {report.charts.map((chart) => (
        <Card key={chart.key} style={{ padding: "1rem" }}>
          <h2 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "0.75rem" }}>{chart.title}</h2>
          {chart.data.length === 0 ? (
            <p style={{ color: "var(--color-text-secondary)", margin: 0 }}>No chart data for this range.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
                <tbody>
                  {chart.data.slice(0, 12).map((row, index) => (
                    <tr key={`${chart.key}-${index}`}>
                      {Object.entries(row).map(([key, value]) => (
                        <td key={key} style={{ padding: "0.5rem", borderBottom: "1px solid var(--color-border)" }}>
                          <span style={{ color: "var(--color-text-secondary)" }}>{key}: </span>
                          {valueLabel(value)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ))}

      {report.tables.map((table) => (
        <Card key={table.key} style={{ padding: "1rem" }}>
          <h2 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "0.75rem" }}>{table.title}</h2>
          {table.rows.length === 0 ? (
            <p style={{ color: "var(--color-text-secondary)", margin: 0 }}>No rows match the selected filters.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
                <thead>
                  <tr>
                    {table.columns.map((column) => (
                      <th key={column.key} style={{ textAlign: "left", padding: "0.5rem", borderBottom: "1px solid var(--color-border)" }}>
                        {column.label}
                      </th>
                    ))}
                    <th style={{ width: 120 }} />
                  </tr>
                </thead>
                <tbody>
                  {table.rows.map((row, index) => (
                    <tr key={String(row.id ?? index)}>
                      {table.columns.map((column) => (
                        <td key={column.key} style={{ padding: "0.5rem", borderBottom: "1px solid var(--color-border)" }}>
                          {valueLabel(row[column.key])}
                        </td>
                      ))}
                      <td style={{ padding: "0.5rem", borderBottom: "1px solid var(--color-border)" }}>
                        {row.id && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setDrilldown({ label: valueLabel(row.name ?? row.label ?? table.title), params: table.key.includes("merchant") ? { merchantId: String(row.id) } : table.key.includes("tag") ? { tagId: String(row.id) } : table.key.includes("account") ? { accountId: String(row.id) } : table.key.includes("budget") ? { budgetId: String(row.id) } : { categoryId: String(row.id) } })}
                          >
                            View
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ))}

      {drilldown && (
        <div style={{ position: "fixed", inset: 0, zIndex: 50, backgroundColor: "rgba(0,0,0,0.25)" }}>
          <aside style={{ marginLeft: "auto", height: "100%", width: "min(560px, 100%)", backgroundColor: "var(--color-surface)", padding: "1rem", overflowY: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
              <h2 style={{ fontSize: "1.125rem", fontWeight: 700 }}>Transactions: {drilldown.label}</h2>
              <Button variant="ghost" size="sm" onClick={() => setDrilldown(null)} icon={<X size={16} />}>Close</Button>
            </div>
            {drilldownQuery.isLoading ? (
              <p style={{ color: "var(--color-text-secondary)" }}>Loading transactions...</p>
            ) : drilldownQuery.data?.items.length ? (
              <div className="grid gap-2">
                {drilldownQuery.data.items.map((item) => (
                  <div key={item.id} style={{ padding: "0.75rem", border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}>
                      <strong>{item.description}</strong>
                      <span>{item.amountDecimal} {item.currencyCode}</span>
                    </div>
                    <div style={{ color: "var(--color-text-secondary)", fontSize: "0.8125rem", marginTop: "0.25rem" }}>
                      {item.date.slice(0, 10)} · {item.account?.name ?? "No account"} · {item.category?.name ?? "Uncategorized"} · {item.merchant?.name ?? "No merchant"}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ color: "var(--color-text-secondary)" }}>No transactions match this drill-down.</p>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
