# Plan 017: Replace hardcoded chart colors with design system CSS variables

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 28cf4a0..HEAD -- client/src/pages/reports/shared.tsx client/src/pages/reports/components/StandardReportPanel.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (can be done independently or after Plan 014; if Plan
  014 is already done, the color references in the new Recharts code will also
  need updating)
- **Category**: polish
- **Planned at**: commit `28cf4a0`, 2026-06-19

## Why this matters

The `CATEGORICAL_COLORS` array in `shared.tsx` uses hardcoded hex values:

```ts
export const CATEGORICAL_COLORS = ["#E5622A", "#f59e0b", "#6366f1", "#10b981", "#ec4899", "#8b5cf6", "#06b6d4", "#84cc16", "#f97316", "#14b8a6"];
```

The Kuber brand design system (`docs/BRAND.md` §3.5 Chart Palette) defines
chart color tokens as CSS custom properties:

```
--color-chart-1: #E5622A;
--color-chart-2: #f59e0b;
--color-chart-3: #6366f1;
--color-chart-4: #10b981;
--color-chart-5: #ec4899;
--color-chart-6: #8b5cf6;
```

Using CSS variables instead of hardcoded hex means:
1. Theme switching (light/dark) can change chart colors automatically
2. The design system is the single source of truth
3. Tailwind CSS v4 works naturally with CSS variables
4. Users/customizers can override chart colors without touching source code

## Current state

The following color references exist in the reports section:

- `shared.tsx`: `CATEGORICAL_COLORS` array (10 hardcoded hex values)
- `shared.tsx`: `CHART_COLORS` array (may be an alias or separate array)
- `StandardReportPanel.tsx`: Before Plan 014, the chart section doesn't use
  these colors (it renders text tables). After Plan 014, the Recharts code
  uses `CHART_COLORS[idx % CHART_COLORS.length]` for `fill` and `stroke`.

Other chart color consumers in the codebase (not in scope but note:
- `CashFlowTab.tsx` — may use Recharts with hardcoded colors
- `SpendingTab.tsx` — may use Recharts with hardcoded colors
- `Dashboard` — may use Recharts with hardcoded colors

## Plan: Use CSS variable references that Tailwind v4 can resolve

The approach depends on the Tailwind CSS v4 setup. Tailwind v4 resolves
`var(--color-chart-1)` in CSS classes. For Recharts components, we pass
fill/stroke as CSS `var()` strings or as resolved values.

Two approaches:

**Approach A — CSS variable strings (recommended for simplicity)**:
Replace the hardcoded hex array with CSS `var()` function strings:

```ts
export const CATEGORICAL_COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
  "var(--color-chart-6)",
  // Fall back to a generated hue rotation for charts 7+
];
```

Recharts accepts CSS `var()` strings in `fill` and `stroke` props in modern
browsers (the SVG inherits the CSS custom property).

**Approach B — Resolve at render time**:
Use `getComputedStyle` to read the CSS variable values once and pass resolved
hex values to Recharts. More robust but adds complexity.

Choose Approach A unless testing reveals SVG rendering issues with `var()`
strings in Recharts. If all standard report chart keys use ≤6 data series,
the 6 CSS variables are sufficient and no fallback is needed.

## Step: Read all chart keys and their data series counts

Check each report type's `response.charts[0].data[0]` keys to determine the
maximum number of data series needed:

| Report key             | Series keys                 | Count |
|------------------------|-----------------------------|-------|
| netWorthPeriods        | netWorth, assets, liabilities, income, expenses | 5 |
| incomeVsExpense        | income, expenses            | 2     |
| cashFlowPeriods        | inflow, outflow, netCashFlow | 3    |
| categoryTrend          | spending, income            | 2     |
| budgetVsActual         | budgeted, actualSpent       | 2     |
| tagTrend               | spending, income            | 2     |
| accountComparison      | inflow, outflow, netChange  | 3     |
| merchantTrend          | spending, income            | 2     |
| investmentChart        | contributed, withdrawals, currentValue, realizedGainLoss | 4 |

Max series count is 5 (netWorthPeriods). Six CSS variables (`--color-chart-1`
through `--color-chart-6`) are sufficient. No hue rotation fallback needed.

## Commands you will need

| Purpose   | Command                                    | Expected on success |
|-----------|--------------------------------------------|---------------------|
| Build     | `npm run build --workspace=@kuber/client`  | exit 0              |
| Tests     | `npm run test --workspace=@kuber/client`   | all pass            |
| Lint      | `npm run lint --workspace=@kuber/client`   | exit 0              |

## Scope

**In scope**:
- `client/src/pages/reports/shared.tsx` — update `CATEGORICAL_COLORS` and/or
  `CHART_COLORS` to use CSS variable strings instead of hex

**Out of scope**:
- No changes to chart colors in CashFlowTab, SpendingTab, or Dashboard
  (can be done as a follow-up)
- No changes to `docs/BRAND.md` (already defines the chart palette)
- No changes to CSS/theme files (variables already defined)

## Git workflow

- Branch: `advisor/017-design-system-chart-colors`
- Commit message style: `style: replace hardcoded chart colors with CSS custom properties`

## Steps

### Step 1: Update the color arrays

In `client/src/pages/reports/shared.tsx`, locate the chart color definitions
(they may be named `CATEGORICAL_COLORS` and/or `CHART_COLORS`). Replace hex
values with CSS variable strings:

```ts
export const CATEGORICAL_COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
  "var(--color-chart-6)",
];
```

If two arrays exist with the same values (`CATEGORICAL_COLORS` and
`CHART_COLORS`), update both. If they are the same object referenced under
different names, update the underlying array.

If there is a third array `COLORS` or similar, update it too. Check before
editing.

### Step 2: Handle the pie chart `fill` prop

If Plan 014 is already applied, the `<Cell fill={CHART_COLORS[idx]}>` in
StandardReportPanel will automatically use CSS vars. If Plan 014 is not yet
applied, no pie chart code exists yet — this plan only touches the array
definitions.

### Step 3: Update fallback color (if any)

If any code path uses `CATEGORICAL_COLORS.length` to determine the number of
available colors, the length is now 6 instead of 10. Check for such code:

```bash
grep -rn "CATEGORICAL_COLORS\|CHART_COLORS" client/src/pages/reports/
```

If any logic depends on exactly 10 colors (e.g., modulo 10 instead of 6),
also update it. The data series count never exceeds 5, so 6 is sufficient,
but defensive fallback logic should still work correctly.

### Step 4: Verify

```bash
npm run build --workspace=@kuber/client
npm run test --workspace=@kuber/client
npm run lint --workspace=@kuber/client
```

All exit 0.

### Step 5: Visual check (manual)

If running in dev mode, navigate to each standard report tab and confirm
chart colors render correctly. The CSS `var()` function is resolved at render
time by the browser — if colors don't appear, check that:
1. The CSS variables are defined in the app's root stylesheet
2. Recharts SVG elements inherit the variable scope

**If Approach A fails**: Fall back to Approach B — create a resolver:

```ts
export function getChartColor(index: number): string {
  const resolved = getComputedStyle(document.documentElement)
    .getPropertyValue(`--color-chart-${(index % 6) + 1}`)
    .trim();
  return resolved || CATEGORICAL_COLORS_HEX[index % CATEGORICAL_COLORS_HEX.length];
}
```

This requires access to `document` (browser only) and would break SSR/test
environments. Only use Approach B if Approach A proves impossible.

## Test plan

- Existing tests pass (no behavior change)
- If tests import `CATEGORICAL_COLORS` and assert on specific hex values,
  update assertions to assert array length (6) and CSS var prefix

## Done criteria

- [ ] `npm run build --workspace=@kuber/client` exits 0
- [ ] `npm run test --workspace=@kuber/client` exits 0
- [ ] `npm run lint --workspace=@kuber/client` exits 0
- [ ] `CATEGORICAL_COLORS` array contains 6 CSS `var()` entries, not hex values
- [ ] `CHART_COLORS` (if separate) also updated
- [ ] Chart colors change when theme CSS variables change (theme switching)
- [ ] No hardcoded chart hex colors remain in `shared.tsx`
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report if:

- The CSS variables `--color-chart-1` through `--color-chart-6` are not defined
  in the app's CSS. Check `client/src/index.css` or `client/src/styles/` before
  proceeding. If they don't exist, the design system in `docs/BRAND.md` hasn't
  been implemented in CSS yet — this is a pre-existing gap.
- The `CATEGORICAL_COLORS` or `CHART_COLORS` arrays are imported by tests that
  assert specific hex values — these test assertions need updating.
- Plan 014 hasn't been done yet and the new Recharts code would also need
  color reference updates — note this as a merge concern but proceed.

## Maintenance notes

- If more than 6 data series are ever needed (e.g., a chart with 7+ bars),
  add `--color-chart-7` through `--color-chart-N` to the CSS and extend the
  array.
- The CSS variable approach works with light/dark theme switching — dark theme
  can override `--color-chart-1` to a lighter shade and charts will update
  automatically.
- After this plan, do a quick search for hardcoded chart hex values across the
  entire `client/src/pages/reports/` directory to catch any that were missed.
