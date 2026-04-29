import { Card } from "@/components/ui";
import { BarChart3 } from "lucide-react";

const money = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);

const holdings = [
  { label: "Aggressive ETFs", actual: 58, target: 50, value: 182500 },
  { label: "Bonds", actual: 24, target: 30, value: 75600 },
  { label: "Cash", actual: 18, target: 20, value: 56700 },
];

export function AllocationDriftSection() {
  return (
    <Card style={{ padding: "1.25rem" }}>
      <div className="text-sm font-semibold text-[var(--color-text)]">Allocation & Drift</div>
      <div className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text)]">
        <BarChart3 size={16} className="text-[var(--color-accent)]" />
        Allocation drift overview
      </div>
      <div className="mt-4 space-y-4">
        {holdings.map((holding) => {
          const drift = holding.actual - holding.target;
          return (
            <div key={holding.label} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-medium text-[var(--color-text)]">{holding.label}</div>
                  <div className="text-xs text-[var(--color-text-muted)]">{money(holding.value)}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold text-[var(--color-text)]">{holding.actual}%</div>
                  <div className={`text-xs font-medium ${Math.abs(drift) >= 5 ? "text-[var(--color-warning)]" : "text-[var(--color-text-muted)]"}`}>
                    {drift >= 0 ? "+" : ""}{drift}% vs target {holding.target}%
                  </div>
                </div>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--color-surface-hover)]">
                <div className="h-full rounded-full bg-[var(--color-accent)]" style={{ width: `${holding.actual}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
