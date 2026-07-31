# Plan 009: Remove dead code: reportInvestments.ts and reportRules.ts

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 28cf4a0..HEAD -- server/src/lib/` — if any in-scope file changed, compare against live code before proceeding; on a mismatch, STOP.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `28cf4a0`, 2026-06-19

## Why this matters

`reportInvestments.ts` (30 lines, exports `summarizeInvestmentPerformance`) and `reportRules.ts` (37 lines, exports `shouldExcludeFromCashFlow` and `classifyReportTransaction`) have zero importers anywhere in the codebase. They must be maintained, reviewed, and deployed but are never executed. Dead code adds cognitive load and creates false signal for dependency analysis.

## Current state

- `server/src/lib/reportInvestments.ts` — exports `summarizeInvestmentPerformance`, `InvestmentPerformanceInput`, `InvestmentPerformanceSummary`. Grep confirms zero imports.
- `server/src/lib/reportRules.ts` — exports `shouldExcludeFromCashFlow`, `classifyReportTransaction`, `ReportTransactionInput`, `ReportTransactionClassification`. Grep confirms zero imports.

## Scope

**In scope**:
- `server/src/lib/reportInvestments.ts` — delete
- `server/src/lib/reportRules.ts` — delete

**Out of scope**:
- Other wrapper files (`reportOverview.ts`, `reportCashFlow.ts`, `reportDiagnostics.ts`) — these ARE imported (see plan 010)
- `server/src/lib/reporting/` directory (canonical implementations are here)

## Steps

### Step 1: Confirm zero importers

```bash
grep -rn "reportInvestments\|reportRules" server/src/ --include="*.ts"
```

Should show only self-references (the files themselves) and possibly references in `server/tests/`. Confirm zero production imports.

### Step 2: Delete the files

```bash
rm server/src/lib/reportInvestments.ts server/src/lib/reportRules.ts
```

### Step 3: Build and test

```bash
npm run build --workspace=server
npm run test --workspace=server
npm run lint --workspace=server
```

## Test plan

- No test changes needed — the exported functions had no test coverage (they were dead code).

## Done criteria

- [ ] `grep -rn "reportInvestments\|reportRules" server/src/ --include="*.ts"` returns no matches (except possibly test imports)
- [ ] `npm run build --workspace=server` exits 0
- [ ] `npm run test --workspace=server` exits 0
- [ ] `npm run lint --workspace=server` exits 0
- [ ] `plans/README.md` status updated

## STOP conditions

- If build fails with import errors, the files had live importers you missed. Report which files import them and we'll decide whether to inline or skip.
