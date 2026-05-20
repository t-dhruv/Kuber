import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, Skeleton } from "@/components/ui";
import { BarChart3 } from "lucide-react";

const money = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);

interface AllocationHolding {
  ticker: string;
  name: string;
  value: number;
  percent: number;
  type: string;
}

interface AllocationData {
  totalValue: number;
  byAssetClass: Array<{ assetClass: string; value: number; percent: number }>;
  holdings: AllocationHolding[];
}

// Target allocation (user-editable in a real app, hardcoded as sensible defaults here)
const TARGET_ALLOCATION: Record<string, number> = {
  "US Stocks": 50,
  "Bonds": 30,
  "International Stocks": 15,
  "Cash": 5,
};

export function AllocationDriftSection() {
  const { data, isLoading, isError } = useQuery<AllocationData>({
    queryKey: ["reports", "investments", "allocation"],
    queryFn: () => api.get("/investments/allocation").then((r) => r.data),
  });

  const driftItems = useMemo(() => {
    if (!data?.byAssetClass) return [];
    return data.byAssetClass.map((item) => {
      const target = TARGET_ALLOCATION[item.assetClass] ?? 0;
      const drift = Math.round((item.percent - target) * 100) / 100;
      return {
        label: item.assetClass,
        actual: item.percent,
        target,
        drift,
        value: item.value,
      };
    });
  }, [data]);

  if (isLoading) {
    return (
      <Card style={{ padding: "1.25rem" }}>
        <Skeleton height={24} width="60%" style={{ marginBottom: "1rem" }} />
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} height={80} width="100%" style={{ marginBottom: "0.75rem" }} />
        ))}
      </Card>
    );
  }

  if (isError || !data) {
    return (
      <Card style={{ padding: "1.25rem" }}>
        <div className="text-sm text-[var(--color-danger)]">
          Failed to load allocation data.
        </div>
      </Card>
    );
  }

  if (driftItems.length === 0) {
    return (
      <Card style={{ padding: "1.25rem" }}>
        <div className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text)]">
          <BarChart3 size={16} className="text-[var(--color-accent)]" />
          Allocation & Drift
        </div>
        <div className="mt-4 text-sm text-[var(--color-text-muted)]">
          No investment holdings found. Add holdings to see allocation drift.
        </div>
      </Card>
    );
  }

  return (
    <Card style={{ padding: "1.25rem" }}>
      <div className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text)]">
        <BarChart3 size={16} className="text-[var(--color-accent)]" />
        Allocation & Drift
      </div>
      <div className="mt-4 space-y-4">
        {driftItems.map((item) => {
          const drift = item.drift;
          const absDrift = Math.abs(drift);
          return (
            <div
              key={item.label}
              className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3"
            >
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-medium text-[var(--color-text)]">
                    {item.label}
                  </div>
                  <div className="text-xs text-[var(--color-text-muted)]">
                    {money(item.value)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold text-[var(--color-text)]">
                    {item.actual}%
                  </div>
                  <div
                    className={`text-xs font-medium ${
                      absDrift >= 5
                        ? "text-[var(--color-warning)]"
                        : "text-[var(--color-text-muted)]"
                    }`}
                  >
                    {drift >= 0 ? "+" : ""}
                    {drift}% vs target {item.target}%
                  </div>
                </div>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--color-surface-hover)]">
                <div
                  className="h-full rounded-full bg-[var(--color-accent)]"
                  style={{ width: `${Math.min(item.actual, 100)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
