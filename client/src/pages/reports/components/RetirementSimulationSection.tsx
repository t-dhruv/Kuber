import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, Skeleton } from "@/components/ui";
import { Radar } from "lucide-react";

const money = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);

interface Scenario {
  label: string;
  endingBalance: number;
  returnRate?: number;
}

export function RetirementSimulationSection() {
  const { data, isLoading, isError } = useQuery<{
    scenarios: Scenario[];
    portfolioValue: number;
    projectionYears?: number;
    note: string;
  }>({
    queryKey: ["reports", "investments", "retirement-simulation"],
    queryFn: () => api.get("/investments/retirement-simulation").then((r) => r.data),
  });

  if (isLoading) {
    return (
      <Card style={{ padding: "1.25rem" }}>
        <Skeleton height={24} width="60%" style={{ marginBottom: "1rem" }} />
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} height={64} width="100%" style={{ marginBottom: "0.75rem" }} />
        ))}
      </Card>
    );
  }

  if (isError || !data?.scenarios) {
    return (
      <Card style={{ padding: "1.25rem" }}>
        <div className="text-sm text-[var(--color-danger)]">
          Failed to load retirement simulation.
        </div>
      </Card>
    );
  }

  if (data.scenarios.length === 0) {
    return (
      <Card style={{ padding: "1.25rem" }}>
        <div className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text)]">
          <Radar size={16} className="text-[var(--color-accent)]" />
          Retirement Simulation
        </div>
        <div className="mt-4 text-sm text-[var(--color-text-muted)]">
          No portfolio data available. Add investments to run retirement simulations.
        </div>
      </Card>
    );
  }

  return (
    <Card style={{ padding: "1.25rem" }}>
      <div className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text)]">
        <Radar size={16} className="text-[var(--color-accent)]" />
        Retirement Simulation
      </div>
      <div className="mt-4 space-y-3">
        {data.scenarios.map((scenario) => (
          <div
            key={scenario.label}
            className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3"
          >
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-medium text-[var(--color-text)]">
                  {scenario.label}
                </div>
                <div className="text-xs text-[var(--color-text-muted)]">
                  Assumed annual return
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-semibold text-[var(--color-text)]">
                  {scenario.returnRate != null
                    ? `${(scenario.returnRate * 100).toFixed(0)}%`
                    : "—"}
                </div>
                <div className="text-xs text-[var(--color-text-muted)]">
                  per year
                </div>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between gap-3">
              <div className="text-xs text-[var(--color-text-muted)]">
                Projected balance after {data.projectionYears ?? 30} years
              </div>
              <div className="text-sm font-semibold text-[var(--color-text)]">
                {money(scenario.endingBalance)}
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 text-xs text-[var(--color-text-muted)]">
        {data.note}
      </div>
    </Card>
  );
}
