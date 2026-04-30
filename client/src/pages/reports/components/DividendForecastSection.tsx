import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, Skeleton } from "@/components/ui";
import { HandCoins } from "lucide-react";

const money = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);

interface ForecastPoint {
  year: number;
  income: number;
}

export function DividendForecastSection() {
  const { data, isLoading, isError } = useQuery<{
    forecast: ForecastPoint[];
    basedOn: string;
  }>({
    queryKey: ["reports", "investments", "dividend-forecast"],
    queryFn: () => api.get("/investments/dividend-forecast?years=5").then((r) => r.data),
  });

  if (isLoading) {
    return (
      <Card style={{ padding: "1.25rem" }}>
        <Skeleton height={24} width="60%" style={{ marginBottom: "1rem" }} />
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} height={56} width="100%" style={{ marginBottom: "0.75rem" }} />
        ))}
      </Card>
    );
  }

  if (isError || !data?.forecast) {
    return (
      <Card style={{ padding: "1.25rem" }}>
        <div className="text-sm text-[var(--color-danger)]">
          Failed to load dividend forecast.
        </div>
      </Card>
    );
  }

  if (data.forecast.length === 0) {
    return (
      <Card style={{ padding: "1.25rem" }}>
        <div className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text)]">
          <HandCoins size={16} className="text-[var(--color-accent)]" />
          Dividend Forecast
        </div>
        <div className="mt-4 text-sm text-[var(--color-text-muted)]">
          No dividend-paying holdings found. Add investments to see dividend forecast.
        </div>
      </Card>
    );
  }

  return (
    <Card style={{ padding: "1.25rem" }}>
      <div className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text)]">
        <HandCoins size={16} className="text-[var(--color-accent)]" />
        Dividend Forecast
      </div>
      <div className="mt-4 space-y-3">
        {data.forecast.map((point) => (
          <div
            key={point.year}
            className="flex items-center justify-between rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-3"
          >
            <div className="text-sm font-medium text-[var(--color-text)]">
              {point.year}
            </div>
            <div className="text-sm font-semibold text-[var(--color-text)]">
              {money(point.income)}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 text-xs text-[var(--color-text-muted)]">
        {data.basedOn}
      </div>
    </Card>
  );
}
