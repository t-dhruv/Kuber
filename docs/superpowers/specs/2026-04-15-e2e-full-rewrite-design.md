# E2E Full Rewrite Design

**Date:** 2026-04-15
**Author:** t-dhruv
**Status:** Approved

---

## Goal

Replace all existing Playwright E2E specs with a comprehensive, production-grade test suite that:

1. Creates a fresh user per run (no seed data)
2. Validates cross-feature effects (transaction → balance → budget → reports → dashboard)
3. Covers every major feature area
4. Finds and surfaces real bugs for fixing before production release

---

## AI Advisor Credentials

Provider: **Google Gemini**
Model: `gemma-4-26b-a4b-it` (via generativelanguage API)
API Key: `AIzaSyBV9f1h4yFmyCHHO1m6PLVVUbwgkORo7-Y`
Base URL: `https://generativelanguage.googleapis.com/v1beta`

These credentials are used in `11-settings.spec.ts` to configure the AI Advisor, which is then exercised in `12-advisor.spec.ts`.

---

## Architecture

### Global Setup (`tests/e2e/global-setup.ts`)

- Generate a unique email per run: `e2e+<timestamp>@kuber.test`
- Sign up via `/signup` UI (firstName: "E2E", lastName: "User", householdName: "E2E Household")
- Dismiss onboarding modal via `localStorage.setItem('kuber-onboarding-done', '1')`
- Save auth state to `tests/e2e/.auth/user.json`
- Store the generated email/password in `tests/e2e/.auth/credentials.json` for specs that need to re-login
- No accounts, no transactions — specs create all their own data

### Playwright Config

- `testDir`: `./tests/e2e`
- `workers`: 1 (sequential — shared DB state)
- `fullyParallel`: false
- `storageState`: `tests/e2e/.auth/user.json` (reused across all specs)
- `baseURL`: `http://localhost:9001`
- `retries`: 2 in CI, 0 locally

### Helpers (`tests/e2e/helpers/`)

- `navigation.ts` — typed `goto(page, route)` helper
- `forms.ts` — `fillAndSubmit`, `selectOption`, `waitForToast`
- `api.ts` — direct API calls (for setup/teardown where UI is too slow)
- `assertions.ts` — `assertBalance`, `assertBudgetSpent`, `assertNetWorth`

---

## Spec Files

### `01-auth.spec.ts`

**Creates:** nothing permanent (uses a secondary throw-away account for some tests)

**Tests:**
- Signup with valid data → lands on dashboard
- Signup with duplicate email → shows error
- Login with correct credentials → lands on dashboard
- Login with wrong password → shows error
- Logout → redirected to login, protected routes blocked
- Forgot password flow → email sent confirmation shown
- Session persistence — refresh page stays logged in
- Access protected route without auth → redirected to login

**Cross-feature:** none (baseline)

---

### `02-accounts.spec.ts`

**Creates:**
- "Main Checking" (Checking, $5,000)
- "Main Savings" (Savings, $10,000)

**Tests:**
- Add account via modal → appears in accounts list
- Account balance shown correctly
- Edit account name → updated in list
- Net worth = $15,000 shown on accounts page
- Delete account → removed from list, net worth updates
- Re-create deleted account (for downstream specs)

**Cross-feature assertions:**
- Dashboard net worth widget = $15,000 after both accounts created
- Dashboard account list shows both accounts

---

### `03-transactions.spec.ts`

**Creates:**
- 5 expense transactions on "Main Checking" (groceries, dining, utilities, shopping, transport)
- 2 income transactions on "Main Checking"
- 1 pending transaction
- 1 split transaction (two categories)

**Tests:**
- Add expense → appears in transaction list
- Add income → appears in transaction list
- Transaction list filters: by account, by type (income/expense), by date range, by category
- Edit transaction → updated in list
- Mark as pending → pending badge shown
- Bulk select + delete → removed from list
- Split transaction → two category rows shown

**Cross-feature assertions:**
- "Main Checking" balance updated after each transaction
- Dashboard spending widget reflects new expenses
- Reports > Spending shows the grocery/dining/etc categories

---

### `04-budgets.spec.ts`

**Creates:**
- "Groceries" budget $400/month
- "Dining" budget $200/month
- "Transport" budget $150/month

**Tests:**
- Create budget → appears in budget list with $0 spent
- Budget "spent" reflects transactions added in spec 03
- Edit budget amount → updated
- Over-budget alert shown when spending exceeds limit
- Delete budget → removed

**Cross-feature assertions:**
- Groceries budget "spent" = amount of grocery transactions from spec 03
- Dashboard shows budget summary widget with at least one over/near-budget item

---

### `05-goals.spec.ts`

**Creates:**
- "Emergency Fund" savings goal, target $20,000
- "Car Loan" debt payoff goal, balance $15,000

**Tests:**
- Create savings goal → appears with 0% progress
- Log contribution to Emergency Fund → progress bar updates
- Create debt goal → appears in Pay Down tab
- Edit goal → target amount updates
- Delete goal → removed

**Cross-feature assertions:**
- Dashboard goals widget shows Emergency Fund with correct progress %

---

### `06-recurring.spec.ts`

**Creates:**
- "Netflix" recurring bill, $18/month, due 15th
- "Rent" recurring bill, $2,000/month, due 1st

**Tests:**
- Create recurring bill → appears in recurring list
- Calendar view → bills show on correct dates
- Edit recurring bill amount → updated
- Delete recurring bill → removed from list and calendar

**Cross-feature assertions:**
- Dashboard "upcoming bills" section shows Netflix and Rent
- Reports > Cash Flow Forecast includes recurring bills

---

### `07-investments.spec.ts`

**Creates:**
- Investment account "TFSA Portfolio"
- Holdings: 10 shares AAPL, 5 shares VTI

**Tests:**
- Create investment account → appears in investments page
- Add holdings → portfolio value shown
- Benchmark comparison panel loads (SPY/BND/VTI)
- Monte Carlo projections table renders

**Cross-feature assertions:**
- Net worth on accounts page increases by portfolio value
- Dashboard net worth widget updated

---

### `08-rules.spec.ts`

**Creates:**
- Rule: if merchant contains "Starbucks" → category = "Dining", tag = "coffee"
- Rule: if amount > $500 → tag = "large-purchase"

**Tests:**
- Create rule → appears in rules list
- Add transaction with merchant "Starbucks Coffee" → auto-categorized as Dining
- Add transaction with amount $600 → tagged as large-purchase
- Edit rule condition → updated
- Delete rule → removed

**Cross-feature assertions:**
- Auto-categorized transaction appears correctly in Reports > Spending under Dining
- Budget "Dining" spent amount includes the auto-categorized Starbucks transaction

---

### `09-reports.spec.ts`

**Creates:** no new data — asserts on data from specs 02–08

**Tests:**
- Spending report → all expense categories from spec 03 visible
- Cash flow report → income and expense totals match transactions
- Budget variance report → shows actual vs budget for Groceries/Dining/Transport
- Tax categories report renders
- Export CSV → file downloads
- Export PDF → file downloads
- Saved report views: save a filter combo, reload page, load saved view

**Cross-feature assertions:**
- Spending totals in reports match sum of transactions created in spec 03
- Cash flow forecast includes recurring bills from spec 06

---

### `10-import.spec.ts`

**Creates:** 5 transactions via CSV import into "Main Checking"

**Tests:**
- Upload a valid CSV → column mapping step shown
- Map columns (date, description, amount) → preview shown with 5 rows
- Confirm import → 5 transactions added
- Duplicate detection: re-import same CSV → duplicates flagged, not re-imported
- Invalid CSV (missing required column) → error shown

**Cross-feature assertions:**
- "Main Checking" balance updated after import
- Imported transactions appear in Reports > Spending

---

### `11-settings.spec.ts`

**Tests:**
- Profile: update display name → saved
- Categories: create custom category "Hobbies" → available in transaction form
- Tags: create tag "vacation" → available in transaction form
- Merchants: search existing merchant, edit name
- AI Advisor config: select provider "Google Gemini", enter model `gemma-4-26b-a4b-it`, enter API key, save → success toast
- Notifications: toggle email digest → saved
- 2FA: setup TOTP → QR code shown (don't complete to avoid locking test user)
- Currency: add CAD as secondary currency → fx rates widget loads
- Data Management: delete transactions before a specific date (use a date before any test data)

**Cross-feature assertions:**
- Custom category "Hobbies" appears as option when creating a transaction
- AI Advisor page no longer shows "not configured" nudge after saving Gemini creds

---

### `12-advisor.spec.ts`

**Pre-condition:** Gemini configured in spec 11

**Tests:**
- Navigate to AI Advisor
- Send a message: "Summarize my spending this month"
- Response streams in (tokens visible, cursor blinks)
- Full response received (no error state)
- Conversation persists after page refresh
- Send follow-up: "Which category am I overspending in?"
- Advice Library: open a topic, mark a task complete → persists on refresh

**Cross-feature assertions:**
- AI response references real household data (account/transaction context)

---

### `13-wealth.spec.ts`

**Tests:**
- Wealth Strategy page loads
- Enter annual salary → 50/30/20 buckets calculated
- "Where to Cut" section shows categories over allocation
- Investment Ladder section renders
- AI Coach button triggers advisor chat

**Cross-feature assertions:**
- Bucket totals reflect actual spending from transactions in spec 03
- Sankey chart renders with income → needs/wants/savings → categories

---

### `14-dashboard.spec.ts`

**Tests:**
- Dashboard loads without errors (all widgets render)
- Net worth widget = sum of accounts + investments
- Spending widget shows current month vs last month
- Budget summary widget reflects budgets from spec 04
- Goals widget shows Emergency Fund progress from spec 05
- Upcoming bills shows Netflix + Rent from spec 06
- Weekly recap widget renders
- Dashboard customization: hide a widget → disappears, persists on refresh
- Drag widget to reorder → new order persists on refresh

**Cross-feature assertions:**
- Net worth = checking ($5k) + savings ($10k) + TFSA portfolio + assets - liabilities (accounting for all transactions)

---

### `15-assets-liabilities.spec.ts`

**Creates:**
- Manual asset: "Home" value $400,000
- Manual liability: "Mortgage" balance $320,000

**Tests:**
- Add manual asset → appears in assets list
- Add manual liability → appears in liabilities list
- Net worth breakdown: assets - liabilities shown
- Edit asset value → net worth updates
- Delete liability → net worth updates

**Cross-feature assertions:**
- Dashboard net worth widget updates after adding home + mortgage
- Accounts page net worth chart includes manual assets/liabilities

---

### `16-notifications.spec.ts`

**Tests:**
- Notification bell shows unread count
- Open notification drawer → notifications listed
- Mark one as read → count decreases
- Mark all as read → count = 0
- Notifications include budget-over-limit alert (triggered by over-budget spend in spec 04)

**Cross-feature assertions:**
- Budget over-limit notification exists from spec 04 activity

---

## Cross-Feature Chain Summary

```
Spec 02 creates accounts
  → Spec 03 adds transactions → balance updates
    → Spec 04 budgets show spent amounts
    → Spec 09 reports show spending by category
    → Spec 13 wealth buckets reflect spending
    → Spec 14 dashboard widgets reflect all data
Spec 05 creates goals
  → Spec 14 dashboard goals widget
Spec 06 creates recurring
  → Spec 09 cash flow forecast
  → Spec 14 upcoming bills
Spec 07 creates investments
  → net worth on accounts page + dashboard
Spec 08 creates rules
  → auto-categorizes future transactions
  → budget "spent" includes auto-categorized items
Spec 11 configures Gemini
  → Spec 12 advisor chat works
Spec 15 adds manual assets/liabilities
  → net worth breakdown
  → dashboard net worth widget
Spec 04 budget over-limit
  → Spec 16 notification appears
```

---

## Bug-Finding Strategy

Each spec should:
1. Assert the **exact value** (not just "exists") — e.g., balance = $4,850 not just "balance visible"
2. Check **both** the feature page AND downstream pages after every mutation
3. Test **error states** — invalid input, missing required fields, API errors
4. Test **empty states** — what shows when no data exists yet
5. Reload the page after every create/edit to confirm persistence

---

## Gemini AI Config (for spec 11)

```
Provider: Google Gemini
API Endpoint: https://generativelanguage.googleapis.com/v1beta
Model: gemma-4-26b-a4b-it
API Key: AIzaSyBV9f1h4yFmyCHHO1m6PLVVUbwgkORo7-Y
```
