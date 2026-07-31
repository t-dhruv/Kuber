# Plan 006: Sanitize CSV export against formula injection

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 28cf4a0..HEAD -- server/src/lib/csvExport.ts` — if in-scope file changed, compare excerpts against live code before proceeding; on a mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `28cf4a0`, 2026-06-19

## Why this matters

The CSV export function `escapeCell` checks for commas, quotes, and newlines but does not sanitize CSV formula injection characters (`=`, `+`, `-`, `@`) at the start of cell values. A user could store a transaction description like `=SUM(A1:A1000)` or `=HYPERLINK(...)` that, when exported and opened in Excel/Google Sheets, executes as a formula. This is a client-side injection vector against any user who downloads and opens the exported CSV.

## Current state

`server/src/lib/csvExport.ts:14-21`:
```ts
function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}
```

No prefix check for `=`, `+`, `-`, `@`. Used by:
- `routeModules/transactions.ts` — transaction CSV export
- `routeModules/reports.ts` — report CSV export
- `routeModules/accounts.ts` — account CSV export
- `routes/exports.ts` — data export

## Steps

### Step 1: Add formula-prefix sanitization

In `server/src/lib/csvExport.ts`, add a check at the beginning of `escapeCell` (after converting to string, before the comma/quote/newline check):

```ts
function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  // Prevent CSV formula injection: prefix =, +, -, @ with a tab
  if (str.length > 0 && ['=', '+', '-', '@'].includes(str[0])) {
    return `\t${str}`;
  }
  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}
```

Note: a tab `\t` before the formula prefix is the standard defense — it breaks formula interpretation in Excel/Sheets while preserving the visible value.

**Verify**: `npm run build --workspace=server` → exit 0

### Step 2: Run existing tests

```bash
npm run test --workspace=server -- tests/
```

All pass.

### Step 3: Lint

```bash
npm run lint --workspace=server
```

## Test plan

- No new test file needed (existing `csvExport` doesn't have dedicated tests — add inline if desired).
- The change is a 4-line addition with no branch changes — existing behavior is preserved.

## Done criteria

- [ ] `npm run build --workspace=server` exits 0
- [ ] `npm run test --workspace=server` exits 0
- [ ] `npm run lint --workspace=server` exits 0
- [ ] `escapeCell` function prefixes cells starting with `=`, `+`, `-`, `@` with `\t`
- [ ] `plans/README.md` status updated

## STOP conditions

- If a test expects the raw formula value without the tab prefix, update the test expectation.

## Maintenance notes

- This is a best-effort defense. Some spreadsheet applications may still interpret formulas despite the tab prefix.
- Consider content-type headers with `text/csv; charset=utf-8` in the route handler as an additional defense layer.
