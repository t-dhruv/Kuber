import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, Skeleton } from "@/components/ui";

type NetWorthHistoryPoint = {
  date: string;
  assets: number;
  liabilities: number;
  netWorth: number;
  liquidNetWorth?: number;
};

export type NetWorthSectionData = {
  current: {
    assets: number;
    liabilities: number;
    netWorth: number;
    liquidNetWorth: number;
  };
  history?: NetWorthHistoryPoint[];
  change?: {
    amount: number;
    percent: number;
    since: string | null;
  };
};

type NetWorthSectionProps = {
  data?: NetWorthSectionData;
};

const money = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);

function MetricCard({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm">
      <div className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-[var(--color-text)]">{value}</div>
      {detail && <div className="mt-1 text-xs text-[var(--color-text-muted)]">{detail}</div>}
    </div>
  );
}

function NetWorthHistory({ history }: { history: NetWorthHistoryPoint[] }) {
  if (!history.length) return null;

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm">
      <div className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">Change History</div>
      <div className="mt-4 space-y-3">
        {history.map((point) => (
          <div
            key={point.date}
            className="flex items-center justify-between gap-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2"
          >
            <div className="min-w-0">
              <div className="text-sm font-medium text-[var(--color-text)]">{point.date}</div>
              <div className="text-xs text-[var(--color-text-muted)]">
                Assets {money(point.assets)} • Liabilities {money(point.liabilities)}
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm font-semibold text-[var(--color-text)]">{money(point.netWorth)}</div>
              {point.liquidNetWorth != null && (
                <div className="text-xs text-[var(--color-text-muted)]">Liquid {money(point.liquidNetWorth)}</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function NetWorthSectionView({ data }: { data: NetWorthSectionData }) {
  const change = data.change;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <MetricCard label="Liquid Net Worth" value={money(data.current.liquidNetWorth)} detail="Cash, bank, and investable balances" />
        <MetricCard label="Total Net Worth" value={money(data.current.netWorth)} detail="Includes manual assets and liabilities" />
        <MetricCard
          label="Net Worth Change"
          value={change ? `${change.amount >= 0 ? "+" : "-"}${money(Math.abs(change.amount))}` : money(0)}
          detail={change?.since ? `Since ${change.since}${change.percent != null ? ` • ${change.percent >= 0 ? "+" : ""}${change.percent.toFixed(1)}%` : ""}` : "No history yet"}
        />
      </div>

      {data.history && data.history.length > 0 && <NetWorthHistory history={data.history} />}
    </div>
  );
}

function NetWorthSectionLoader() {
  const historyQuery = useQuery<{
    current: { assets: number; liabilities: number; netWorth: number };
    history: Array<{ date: string; assets: number; liabilities: number; netWorth: number }>;
    change: { amount: number; percent: number; since: string | null };
  }>({
    queryKey: ["reports", "networth", "history"],
    queryFn: () => api.get("/networth/history").then((r) => r.data),
  });

  if (historyQuery.isLoading) {
    return (
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <Skeleton className="h-4 w-24 mb-3" />
            <Skeleton className="h-7 w-32" />
          </div>
        ))}
      </div>
    );
  }

  if (historyQuery.isError || !historyQuery.data) {
    return (
      <Card>
        <div className="text-sm text-[var(--color-danger)]">Failed to load net worth reporting.</div>
      </Card>
    );
  }

  const resolvedData: NetWorthSectionData = {
    current: {
      assets: historyQuery.data.current.assets,
      liabilities: historyQuery.data.current.liabilities,
      netWorth: historyQuery.data.current.netWorth,
      liquidNetWorth: historyQuery.data.current.assets,
    },
    history: historyQuery.data.history.map((point) => ({
      ...point,
      liquidNetWorth: point.netWorth,
    })),
    change: historyQuery.data.change,
  };

  return <NetWorthSectionView data={resolvedData} />;
}

export function NetWorthSection({ data }: NetWorthSectionProps) {
  if (data) return <NetWorthSectionView data={data} />;
  return <NetWorthSectionLoader />;
}
