import { Card } from "@/components/ui";
import { HandCoins } from "lucide-react";

const money = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);

const forecast = [
  { year: 2026, income: 6240 },
  { year: 2027, income: 6880 },
  { year: 2028, income: 7520 },
];

export function DividendForecastSection() {
  return (
    <Card style={{ padding: "1.25rem" }}>
      <div className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text)]">
        <HandCoins size={16} className="text-[var(--color-accent)]" />
        Dividend Forecast
      </div>
      <div className="mt-4 space-y-3">
        {forecast.map((point) => (
          <div key={point.year} className="flex items-center justify-between rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-3">
            <div className="text-sm font-medium text-[var(--color-text)]">{point.year}</div>
            <div className="text-sm font-semibold text-[var(--color-text)]">{money(point.income)}</div>
          </div>
        ))}
      </div>
      <div className="mt-4 text-xs text-[var(--color-text-muted)]">
        Placeholder projection based on a steady dividend growth assumption until a dedicated forecast endpoint is available.
      </div>
    </Card>
  );
}
