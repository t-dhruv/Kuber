# Plan 016: Fix currency formatting with cached locale-aware formatter

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 28cf4a0..HEAD -- client/src/pages/reports/shared.tsx`
> If the file changed since this plan was written, compare the "Current state"
> excerpts against the live code before proceeding; on a mismatch, treat it as
> a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: fix
- **Planned at**: commit `28cf4a0`, 2026-06-19

## Why this matters

The `fmtCurrency` and `fmtCurrencySigned` functions in `shared.tsx` hardcode
`"en-US"` locale and `"USD"` currency code:

```ts
export function fmtCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
}

export function fmtCurrencySigned(amount: number): string {
  if (amount === 0) return "—";
  const prefix = amount < 0 ? "" : "+";
  return prefix + new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Math.abs(amount));
}
```

This creates a new `Intl.NumberFormat` instance on every call (no caching) and
ignores the user's configured currency from the server response
(`StandardReportResponse.currencyCode`). The `Math.abs()` in
`fmtCurrencySigned` also swallows the sign for negative amounts, making the
`+` prefix meaningless for expenses.

## Current state

The `StandardReportResponse` type in `standardReportClient.ts` includes
`currencyCode: string` (the user's configured currency, e.g. "EUR", "GBP",
"USD"). The response flows through to `StandardReportPanel.tsx` which renders
summary cards and tables with server-formatted values (`formattedAmount`,
`formattedSpending`, etc.). However, components that call `fmtCurrency` or
`fmtCurrencySigned` directly always format as USD regardless of user settings.

Callers of `fmtCurrency`/`fmtCurrencySigned` within the reports section:
- `KpiCards` in `shared.tsx` (used by standard report summary cards)
- Any table cell rendering that uses local formatting instead of server
  `formatted*` values
- The existing `Overview` legacy tab (if it still uses these functions)

## Fix strategy

1. Create a cached `Intl.NumberFormat` factory function
2. Update `fmtCurrency` and `fmtCurrencySigned` to accept a `currencyCode`
   parameter (defaulting to "USD" for backward compat)
3. Cache formatter instances by locale+currency key

## Commands you will need

| Purpose   | Command                                    | Expected on success |
|-----------|--------------------------------------------|---------------------|
| Build     | `npm run build --workspace=@kuber/client`  | exit 0              |
| Tests     | `npm run test --workspace=@kuber/client`   | all pass            |
| Lint      | `npm run lint --workspace=@kuber/client`   | exit 0              |

## Scope

**In scope**:
- `client/src/pages/reports/shared.tsx` — update `fmtCurrency`,
  `fmtCurrencySigned`, add cache

**Out of scope**:
- No changes to `api.ts` or `currency.ts` in `client/src/lib/` (if a global
  currency formatter exists there, this plan does not consolidate into it)
- No changes to server-side formatting (`server/src/lib/reporting/standard.ts`)
- No changes to components outside the `reports/` directory

## Git workflow

- Branch: `advisor/016-currency-formatting-fix`
- Commit message style: `fix: add cached locale-aware currency formatter with currencyCode param`

## Steps

### Step 1: Add cached formatter factory

In `client/src/pages/reports/shared.tsx`, add before the `fmtCurrency`
function:

```ts
const formatterCache = new Map<string, Intl.NumberFormat>();

function getCurrencyFormatter(currencyCode: string, locale = "en-US"): Intl.NumberFormat {
  const key = `${locale}:${currencyCode}`;
  let formatter = formatterCache.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, { style: "currency", currency: currencyCode });
    formatterCache.set(key, formatter);
  }
  return formatter;
}
```

### Step 2: Update fmtCurrency

```ts
export function fmtCurrency(amount: number, currencyCode?: string): string {
  return getCurrencyFormatter(currencyCode ?? "USD").format(amount);
}
```

### Step 3: Update fmtCurrencySigned

Fix the sign handling — the current implementation uses `Math.abs()` which
always produces a positive `amount`, then prepends `+` for non-negative inputs.
This means negative amounts (expenses) get formatted as positive with no sign.

Correct behavior:
- Positive amounts: `+$1,234.56`
- Negative amounts: `-$1,234.56`
- Zero: `—`

```ts
export function fmtCurrencySigned(amount: number, currencyCode?: string): string {
  if (amount === 0) return "—";
  const formatter = getCurrencyFormatter(currencyCode ?? "USD");
  return (amount > 0 ? "+" : "") + formatter.format(amount);
}
```

Note: `formatter.format(amount)` already handles the sign for negative values
(e.g., `-$1,234.56`). The `+` prefix is only needed for positive values.

### Step 4: Update callers

Search for all calls to `fmtCurrency` and `fmtCurrencySigned` in the reports
directory:

```bash
grep -rn "fmtCurrency\|fmtCurrencySigned" client/src/pages/reports/
```

For each callsite that has access to a `currencyCode` prop or variable, pass
it as the second argument. The `KpiCards` component receives individual card
objects — check if `currencyCode` is available in that scope. If it is passed
via props from `StandardReportPanel`, thread it through.

Update `KpiCards` to accept an optional `currencyCode` prop:

```tsx
interface KpiCardsProps {
  cards: SummaryCard[];
  currencyCode?: string;
  onDrilldown?: (params: Record<string, string>) => void;
}
```

Then in the rendering, pass `currencyCode` when calling `valueLabel` (which
delegates to `fmtCurrency` for monetary cards). Actually, check whether
`KpiCards` uses `fmtCurrency` or `fmtCurrencySigned` directly — if the cards
already come pre-formatted from the server (via `formattedValue`), then the
client-side formatter is only used as a fallback.

Review the `KpiCards` implementation before making changes. If cards display
`value` using server `formattedValue` field, then `fmtCurrency` is not called
for monetary cards. If it falls back to `fmtCurrency` for non-monetary values,
the currency parameter might not be needed.

### Step 5: Verify

```bash
npm run build --workspace=@kuber/client
npm run test --workspace=@kuber/client
npm run lint --workspace=@kuber/client
```

All exit 0.

### Step 6: Add unit tests

Append to `client/tests/pages/reports/shared.test.ts` (or create if it doesn't
exist):

```ts
import { describe, expect, it } from "vitest";
import { fmtCurrency, fmtCurrencySigned } from "../../../src/pages/reports/shared";

describe("fmtCurrency", () => {
  it("formats with default USD", () => {
    const result = fmtCurrency(1234.56);
    expect(result).toBe("$1,234.56");
  });

  it("formats with specified currency code", () => {
    const result = fmtCurrency(1000, "EUR");
    expect(result).toContain("€");
  });

  it("formats zero", () => {
    expect(fmtCurrency(0)).toBe("$0.00");
  });

  it("formats negative values correctly", () => {
    const result = fmtCurrency(-500);
    expect(result).toBe("-$500.00");
  });
});

describe("fmtCurrencySigned", () => {
  it("returns em dash for zero", () => {
    expect(fmtCurrencySigned(0)).toBe("—");
  });

  it("adds plus prefix for positive", () => {
    const result = fmtCurrencySigned(1000);
    expect(result).toBe("+$1,000.00");
  });

  it("does not add plus for negative", () => {
    const result = fmtCurrencySigned(-500);
    expect(result).toBe("-$500.00");
  });
});
```

**Verify**: `npm run test --workspace=@kuber/client` exits 0.

## Done criteria

- [ ] `npm run build --workspace=@kuber/client` exits 0
- [ ] `npm run test --workspace=@kuber/client` exits 0
- [ ] `npm run lint --workspace=@kuber/client` exits 0
- [ ] All monetary values in reports use the user's configured currency
- [ ] `fmtCurrencySigned` correctly shows negative amounts with `-$` prefix
- [ ] `Intl.NumberFormat` instances are cached (no recreation on every render)
- [ ] Unit tests cover default USD, alternate currency, zero, negative, signed
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report if:

- The `StandardReportResponse.currencyCode` field is not available in the
  rendering scope of `KpiCards` or table cells — threading it through the
  component tree may require prop drilling beyond the scope of this plan.
- The test file `client/tests/pages/reports/shared.test.ts` already exists with
  conflicting test names — append to it or create a sibling file.

## Maintenance notes

- The `formatterCache` Map grows by at most one entry per unique
  `(locale, currencyCode)` pair. For a single-user app with 1-2 currencies
  this is negligible.
- If the app ever supports multiple locales (not just en-US), the cache key
  should use the user's locale from auth context or browser detection.
- Consider moving this cached formatter to `client/src/lib/currency.ts` in a
  follow-up if other parts of the app need it.
