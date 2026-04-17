# E2E Coverage & UX Audit — Design Spec
**Date:** 2026-04-17  
**Scope:** Add missing e2e tests for all uncovered routes/features; fix UX issues found during live browser audit.

---

## 1. Context

All 16 existing e2e spec files run in order against a single seeded browser session. They cover the happy-path creation flow for the main features. The audit found:

- **5 routes with zero e2e coverage**
- **Several features within covered routes with no tests**
- **14 UX/polish issues** found during live browser walkthrough

---

## 2. UX Issues Found (browser audit)

### High priority — bugs / broken behaviour

| # | Location | Issue |
|---|----------|-------|
| 1 | All pages | **Onboarding modal re-appears on every page navigation** after clicking X. `localStorage` key `kuber-onboarding-done` is not set when dismissed via the X button, only via "Skip setup" or completing the flow. |
| 2 | Accounts (empty state) | **Account detail panel is open by default with no accounts selected**, showing "Current Balance — · undefined". Phantom open state with no selection. |
| 3 | Accounts (empty state) | **Phantom detail panel intercepts clicks on "Add account" button** — consequence of #2. Clicking the primary CTA does nothing when the panel is erroneously open. |
| 4 | Rules | **`actionLabel` shows raw category ID for `setCategory` actions** — renders "Set category → cm7p3abc..." instead of "Set category → Groceries". `a.value` is a cuid, not a name. Fix: look up category name from the categories query, or store name alongside ID in action. |
| 5 | Advice | **`/api/v1/settings/ai` returns 404** on every Advice page load — console error every visit. Endpoint either doesn't exist or path is wrong. |
| 6 | Import | **Breadcrumb shows "Kuber / Kuber"** instead of "Kuber / Import". |

### Medium priority — confusing UX

| # | Location | Issue |
|---|----------|-------|
| 7 | `/transactions/review` | **Breadcrumb shows "Transactions"** — should show "AI Review". |
| 8 | `/transactions/review` | **Both "Transactions" and "AI Review" are highlighted active in sidebar** simultaneously. Only the deeper match should be active. |
| 9 | `/transactions` | **Date range filter shows raw "yyyy-mm-dd" browser placeholder** — not user-friendly. Should use "Start date / End date" or a proper date-picker. |
| 10 | Investments | **"SIMULATED PERFORMANCE" chart renders with no holdings** — Y-axis goes $0–$4 with a flat line at $0. Should show an empty state until there are actual holdings. |
| 11 | Advice | **Suggestion chips are clickable when AI provider is not configured** — clicking them would silently fail or error. Should be disabled/hidden when unconfigured, showing only the "Go to Settings → AI Advisor" CTA. |
| 12 | Cash Flow | **"APR DETAIL" label reads as Annual Percentage Rate** — should use full month name ("April 2026 Detail") to avoid finance-jargon confusion. |
| 13 | Cash Flow | **Y-axis shows repeating "$0k" at every tick when there's no data** — shows a chart with all identical labels instead of a proper empty state. |
| 14 | Goals | **"Share feedback" button embedded in Goals page header** — out of place in a feature page. Should be in Settings or a global help menu. |

### Low priority — naming/language inconsistencies

| # | Location | Issue |
|---|----------|-------|
| 15 | Budget | "**personalised**" should be "personalized" (British vs American English). |
| 16 | Import | "**Analyse File**" should be "Analyze File". |
| 17 | Budget | **"NON-MONTHLY" label wraps mid-word** to "NON- / MONTHLY" in its cell. Use "Non-Monthly" (title case) which wraps cleanly. |
| 18 | Sidebar vs pages | **Sidebar "Advice" vs page heading "AI Advisor"** — inconsistent naming. Align to "AI Advisor" in both. |
| 19 | Accounts | **Institution subtext under account name shows account name again** when institution is blank — should show account type instead (e.g. "Checking"). |
| 20 | Auth pages | **Authenticated users can visit `/forgot-password` and `/signup`** — no redirect guard; should redirect to `/`. |

---

## 3. Missing E2E Coverage

### 3a. New spec files needed

| File | Route | What to test |
|------|-------|-------------|
| `17-review-queue.spec.ts` | `/transactions/review` | Page loads; empty state; sidebar active state; breadcrumb text; Re-run AI button; (with data) approve / reject / skip a suggestion; create-rule banner prompt |
| `18-cash-flow.spec.ts` | `/cash-flow` | Page loads; Monthly / Quarterly / Yearly tabs switch; year nav arrows; Filters button; empty state message; no JS errors |
| `19-forgot-password.spec.ts` | `/forgot-password` | Page loads; submitting unknown email shows success message (not leaks existence); Back to sign in link works; authenticated user redirected to `/` |
| `20-reset-password.spec.ts` | `/reset-password` | Page loads with `?token=` param; invalid token shows error; valid token allows password reset (requires seeded token or mocked) |
| `21-bulk-import-accounts.spec.ts` | `/accounts/bulk-import` | Page loads; Download Template works; CSV Guide link/modal opens; uploading invalid file shows error; breadcrumb shows correct path |

### 3b. Missing tests in existing spec files

| Spec | Missing coverage |
|------|-----------------|
| `03-transactions.spec.ts` | Split transaction modal (open, fill both splits, save); Duplicate review modal (flag detected, choose import/skip); filter by date range; filter by account |
| `08-rules.spec.ts` | Rule condition with "amount" field (uses numeric operators); rule with "addTag" action; rule prefill from URL (`?prefill=`); edit existing rule; delete rule; reorder rules up/down |
| `09-reports.spec.ts` | Tax Summary tab renders; Benchmarks tab renders; Sankey view toggle in Cash Flow tab |
| `10-import.spec.ts` | Import History tab shows past imports; duplicate detection modal during import |
| `11-settings.spec.ts` | Automation section loads; Webhooks section loads; Report Digest section loads; Tax Accounts section loads; Display theme toggle |
| `13-wealth.spec.ts` | Page renders empty state (no income set) with CTA; entering take-home income unlocks breakdown |
| `15-assets-liabilities.spec.ts` | Assets & Debt tab on Accounts page loads; liability detail panel opens |

---

## 4. Approach

### 4a. UX fixes (code changes)

All fixes are targeted and contained — no rewrites:

- **Issue #1 (modal dismiss):** Find the `onClose` handler triggered by the X button in the onboarding modal; add `localStorage.setItem('kuber-onboarding-done', '1')` there.
- **Issue #2/#3 (phantom detail panel):** In `AccountsPage`, initialize `detailAccount` state to `null` and ensure the panel is only rendered when `detailAccount !== null`.
- **Issue #4 (raw category ID in rule display):** In `actionLabel`, pass `categories` array and look up the name by ID for `setCategory` type.
- **Issue #5 (404 on AI settings):** Check the correct API path; fix the endpoint URL in the Advice page component.
- **Issue #6 (Import breadcrumb "Kuber/Kuber"):** Fix the page title or breadcrumb config for ImportPage.
- **Issues #7/#8 (Review breadcrumb + dual active):** Fix breadcrumb for review route; ensure only the deepest matching nav link is active.
- **Issue #9 (date filter placeholders):** Replace raw `<input type="date">` placeholders with "Start date" / "End date" labels or use `type="text"` with a date picker.
- **Issue #10 (Investments empty chart):** Conditionally hide the chart when `holdings.length === 0`, showing an empty state instead.
- **Issue #11 (Advice chips when unconfigured):** Disable suggestion chips and text input when AI provider is not configured; show only the settings CTA.
- **Issue #12 (APR label):** Replace abbreviated month label with full "Month YYYY Detail" string.
- **Issue #13 (Cash Flow $0k ticks):** Show an empty state card instead of the chart when all values are zero.
- **Issue #14 (Share feedback on Goals):** Move or remove the Share Feedback button from Goals header.
- **Issues #15/#16/#17 (British English):** Replace "personalised"→"personalized", "Analyse"→"Analyze", "NON-MONTHLY"→"Non-Monthly".
- **Issue #18 (Advice naming):** Update sidebar label from "Advice" to "AI Advisor".
- **Issue #19 (Institution fallback):** Show account type name when institution is blank.
- **Issue #20 (auth redirect):** Add a redirect guard to `ForgotPasswordPage` and `SignupPage` that sends authenticated users to `/`.

### 4b. E2E tests

- Follow the pattern of existing specs: numbered file, `test.describe`, `test.beforeEach` navigate + `waitForLoadState('networkidle')`
- Use `waitForToast` helper from `tests/e2e/helpers`
- Tests must pass in CI with a fresh database (no hardcoded IDs)
- Each new spec gets its own number continuing from `16`

---

## 5. Out of Scope

- The missing PWA icon (`pwa-192x192.png`) — asset/infra concern, not code
- Receipt OCR modal — requires external OCR integration to test meaningfully
- Advisor e2e with real AI responses — non-deterministic, keep existing mock-friendly tests
- Reset password e2e — requires email delivery; mark as `test.skip` with a TODO comment

---

## 6. Delivery Order

1. UX bug fixes (issues #1–#8, highest impact)
2. UX polish (issues #9–#20)  
3. New e2e spec files (17–21)
4. Missing coverage in existing specs

Each step is independently mergeable.
