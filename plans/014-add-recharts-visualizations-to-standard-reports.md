# Plan 014: Add Recharts chart visualizations to standard reports

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 28cf4a0..HEAD -- client/src/pages/reports/components/StandardReportPanel.tsx client/src/pages/reports/shared.tsx client/package.json`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Risk**: MEDIUM (UI changes without rendering tests; current tests from Plan 013 provide partial safety net)
- **Depends on**: Plan 013 (characterization tests must pass before this plan begins)
- **Category**: feature/fix
- **Planned at**: commit `28cf4a0`, 2026-06-19

## Why this matters

Standard report charts are currently broken — they render every row as
`Object.entries(row).map(([k, v]) => <td>k: v</td>)`. For 11 standard report
types (Overview, Income vs Expense, Cash Flow, Category, Budget, Tag, Account,
Merchant, Audit, Net Worth, Investment), the chart section shows raw JSON
dumps instead of visualizations. This is the single highest-impact fix in the
reports section, turning an unusable feature into a functional one.

Recharts v2.12+ is already a dependency (used by SpendingTab, CashFlowTab,
Dashboard). No new packages needed.

## Current state

### Chart data shapes from the server

All 11 report types produce charts in `response.charts`, each shaped as:

```ts
{ key: string; title: string; type: "bar"; data: Record<string, unknown>[] }
```

Specific data shapes by report type:

```
Overview (netWorthPeriods):
  { name: string; netWorth: string; assets: string; liabilities: string; income: string; expenses: string }[]

IncomeVsExpense (incomeVsExpense):
  { name: string; income: string; expenses: string }[]

CashFlow (cashFlowPeriods):
  { name: string; inflow: string; outflow: string; netCashFlow: string }[]

Category (categoryTrend / periodBuckets):
  { name: string; spending: string; income: string }[]

Budget (budgetVsActual):
  { name: string; budgeted: string; actualSpent: string }[]

Tag (tagTrend / periodBuckets):
  { name: string; spending: string; income: string }[]

Account (accountComparison / from table rows):
  { id: string; name: string; type: string|null; inflow: string; outflow: string; netChange: string }[]

Merchant (merchantTrend / periodBuckets):
  { name: string; spending: string; income: string }[]

Audit (no chart — data quality report):
  { charts: [] }

NetWorth (netWorthPeriods):
  { name: string; netWorth: string; assets: string; liabilities: string }[]

Investment (investmentChart):
  { name: string; contributed: string; withdrawals: string; currentValue: string; realizedGainLoss: string }[]
```

Note: monetary values come as `string` (formatted via `money()` Decimal → string
conversion on the server). Recharts needs `number` for Y-axis scaling.

### Current rendering (broken)

`StandardReportPanel.tsx` lines 93-99 — the chart section renders as simple
`<table>` row dumps regardless of chart type:

```tsx
{charts.map((chart) => (
  <div key={chart.key} style={{
    overflowX: "auto",
    border: "1px solid #ccc",
    borderRadius: 8, padding: "0.75rem", marginBottom: "0.75rem"
  }}>
    <p style={{ fontWeight: 600, marginBottom: 8 }}>{chart.title}</p>
    <table style={{ width: "100%", fontSize: 12 }}>
      <tbody>
        {chart.data.map((row, i) => (
          <tr key={i}>
            {Object.entries(row).map(([k, v]) => (
              <td key={k}>{k}: {String(v)}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
))}
```

## Commands you will need

| Purpose   | Command                                    | Expected on success |
|-----------|--------------------------------------------|---------------------|
| Install   | `npm install`                              | exit 0              |
| Build     | `npm run build --workspace=@kuber/client`  | exit 0              |
| Tests     | `npm run test --workspace=@kuber/client`   | all pass            |
| Lint      | `npm run lint --workspace=@kuber/client`   | exit 0              |

## Scope

**In scope**:
- `client/src/pages/reports/shared.tsx` — add a helper to convert chart data
  string values to numbers
- `client/src/pages/reports/components/StandardReportPanel.tsx` — replace
  broken chart rendering with Recharts-based rendering

**Out of scope**:
- No changes to server chart type (keep `"bar"`; this plan determines the best
  chart type per report from the client side)
- No CSS color changes (that's Plan 017)
- No new Recharts packages or version bumps

## Git workflow

- Branch: `advisor/014-standard-report-charts`
- Commit message style: `feat: add Recharts visualizations to standard reports`

## Steps

### Step 1: Add chart data normalization helper to shared.tsx

In `client/src/pages/reports/shared.tsx`, add a helper function that converts
chart data string values to numbers for Recharts:

```ts
// Add near line 215 (before KpiCards)
import { useMemo } from "react";

/**
 * Convert chart data string values to numbers for Recharts.
 * Recharts needs numeric values for Y-axis scaling and tooltip formatting.
 * The server sends monetary values as formatted strings (e.g. "$1,234.56").
 * This helper also handles plain number strings from non-monetary chart data.
 */
export function normalizeChartData<T extends Record<string, unknown>>(
  data: T[],
  numericKeys: (keyof T)[],
): (T & Record<string, number | string>)[] {
  return data.map((row) => {
    const normalized = { ...row };
    for (const key of numericKeys) {
      const val = row[key];
      if (typeof val === "string") {
        // Strip currency formatting ($ ,) and parse
        const cleaned = val.replace(/[^0-9.\-]/g, "");
        const parsed = parseFloat(cleaned);
        if (!isNaN(parsed)) {
          (normalized as Record<string, unknown>)[key as string] = parsed;
        }
      }
    }
    return normalized as T & Record<string, number | string>;
  });
}
```

Alternatively, if the server already sends plain decimal strings like
`"1234.56"` (no $ signs), the function simplifies to just `parseFloat(val)`.
Check the actual server output format — examine `server/src/lib/reporting/standard.ts`
`money()` function. If `money()` returns a plain decimal string (no `$`),
then use the simpler parsing.

The `money()` function in `server/src/lib/reporting/standard.ts` returns
`formatMoney()` which likely includes a currency symbol. Check the actual
implementation — if it includes `$`, the regex-based stripping is needed.

Also add a helper to determine the best chart type per report key:

```ts
export type ChartVariant = "bar" | "line" | "donut";

export function suggestChartVariant(
  chartKey: string,
  dataLength: number,
): ChartVariant {
  if (chartKey === "budgetVsActual" || chartKey === "accountComparison") {
    return "bar";
  }
  if (dataLength <= 8) return "bar";
  return "line";
}
```

**Verify**: `npm run build --workspace=@kuber/client` exits 0.

### Step 2: Add chart color helper to shared.tsx

```ts
import { CHART_COLORS } from "./shared";
```

Add a deterministic color picker:

```ts
export function getChartColor(index: number): string {
  return CATEGORICAL_COLORS[index % CATEGORICAL_COLORS.length];
}
```

(Note: `CATEGORICAL_COLORS` and `CHART_COLORS` are already defined in
`shared.tsx`. This plan references them. Plan 017 will replace the hardcoded
hex values with CSS variables.)

**Verify**: `npm run build --workspace=@kuber/client` exits 0.

### Step 3: Replace chart rendering in StandardReportPanel

Replace the inline chart `<table>` dumps (lines 93-99) with:

```tsx
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell,
} from "recharts";
import {
  CHART_COLORS,
  normalizeChartData,
  suggestChartVariant,
} from "../shared";
```

Then replace the chart rendering block:

```tsx
{charts.map((chart, chartIndex) => {
  const variant = suggestChartVariant(chart.key, chart.data.length);
  const numericKeys = chart.data.length > 0
    ? (Object.keys(chart.data[0] as object).filter(k => k !== "name") as string[])
    : [];

  if (chart.data.length === 0) {
    return (
      <Card key={chart.key}>
        <CardHeading>{chart.title}</CardHeading>
        <p className="text-muted-foreground text-sm">No data available for chart.</p>
      </Card>
    );
  }

  const normalizedData = normalizeChartData(chart.data, numericKeys);

  return (
    <Card key={chart.key}>
      <CardHeading>{chart.title}</CardHeading>
      <div className="w-full" style={{ height: 300 }}>
        <ResponsiveContainer width="100%" height="100%">
          {variant === "pie" || variant === "donut" ? (
            <PieChart>
              <Pie
                data={normalizedData}
                dataKey={numericKeys[0] ?? "value"}
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={100}
                innerRadius={variant === "donut" ? 50 : 0}
                label={({ name, value }) => `${name}: ${value}`}
              >
                {normalizedData.map((_, idx) => (
                  <Cell key={`cell-${idx}`} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          ) : variant === "line" ? (
            <LineChart data={normalizedData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              {numericKeys.map((key, idx) => (
                <Line
                  key={key as string}
                  type="monotone"
                  dataKey={key as string}
                  stroke={CHART_COLORS[idx % CHART_COLORS.length]}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              ))}
            </LineChart>
          ) : (
            <BarChart data={normalizedData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              {numericKeys.map((key, idx) => (
                <Bar
                  key={key as string}
                  dataKey={key as string}
                  fill={CHART_COLORS[idx % CHART_COLORS.length]}
                  radius={[4, 4, 0, 0]}
                />
              ))}
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </Card>
  );
})}
```

Note: The component currently imports `Card` and `CardHeading` from `../shared`.
If not, import from `shared.tsx` or `components/ui/Card.tsx`. Check the current
imports before committing — the plan above assumes `Card`/`CardHeading` exist
in `shared.tsx` or that the component has access to similar wrappers.

If `Card`/`CardHeading` are NOT available in the component's scope (they are
probably not imported), wrap the chart in a plain `<div>` with the existing
border style instead — or import the Card component from
`client/src/components/ui/Card.tsx`.

**Detailed import check**: The current `StandardReportPanel.tsx` imports:
- `React`, `useState` from "react"
- `valueLabel` from "../shared" (after Step 1 of this plan)

We need to add imports for:
- Recharts components
- `normalizeChartData`, `suggestChartVariant` from "../shared"
- `CHART_COLORS` from "../shared" (if not already exported)
- `Card`, `CardHeading` from "../shared" or a ui component

Check `shared.tsx` for Card exports. If not, import from
`"../../components/ui/Card"`.

**Verify**: `npm run build --workspace=@kuber/client` exits 0.

### Step 4: Final verification

```bash
npm run build --workspace=@kuber/client
npm run test --workspace=@kuber/client
npm run lint --workspace=@kuber/client
```

All exit 0.

## Test plan

- Existing characterization tests from Plan 013 still pass
- Manual verification: load each of the 11 standard report tabs and confirm
  charts render instead of table dumps
- Unit tests for `normalizeChartData` and `suggestChartVariant` should be added
  (see plan 013 test file pattern)

## Done criteria

- [ ] `npm run build --workspace=@kuber/client` exits 0
- [ ] `npm run test --workspace=@kuber/client` exits 0
- [ ] `npm run lint --workspace=@kuber/client` exits 0
- [ ] All 11 standard report types show Recharts visualizations instead of
      raw data dumps in the chart section
- [ ] Charts gracefully handle empty data arrays with a "No data" message
- [ ] `plans/README.md` status row updated

## STOP conditions

- Plan 013 tests do not pass (must have safety net before UI changes)
- Recharts v2 types are missing from the project — check `node_modules/@types/recharts`
  or the Recharts v2 ESM import path before coding
- The `CHART_COLORS` array in `shared.tsx` has been removed or renamed since
  this plan was written

## Maintenance notes

- When the design system expansion (Plan 017) replaces hardcoded chart colors
  with CSS variables, the `fill` and `stroke` props in these Recharts components
  will need to change from `CHART_COLORS[idx]` to `var(--color-chart-N)`.
- If Recharts v3 is ever adopted, the ESM import paths may change.
- For accessibility, consider adding `role="img"` and `aria-label` to chart
  containers in a follow-up.
