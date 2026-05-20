import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

interface BenchmarkCategory {
  key: string;
  label: string;
  blsMonthlyAvg: number;
  blsPctOfIncome: number;
  actualTotal: number;
  actualMonthlyAvg: number;
}

export function BenchmarksTab({
  startDate,
  endDate,
}: {
  startDate: string;
  endDate: string;
}) {
  const { data, isLoading, isError } = useQuery<{
    startDate: string;
    endDate: string;
    months: number;
    categories: BenchmarkCategory[];
  }>({
    queryKey: ["reports", "benchmarks", startDate, endDate],
    queryFn: () =>
      api
        .get(`/reports/benchmarks?startDate=${startDate}&endDate=${endDate}`)
        .then((r) => r.data),
  });

  const fmtC = (n: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(n);

  if (isLoading) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "0.75rem",
          padding: "1rem 0",
        }}
      >
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            style={{
              height: "3.5rem",
              borderRadius: "var(--radius-md)",
              background: "var(--color-surface-hover)",
              animation: "pulse 1.5s infinite",
            }}
          />
        ))}
      </div>
    );
  }

  if (isError || !data) {
    return (
      <p
        style={{
          color: "var(--color-danger)",
          fontSize: "0.875rem",
          padding: "1rem 0",
        }}
      >
        Failed to load benchmarks.
      </p>
    );
  }

  const maxMonthly = Math.max(
    ...data.categories.map((c) =>
      Math.max(c.blsMonthlyAvg, c.actualMonthlyAvg),
    ),
    1,
  );

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "1.5rem",
        paddingTop: "1rem",
      }}
    >
      <p
        style={{
          margin: 0,
          fontSize: "0.8125rem",
          color: "var(--color-text-muted)",
        }}
      >
        Comparing your monthly averages ({data.months} month
        {data.months !== 1 ? "s" : ""}) against BLS Consumer Expenditure Survey
        2023 national averages.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        {data.categories.map((cat) => {
          const overBudget = cat.actualMonthlyAvg > cat.blsMonthlyAvg;
          const pct =
            cat.blsMonthlyAvg > 0
              ? ((cat.actualMonthlyAvg - cat.blsMonthlyAvg) /
                  cat.blsMonthlyAvg) *
                100
              : 0;
          return (
            <div
              key={cat.key}
              style={{
                background: "var(--color-surface)",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-lg)",
                padding: "0.875rem 1rem",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  marginBottom: "0.5rem",
                }}
              >
                <span
                  style={{
                    fontWeight: 600,
                    fontSize: "0.875rem",
                    color: "var(--color-text)",
                  }}
                >
                  {cat.label}
                </span>
                <span
                  style={{
                    fontSize: "0.75rem",
                    color: overBudget
                      ? "var(--color-danger)"
                      : "var(--color-success)",
                    fontWeight: 600,
                  }}
                >
                  {cat.actualMonthlyAvg === 0
                    ? "No spending"
                    : overBudget
                      ? `+${Math.round(pct)}% vs avg`
                      : `${Math.round(pct)}% vs avg`}
                </span>
              </div>

              {/* BLS bar */}
              <div style={{ marginBottom: "0.4rem" }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "0.6875rem",
                    color: "var(--color-text-muted)",
                    marginBottom: "0.2rem",
                  }}
                >
                  <span>BLS avg</span>
                  <span>{fmtC(cat.blsMonthlyAvg)}/mo</span>
                </div>
                <div
                  style={{
                    height: "6px",
                    background: "var(--color-border)",
                    borderRadius: "var(--radius-full)",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${(cat.blsMonthlyAvg / maxMonthly) * 100}%`,
                      background: "var(--color-text-muted)",
                      borderRadius: "var(--radius-full)",
                    }}
                  />
                </div>
              </div>

              {/* Actual bar */}
              <div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "0.6875rem",
                    color: "var(--color-text-muted)",
                    marginBottom: "0.2rem",
                  }}
                >
                  <span>You</span>
                  <span>{fmtC(cat.actualMonthlyAvg)}/mo</span>
                </div>
                <div
                  style={{
                    height: "6px",
                    background: "var(--color-border)",
                    borderRadius: "var(--radius-full)",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${(cat.actualMonthlyAvg / maxMonthly) * 100}%`,
                      background: overBudget
                        ? "var(--color-danger)"
                        : "var(--color-success)",
                      borderRadius: "var(--radius-full)",
                    }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <p
        style={{
          margin: 0,
          fontSize: "0.6875rem",
          color: "var(--color-text-muted)",
        }}
      >
        Source: U.S. Bureau of Labor Statistics, Consumer Expenditure Survey
        2023. Averages based on all U.S. consumer units (~$80k avg income).
      </p>
    </div>
  );
}
