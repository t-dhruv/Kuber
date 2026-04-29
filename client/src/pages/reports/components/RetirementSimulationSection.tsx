import { Card } from "@/components/ui";
import { Radar } from "lucide-react";

const money = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);

const scenarios = [
  { label: "Conservative", success: 91, endingBalance: 1460000 },
  { label: "Base case", success: 78, endingBalance: 1920000 },
  { label: "Growth", success: 64, endingBalance: 2490000 },
];

export function RetirementSimulationSection() {
  return (
    <Card style={{ padding: "1.25rem" }}>
      <div className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text)]">
        <Radar size={16} className="text-[var(--color-accent)]" />
        Retirement Simulation
      </div>
      <div className="mt-4 space-y-3">
        {scenarios.map((scenario) => (
          <div key={scenario.label} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-medium text-[var(--color-text)]">{scenario.label}</div>
                <div className="text-xs text-[var(--color-text-muted)]">Projected terminal balance</div>
              </div>
              <div className="text-right">
                <div className="text-sm font-semibold text-[var(--color-text)]">{scenario.success}%</div>
                <div className="text-xs text-[var(--color-text-muted)]">Success probability</div>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--color-surface-hover)]">
                <div className="h-full rounded-full bg-[var(--color-accent)]" style={{ width: `${scenario.success}%` }} />
              </div>
              <div className="text-xs font-semibold text-[var(--color-text)]">{money(scenario.endingBalance)}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 text-xs text-[var(--color-text-muted)]">
        Placeholder Monte Carlo output showing where a retirement simulator will surface once scenario inputs are connected.
      </div>
    </Card>
  );
}
