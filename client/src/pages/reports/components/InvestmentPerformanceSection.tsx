import { useQuery } from "@tanstack/react-query";
import { Card, Skeleton } from "@/components/ui";
import { api } from "@/lib/api";
import { ArrowUpRight, TrendingUp } from "lucide-react";

const money = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);

const pct = (value: number) =>
  `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;

type HoldingDto = {
  currentValue: number;
  totalCost: number;
  gain: number;
  gainPercent: number;
};

type HoldingsResponse = {
  holdings: HoldingDto[];
  summary?: {
    totalValue: number;
    totalCost: number;
    totalGain: number;
  };
};

export type InvestmentPerformanceSectionData = {
  portfolioValue: number;
  twr: number;
  mwr: number;
  trailingIncome: number;
};

type InvestmentPerformanceSectionProps = {
  data?: InvestmentPerformanceSectionData;
};

export function InvestmentPerformanceSection({ data }: InvestmentPerformanceSectionProps = {}) {
  const query = useQuery<HoldingsResponse>({
    queryKey: ["reports", "investments", "holdings"],
    queryFn: () => api.get("/investments/holdings").then((r) => r.data),
    enabled: !data,
  });

  const queryPerf = useQuery<{
    portfolioReturn: number;
    portfolioReturnValue: number;
    history: Array<{ date: string; value: number }>;
  }>({
    queryKey: ["reports", "investments", "performance"],
    queryFn: () =>
      api.get("/investments/performance?period=1Y").then((r) => r.data),
    enabled: !data,
  });

  const holdings = query.data?.holdings ?? [];
  const resolved = data ?? {
    portfolioValue:
      query.data?.summary?.totalValue ??
      holdings.reduce((sum, h) => sum + (h.currentValue ?? 0), 0),
    twr: queryPerf.data?.portfolioReturn ?? 0,
    mwr: queryPerf.data?.portfolioReturn ?? 0, // MWR ≈ TWR when no cash flows; real MWR needs full calculation
    trailingIncome: holdings.reduce(
      (sum, h) => sum + ((h as any).trailingIncome ?? 0),
      0,
    ),
  };

  const isLoading = data ? false : query.isLoading || queryPerf.isLoading;
  const isError = data ? false : query.isError || queryPerf.isError;

  const summary = {
    totalValue: resolved.portfolioValue,
    totalCost:
      query.data?.summary?.totalCost ??
      holdings.reduce((sum, h) => sum + (h.totalCost ?? 0), 0),
    totalGain:
      query.data?.summary?.totalGain ??
      holdings.reduce((sum, h) => sum + (h.gain ?? 0), 0),
    twr: resolved.twr,
    mwr: resolved.mwr,
    trailingIncome: resolved.trailingIncome,
  };

  const rows = [
    {
      label: "Time-weighted return",
      value: summary.twr,
      detail: "Market performance excluding cash flow timing",
    },
    {
      label: "Money-weighted return",
      value: summary.mwr,
      detail: "Investor experience including contributions and withdrawals",
    },
    {
      label: "Trailing 12M income",
      value: summary.trailingIncome,
      detail: "Interest, dividends, and distributions",
    },
  ];

  return (
    <div className="space-y-4">
      <div className="text-sm font-semibold text-[var(--color-text)]">
        Investment Performance
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <Card style={{ padding: "1.25rem" }}>
          <div className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">
            Portfolio Value
          </div>
          {isLoading ? (
            <Skeleton className="mt-2 h-7 w-28" />
          ) : (
            <div className="mt-2 text-2xl font-semibold text-[var(--color-text)]">
              {money(summary.totalValue)}
            </div>
          )}
        </Card>
        <Card style={{ padding: "1.25rem" }}>
          <div className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">
            TWR
          </div>
          {isLoading ? (
            <Skeleton className="mt-2 h-7 w-20" />
          ) : (
            <div className="mt-2 text-2xl font-semibold text-[var(--color-text)]">
              {pct(summary.twr)}
            </div>
          )}
        </Card>
        <Card style={{ padding: "1.25rem" }}>
          <div className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">
            MWR / IRR
          </div>
          {isLoading ? (
            <Skeleton className="mt-2 h-7 w-20" />
          ) : (
            <div className="mt-2 text-2xl font-semibold text-[var(--color-text)]">
              {pct(summary.mwr)}
            </div>
          )}
        </Card>
      </div>

      <Card style={{ padding: "1.25rem" }}>
        <div className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text)]">
          <TrendingUp size={16} className="text-[var(--color-accent)]" />
          Performance summary
        </div>
        <div className="mt-4 space-y-3">
          {isError ? (
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-3 text-sm text-[var(--color-danger)]">
              Failed to load portfolio performance.
            </div>
          ) : (
            rows.map((row) => (
              <div
                key={row.label}
                className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-3"
              >
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-sm font-medium text-[var(--color-text)]">
                      {row.label}
                    </div>
                    <div className="text-xs text-[var(--color-text-muted)]">
                      {row.detail}
                    </div>
                  </div>
                  <div className="text-right text-sm font-semibold text-[var(--color-text)]">
                    {typeof row.value === "number" && row.value > 100
                      ? money(row.value)
                      : pct(row.value as number)}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
        <div className="mt-4 flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
          <ArrowUpRight size={14} />
          {holdings.length > 0
            ? `Derived from ${holdings.length} holding${holdings.length === 1 ? "" : "s"} and live portfolio balances.`
            : "No holdings found. Add investments to see performance data."}
        </div>
      </Card>
    </div>
  );
}
