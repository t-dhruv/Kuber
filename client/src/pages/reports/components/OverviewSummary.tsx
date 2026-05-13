import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui";
import { api } from "@/lib/api";
import type { ReportOverviewDto } from "@kuber/shared";

const money = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);

function card(label: string, value: string, detail?: string) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm">
      <div className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-[var(--color-text)]">{value}</div>
      {detail && <div className="mt-1 text-xs text-[var(--color-text-muted)]">{detail}</div>}
    </div>
  );
}

export function OverviewSummary() {
  const { data, isLoading, isError } = useQuery<ReportOverviewDto>({
    queryKey: ["reports", "overview"],
    queryFn: () => api.get("/reports/overview").then((r) => r.data),
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <Skeleton className="h-4 w-20 mb-3" />
            <Skeleton className="h-7 w-28" />
          </div>
        ))}
      </div>
    );
  }

  if (isError || !data) {
    return null;
  }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {card("Net worth", money(data.netWorth.total))}
      {card("Portfolio", money(data.investments.portfolioValue))}
      {card(
        "Cash flow",
        money(data.cashFlow.income - data.cashFlow.expense),
        `${money(data.cashFlow.income)} in • ${money(data.cashFlow.expense)} out`,
      )}
      {card("Savings rate", `${Math.round(data.cashFlow.savingsRate * 100)}%`)}
      {card("Transfers", money(data.cashFlow.transferTotal), `${data.diagnostics.unmatchedTransfers} unmatched`)}
      {card("Tax drag", money(data.taxes.taxDrag), `${money(data.taxes.realizedGains)} realized gains`)}
      {card(
        "Diagnostics",
        `${data.diagnostics.missingPrices} missing prices`,
        `${data.diagnostics.duplicateTransactions} duplicates`,
      )}
    </div>
  );
}
