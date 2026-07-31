# Plan 010: Consolidate legacy report wrapper files

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 28cf4a0..HEAD -- server/src/lib/ server/src/routeModules/reports.ts server/src/routes/exports.ts` — if any in-scope file changed, compare against live code before proceeding; on a mismatch, STOP.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: 009 (can be done in parallel)
- **Category**: tech-debt
- **Planned at**: commit `28cf4a0`, 2026-06-19

## Why this matters

Three wrapper files (`reportOverview.ts`, `reportCashFlow.ts`, `reportDiagnostics.ts`) each re-declare types and interfaces matching the canonical `reporting/` module, then delegate to it with a single function call. They add maintenance drag — every signature change must be mirrored in the wrapper — without providing any abstraction value (no caching, no validation, no transformation).

## Current state

`server/src/lib/reportOverview.ts` (24 lines) — wraps `buildReportingOverview` from `./reporting`
`server/src/lib/reportCashFlow.ts` (17 lines) — wraps `buildCashFlowSummary` from `./reporting`
`server/src/lib/reportDiagnostics.ts` (13 lines) — wraps `buildDiagnosticsSummary` from `./reporting`

Importers:
- `server/src/routeModules/reports.ts:7` — imports `buildReportOverview` from `../lib/reportOverview`
- `server/src/routeModules/reports.ts:8` — imports `buildDiagnosticsSummary` from `../lib/reportDiagnostics`
- `server/src/routes/exports.ts:7` — imports `buildCashFlowSummary` from `../lib/reportCashFlow`

## Scope

**In scope**:
- `server/src/lib/reportOverview.ts` — delete
- `server/src/lib/reportCashFlow.ts` — delete
- `server/src/lib/reportDiagnostics.ts` — delete
- `server/src/routeModules/reports.ts` — update imports to point to canonical module
- `server/src/routes/exports.ts` — update imports to point to canonical module

**Out of scope**:
- `server/src/lib/reportInvestments.ts` and `reportRules.ts` — covered by plan 009
- The canonical `reporting/` module

## Steps

### Step 1: Read the importers

Open `server/src/routeModules/reports.ts` and `server/src/routes/exports.ts` to see exactly how each wrapper function is called (function name, argument shape). The canonical module exports may have slightly different function names.

### Step 2: Update routeModules/reports.ts

Change:
```ts
import { buildReportOverview } from '../lib/reportOverview';
import { buildDiagnosticsSummary } from '../lib/reportDiagnostics';
```
To:
```ts
import { buildReportingOverview } from '../lib/reporting';
import { buildDiagnosticsSummary as buildDiagnosticsSummary } from '../lib/reporting';
```

Actually, first check the export names in `server/src/lib/reporting/index.ts` (or wherever the canonical functions live). The wrapper calls `buildReportingOverview(input)` — so the canonical export name is `buildReportingOverview`.

Check the actual function names in the canonical module and update imports accordingly. The wrapper files call:
- `reportOverview.ts` — exports `buildReportOverview`, calls `buildReportingOverview`
- `reportDiagnostics.ts` — exports `buildDiagnosticsSummary`, calls `buildDiagnosticsSummary` (same name, aliased import)
- `reportCashFlow.ts` — exports `buildCashFlowSummary`, calls `buildCashFlowSummary` (same name, aliased import)

Update the two route files to import directly from the canonical module. Use `import { buildReportingOverview } from '../lib/reporting'` (or whatever the exact export names are).

Make sure the function call sites still compile (the wrapper signatures matched the canonical return types, so direct imports should work with the correct function names).

### Step 3: Delete wrapper files

```bash
rm server/src/lib/reportOverview.ts server/src/lib/reportCashFlow.ts server/src/lib/reportDiagnostics.ts
```

### Step 4: Build and test

```bash
npm run build --workspace=server
npm run test --workspace=server -- tests/routes/reports.test.ts tests/routes/exports.test.ts
npm run test --workspace=server
npm run lint --workspace=server
```

## Test plan

- Existing report and export tests cover the behavior. No behavior changes — just import path changes.
- Full test suite run ensures no regression.

## Done criteria

- [ ] `npm run build --workspace=server` exits 0
- [ ] `npm run test --workspace=server` exits 0
- [ ] `npm run lint --workspace=server` exits 0
- [ ] No imports from `../lib/reportOverview`, `../lib/reportCashFlow`, or `../lib/reportDiagnostics` remain in server source
- [ ] The three wrapper files are deleted
- [ ] `plans/README.md` status updated

## STOP conditions

- If the canonical module exports different function names or signatures than the wrappers, report the actual export names found in `server/src/lib/reporting/`.
- If build fails, the import names need adjustment — check the canonical module's actual exports with `grep "^export" server/src/lib/reporting/index.ts`.
