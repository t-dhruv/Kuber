# Plan 013: Add characterization tests for StandardReportPanel

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 28cf4a0..HEAD -- client/src/pages/reports/components/StandardReportPanel.tsx client/src/pages/reports/standardReportClient.ts client/vitest.config.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `28cf4a0`, 2026-06-19

## Why this matters

StandardReportPanel is the primary UI component for all 11 standard report
types (Overview, Income vs Expense, Cash Flow, Category, Budget, Tag, Account,
Merchant, Audit, Net Worth, Investment). It has zero test coverage — no
characterization tests, no regression tests. Every data shape (summaryCards,
charts, tables, metadata, drilldown) is rendered without a safety net. Adding
tests now means the chart-rendering fix (Plan 014) can proceed with confidence
that the refactor doesn't break existing behavior.

## Current state

`client/src/pages/reports/components/StandardReportPanel.tsx` (215 lines) is
the sole rendering component for standard reports:

```ts
// Line 34-37: the only pure function in the component
function valueLabel(value: unknown): string {
  if (value == null) return "";
  return String(value);
}
```

The component receives `StandardReportResponse` from the API and renders four
sections: summaryCards, charts (currently broken — see Plan 014), tables, and
drilldown panel. The `StandardReportResponse` and `StandardReportFilters` types
are defined in `standardReportClient.ts`.

Existing client tests in this repo follow a pure-logic pattern — they test
extracted helper functions, not React rendering (the vitest config uses
`environment: "node"`, not `jsdom`). See exemplars:
- `client/tests/pages/reports/standardReportClient.test.ts` — tests API client helpers
- `client/tests/pages/dashboard/DashboardPage.test.tsx` — tests extracted helpers
- `client/tests/pages/reports/ReportsPage.monthlytrend.test.tsx` — tests extracted helpers

The coverage config in `client/vitest.config.ts` already includes
`"src/pages/reports/dateRange.ts"` but not the StandardReportPanel.

## Commands you will need

| Purpose   | Command                                    | Expected on success |
|-----------|--------------------------------------------|---------------------|
| Install   | `npm install`                              | exit 0              |
| Build     | `npm run build --workspace=@kuber/client`  | exit 0              |
| Tests     | `npm run test --workspace=@kuber/client -- tests/pages/reports/components/` | all pass |
| Lint      | `npm run lint --workspace=@kuber/client`   | exit 0              |

## Scope

**In scope**:
- `client/src/pages/reports/components/StandardReportPanel.tsx` — extract `valueLabel` and add unit tests
- `client/tests/pages/reports/components/StandardReportPanel.test.ts` — create
- `client/vitest.config.ts` — add coverage include for the new test target

**Out of scope**:
- No changes to the component's rendering logic (that's Plan 014)
- No changes to the vitest environment (keep `environment: "node"`)
- No component rendering tests (would require `jsdom` setup)

## Git workflow

- Branch: `advisor/013-standard-report-panel-tests`
- Commit message style: `test: add StandardReportPanel characterization tests`

## Steps

### Step 1: Extract valueLabel and the data-filtering helpers

In `StandardReportPanel.tsx`, extract `valueLabel` as a named export so it can
be tested directly. Also extract the drilldown param builder logic from the
inline arrow function at line 169 into a named exported function:

```ts
// Add near line 34, after the imports
export function valueLabel(value: unknown): string {
  if (value == null) return "";
  return String(value);
}

export function buildDrilldownParams(
  tableKey: string,
  rowId: string,
): Record<string, string> {
  if (tableKey.includes("merchant")) return { merchantId: rowId };
  if (tableKey.includes("tag")) return { tagId: rowId };
  if (tableKey.includes("account")) return { accountId: rowId };
  if (tableKey.includes("budget")) return { budgetId: rowId };
  return { categoryId: rowId };
}
```

Update the inline callsite:
- Change `import { valueLabel }` from `"../shared"` to local import (remove from shared if it's there, otherwise just use the local export).

Actually check: `valueLabel` is only defined in this file as a function. The
imports list does NOT include it from shared. So just add `export` before
`function valueLabel`.

For the drilldown params, replace the inline object at line 169:
```ts
// Before:
onClick={() => setDrilldown({ label: valueLabel(row.name ?? row.label ?? table.title), params: table.key.includes("merchant") ? { merchantId: String(row.id) } : table.key.includes("tag") ? { tagId: String(row.id) } : table.key.includes("account") ? { accountId: String(row.id) } : table.key.includes("budget") ? { budgetId: String(row.id) } : { categoryId: String(row.id) } })}

// After:
onClick={() => setDrilldown({
  label: valueLabel(row.name ?? row.label ?? table.title),
  params: buildDrilldownParams(table.key, String(row.id)),
})}
```

**Verify**: `npm run build --workspace=@kuber/client` exits 0.

### Step 2: Create the test file

Create `client/tests/pages/reports/components/StandardReportPanel.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { valueLabel, buildDrilldownParams } from "../../../../src/pages/reports/components/StandardReportPanel";

describe("StandardReportPanel helpers", () => {
  describe("valueLabel", () => {
    it("returns empty string for null", () => {
      expect(valueLabel(null)).toBe("");
    });

    it("returns empty string for undefined", () => {
      expect(valueLabel(undefined)).toBe("");
    });

    it("converts numbers to strings", () => {
      expect(valueLabel(5000.25)).toBe("5000.25");
    });

    it("converts strings as-is", () => {
      expect(valueLabel("Groceries")).toBe("Groceries");
    });

    it("handles zero", () => {
      expect(valueLabel(0)).toBe("0");
    });
  });

  describe("buildDrilldownParams", () => {
    it("maps merchant table keys to merchantId", () => {
      expect(buildDrilldownParams("merchantTotals", "m-1")).toEqual({ merchantId: "m-1" });
    });

    it("maps tag table keys to tagId", () => {
      expect(buildDrilldownParams("tagTotals", "t-1")).toEqual({ tagId: "t-1" });
    });

    it("maps account table keys to accountId", () => {
      expect(buildDrilldownParams("accountMovement", "a-1")).toEqual({ accountId: "a-1" });
    });

    it("maps budget table keys to budgetId", () => {
      expect(buildDrilldownParams("budgetUtilization", "b-1")).toEqual({ budgetId: "b-1" });
    });

    it("defaults to categoryId for unknown keys", () => {
      expect(buildDrilldownParams("unknownKey", "x-1")).toEqual({ categoryId: "x-1" });
    });
  });
});
```

**Verify**: `npm run test --workspace=@kuber/client -- tests/pages/reports/components/StandardReportPanel.test.ts`
→ expect 10 passing tests.

### Step 3: Update vitest coverage config

In `client/vitest.config.ts`, add the StandardReportPanel component to the
coverage include list:

```ts
include: [
  "src/pages/recurring/frequency.ts",
  "src/pages/reports/dateRange.ts",
  "src/pages/reports/components/StandardReportPanel.tsx",  // add this
  "src/stores/authStore.ts",
],
```

**Verify**: `npm run test --workspace=@kuber/client` exits 0 and includes
StandardReportPanel in coverage output.

### Step 4: Final verification

```bash
npm run build --workspace=@kuber/client
npm run test --workspace=@kuber/client
npm run lint --workspace=@kuber/client
```

All exit 0.

## Test plan

- 10 unit tests across two functions (`valueLabel`, `buildDrilldownParams`)
- Tests follow the existing pure-logic pattern from `standardReportClient.test.ts`
- No component rendering tests (out of scope)

## Done criteria

- [ ] `npm run build --workspace=@kuber/client` exits 0
- [ ] `npm run test --workspace=@kuber/client` exits 0; 10+ new tests pass
- [ ] `npm run lint --workspace=@kuber/client` exits 0
- [ ] `grep "valueLabel\|buildDrilldownParams" client/tests/pages/reports/components/StandardReportPanel.test.ts` shows test definitions
- [ ] Coverage report includes `StandardReportPanel.tsx`
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The function signatures in the live `StandardReportPanel.tsx` differ from the excerpts above (the file has drifted since this plan was written).
- The build fails after extracting the helpers — the `export` keyword may need different placement.
- Tests fail for reasons other than expected assertion failures — don't debug the vitest config.

## Maintenance notes

- When the chart rendering fix (Plan 014) adds new UI logic to StandardReportPanel,
  extract new helpers into the same test file pattern.
- If the vitest environment is ever changed to `jsdom`, add component rendering
  tests for loading, error, and empty states.
