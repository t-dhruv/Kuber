# Kuber Regression Test Scenarios
**Version:** 1.0
**Created:** 2026-03-31
**Based on:** QA Report v1.0 + Playwright specs 01–23

---

## How to Use

### Running the Full Suite
```bash
cd C:\_Code\_selfHosted\Kuber
npx playwright test --reporter=list
```

### Running a Specific Module
```bash
npx playwright test tests/e2e/01-auth.spec.ts
```

### Running by Tag (when @smoke tags are added)
```bash
npm run test:smoke
```

### Manual Regression
For manual testing, follow each scenario's Steps and verify Expected Result.
Assign severity based on impact: CRITICAL > HIGH > MEDIUM > LOW.

---

## Scenario Catalogue

---

### AUTH — Authentication & Registration

**AUTH-001**
- **Title:** Login with valid credentials
- **Preconditions:** App running, demo@kuber.app account exists
- **Steps:** Navigate to /login, enter demo@kuber.app / password123, click Sign In
- **Expected:** Redirect to /, Dashboard heading visible
- **Automation:** 01-auth.spec.ts › 1.1

**AUTH-002**
- **Title:** Login with wrong password shows error
- **Preconditions:** App running
- **Steps:** Navigate to /login, enter demo@kuber.app / wrongpassword, click Sign In
- **Expected:** Stay on /login, error message visible
- **Automation:** 01-auth.spec.ts › 1.2

**AUTH-003**
- **Title:** Empty form prevents submission
- **Preconditions:** App running
- **Steps:** Navigate to /login, leave fields empty, attempt submit
- **Expected:** Button disabled or validation messages shown, no redirect
- **Automation:** 01-auth.spec.ts › 1.3

**AUTH-004**
- **Title:** Logout redirects to login
- **Preconditions:** Logged in as demo user
- **Steps:** Click avatar, click Sign Out
- **Expected:** Redirect to /login
- **Automation:** 01-auth.spec.ts › 1.4

**AUTH-005**
- **Title:** Unauthenticated access to protected routes
- **Preconditions:** Not logged in
- **Steps:** Navigate directly to /, /accounts, /settings
- **Expected:** Redirect to /login
- **Automation:** 01-auth.spec.ts › 1.5–1.7

**AUTH-006**
- **Title:** Post-login visit to /login redirects away
- **Preconditions:** Logged in
- **Steps:** Navigate to /login
- **Expected:** Redirect to / (dashboard)
- **Automation:** 01-auth.spec.ts › 1.8

**AUTH-007**
- **Title:** Register new account
- **Preconditions:** Unique email not already registered
- **Steps:** Navigate to /signup, fill first name, last name, unique email, password, submit
- **Expected:** Redirect to /, dashboard loaded
- **Automation:** 01-auth.spec.ts › 1.9

**AUTH-008**
- **Title:** Register with duplicate email fails
- **Preconditions:** demo@kuber.app already registered
- **Steps:** Try to register with demo@kuber.app
- **Expected:** Error shown, stay on signup page
- **Automation:** 01-auth.spec.ts › 1.10

**AUTH-009**
- **Title:** Register with short password fails
- **Preconditions:** App running
- **Steps:** Try to register with password "123"
- **Expected:** Validation error about password length
- **Automation:** 01-auth.spec.ts › 1.11

**AUTH-010**
- **Title:** Forgot password page loads and submits
- **Preconditions:** App running
- **Steps:** Navigate to /forgot-password, enter email, submit
- **Expected:** Confirmation message shown (no crash)
- **Automation:** 01-auth.spec.ts › 1.12

---

### ACCOUNT — Account Management

**ACCOUNT-001**
- **Title:** Accounts page loads grouped by type
- **Preconditions:** Logged in, seeded accounts exist
- **Steps:** Navigate to /accounts
- **Expected:** Accounts grouped (Checking, Savings, etc.) with balances
- **Automation:** 02-accounts.spec.ts › 2.1

**ACCOUNT-002**
- **Title:** Create a new checking account
- **Preconditions:** Logged in
- **Steps:** Click Add Account, fill name / type / balance, save
- **Expected:** New account appears in list with correct balance
- **Automation:** 02-accounts.spec.ts › 2.2

**ACCOUNT-003**
- **Title:** Edit account name
- **Preconditions:** Logged in, at least one account exists
- **Steps:** Click edit on an account, change name, save
- **Expected:** Account shows updated name
- **Automation:** 02-accounts.spec.ts › 2.3

**ACCOUNT-004**
- **Title:** Account balance is displayed
- **Preconditions:** Logged in
- **Steps:** Navigate to /accounts
- **Expected:** Dollar amounts visible next to accounts
- **Automation:** 02-accounts.spec.ts › 2.4

**ACCOUNT-005**
- **Title:** Account institution name or last four digits shown
- **Preconditions:** Logged in, seeded accounts with institution data
- **Steps:** Navigate to /accounts
- **Expected:** Institution name or •••XXXX visible
- **Automation:** 02-accounts.spec.ts › 2.5

**ACCOUNT-006**
- **Title:** Delete account
- **Preconditions:** Logged in, at least one account exists
- **Steps:** Create a test account, delete it via UI
- **Expected:** Account removed from list
- **Automation:** 02-accounts.spec.ts › 2.6

**ACCOUNT-007**
- **Title:** Net worth history endpoint works
- **Preconditions:** Logged in
- **Steps:** `GET /api/v1/networth/history`
- **Expected:** 200, array of { date, value } objects
- **Automation:** Manual API test

---

### TXN — Transactions

**TXN-001**
- **Title:** Transactions page loads with date-grouped list
- **Preconditions:** Logged in, seeded transactions
- **Steps:** Navigate to /transactions
- **Expected:** Transactions listed, grouped by date
- **Automation:** 03-transactions.spec.ts › 3.1

**TXN-002**
- **Title:** Search by merchant name filters list
- **Preconditions:** Logged in, seeded transactions with Starbucks
- **Steps:** Type "Starbucks" in search box
- **Expected:** Only Starbucks transactions shown
- **Automation:** 03-transactions.spec.ts › 3.2

**TXN-003**
- **Title:** Filter by Expense type shows only negatives
- **Preconditions:** Logged in
- **Steps:** Open filter panel, select Expense, apply
- **Expected:** All shown amounts are negative/red
- **Automation:** 03-transactions.spec.ts › 3.3

**TXN-004**
- **Title:** Filter by Income type shows only positives
- **Preconditions:** Logged in
- **Steps:** Open filter panel, select Income, apply
- **Expected:** All shown amounts are positive/green
- **Automation:** 03-transactions.spec.ts › 3.4

**TXN-005**
- **Title:** Filter panel opens and closes
- **Preconditions:** Logged in
- **Steps:** Click filter button, verify panel opens, click again
- **Expected:** Panel toggles open/closed
- **Automation:** 03-transactions.spec.ts › 3.5

**TXN-006**
- **Title:** Date range filter narrows results
- **Preconditions:** Logged in
- **Steps:** Set from/to date range to 1 week, apply
- **Expected:** Only transactions within range shown
- **Automation:** 03-transactions.spec.ts › 3.6

**TXN-007**
- **Title:** Pagination — navigate to page 2
- **Preconditions:** Logged in, >25 transactions
- **Steps:** Click next page button
- **Expected:** Second page of transactions loaded
- **Automation:** 03-transactions.spec.ts › 3.7

**TXN-008**
- **Title:** Create a new transaction
- **Preconditions:** Logged in, at least one account
- **Steps:** Click Add, fill merchant/amount/date/account, save
- **Expected:** Transaction appears in list
- **Automation:** 03-transactions.spec.ts › 3.8

**TXN-009**
- **Title:** Edit transaction — drawer opens with pre-filled data
- **Preconditions:** Logged in, transaction exists
- **Steps:** Click on a transaction
- **Expected:** Edit drawer opens with merchant/amount pre-filled
- **Automation:** 03-transactions.spec.ts › 3.9

**TXN-010**
- **Title:** Edit transaction — change merchant and save
- **Preconditions:** Logged in, transaction exists
- **Steps:** Open edit drawer, change merchant name, save
- **Expected:** Transaction shows new merchant name
- **Automation:** 03-transactions.spec.ts › 3.10

**TXN-011**
- **Title:** Mark transaction as Needs Review
- **Preconditions:** Logged in
- **Steps:** Open edit drawer, toggle Needs Review, save
- **Expected:** Review badge appears on transaction
- **Automation:** 03-transactions.spec.ts › 3.11

**TXN-012**
- **Title:** Mark transaction as Recurring
- **Preconditions:** Logged in
- **Steps:** Open edit drawer, toggle Is Recurring, save
- **Expected:** Recurring indicator appears
- **Automation:** 03-transactions.spec.ts › 3.12

**TXN-013**
- **Title:** Add a tag to a transaction
- **Preconditions:** Logged in, at least one tag exists
- **Steps:** Open edit drawer, type a tag, save
- **Expected:** Tag badge appears on transaction
- **Automation:** 03-transactions.spec.ts › 3.13

**TXN-014**
- **Title:** Delete transaction removes it from list
- **Preconditions:** Logged in, deletable transaction exists
- **Steps:** Open edit drawer, click Delete
- **Expected:** Transaction removed from list (soft-deleted)
- **Automation:** 03-transactions.spec.ts › 3.14

**TXN-015**
- **Title:** Split transaction modal opens
- **Preconditions:** Logged in
- **Steps:** Open edit drawer, click Split
- **Expected:** Split modal appears with amount fields
- **Automation:** 03-transactions.spec.ts › 3.15

**TXN-016**
- **Title:** Export transactions as CSV
- **Preconditions:** Logged in
- **Steps:** `GET /api/v1/transactions/export/csv`
- **Expected:** 200, CSV content-type
- **Automation:** Manual API test

**TXN-017**
- **Title:** Duplicates endpoint returns grouped duplicates
- **Preconditions:** Logged in
- **Steps:** `GET /api/v1/transactions/duplicates`
- **Expected:** 200, `{ count: N, groups: [...] }`
- **Automation:** 20-duplicate-detection.spec.ts › 20.6

---

### BUDGET — Budget Management

**BUDGET-001**
- **Title:** Budgets page loads with existing budgets
- **Preconditions:** Logged in, seeded budgets
- **Steps:** Navigate to /budget
- **Expected:** Budget items listed with progress bars
- **Automation:** 05-budgets.spec.ts

**BUDGET-002**
- **Title:** Create a new category budget
- **Preconditions:** Logged in, category exists
- **Steps:** Click Add Budget, select category, enter amount, save
- **Expected:** New budget appears in list with 0% progress
- **Automation:** 05-budgets.spec.ts

**BUDGET-003**
- **Title:** Budget progress bar fills as spending increases
- **Preconditions:** Budget exists with transactions in same category
- **Steps:** Navigate to /budget
- **Expected:** Budget bar shows non-zero progress matching category spending
- **Automation:** Manual

**BUDGET-004**
- **Title:** Delete a budget
- **Preconditions:** Budget exists
- **Steps:** Click delete on a budget item, confirm
- **Expected:** Budget removed from list
- **Automation:** 05-budgets.spec.ts

**BUDGET-005**
- **Title:** Over-budget indicator shows when spending exceeds budget
- **Preconditions:** Budget exists, spending > budget amount
- **Steps:** Navigate to /budget
- **Expected:** Over-budget visual indicator (red bar or warning)
- **Automation:** Manual

---

### GOAL — Financial Goals

**GOAL-001**
- **Title:** Goals page loads with existing goals
- **Preconditions:** Logged in, seeded goals
- **Steps:** Navigate to /goals
- **Expected:** Goals listed with progress and target amounts
- **Automation:** 06-goals.spec.ts

**GOAL-002**
- **Title:** Create a new savings goal
- **Preconditions:** Logged in
- **Steps:** Click Add Goal, fill name / target amount / date / type=savings, save
- **Expected:** New goal appears in list
- **Automation:** 06-goals.spec.ts

**GOAL-003**
- **Title:** Edit goal target amount
- **Preconditions:** Goal exists
- **Steps:** Click edit on a goal, change target amount, save
- **Expected:** Goal shows updated target amount
- **Automation:** 06-goals.spec.ts

**GOAL-004**
- **Title:** Delete a goal
- **Preconditions:** Goal exists
- **Steps:** Click delete on goal, confirm
- **Expected:** Goal removed from list
- **Automation:** 06-goals.spec.ts

---

### RECURRING — Recurring Transactions

**RECURRING-001**
- **Title:** Recurring page loads with subscriptions list
- **Preconditions:** Logged in, seeded recurring items
- **Steps:** Navigate to /recurring
- **Expected:** Recurring transactions listed with frequency and next date
- **Automation:** 07-recurring.spec.ts

**RECURRING-002**
- **Title:** Create a new recurring transaction
- **Preconditions:** Logged in, account and category exist
- **Steps:** Click Add, fill description/amount/frequency/account, save
- **Expected:** New recurring item appears in list
- **Automation:** 07-recurring.spec.ts

**RECURRING-003**
- **Title:** Edit recurring transaction amount
- **Preconditions:** Recurring item exists
- **Steps:** Click edit, change amount, save
- **Expected:** Updated amount shown
- **Automation:** 07-recurring.spec.ts

**RECURRING-004**
- **Title:** Delete a recurring transaction
- **Preconditions:** Recurring item exists
- **Steps:** Click delete, confirm
- **Expected:** Item removed from list
- **Automation:** 07-recurring.spec.ts

---

### INVEST — Investment Holdings

**INVEST-001**
- **Title:** Investments page loads with portfolio summary
- **Preconditions:** Logged in, seeded investment holdings
- **Steps:** Navigate to /investments
- **Expected:** Holdings listed with tickers, shares, current value
- **Automation:** 08-investments.spec.ts

**INVEST-002**
- **Title:** Portfolio total is calculated correctly
- **Preconditions:** Holdings with current prices
- **Steps:** Navigate to /investments
- **Expected:** Total portfolio value = sum(shares × price) across all holdings
- **Automation:** 08-investments.spec.ts › 8.3

**INVEST-003**
- **Title:** Add a new holding
- **Preconditions:** Investment account exists
- **Steps:** Click Add Holding, enter ticker/shares/cost basis, save
- **Expected:** New holding appears with calculated value
- **Automation:** 08-investments.spec.ts › 8.4

**INVEST-004**
- **Title:** Holdings allocation chart is shown
- **Preconditions:** Multiple holdings
- **Steps:** Navigate to /investments, look for allocation section
- **Expected:** Pie chart or allocation table visible
- **Automation:** Manual

**INVEST-005**
- **Title:** API — holdings endpoint returns list
- **Preconditions:** Logged in
- **Steps:** `GET /api/v1/investments/holdings`
- **Expected:** 200, array of holding objects
- **Automation:** Manual API test

**INVEST-006**
- **Title:** API — allocation endpoint returns breakdown
- **Preconditions:** Logged in
- **Steps:** `GET /api/v1/investments/allocation`
- **Expected:** 200, allocation by ticker/sector
- **Automation:** Manual API test

---

### REPORTS — Reports Module

**REPORTS-001**
- **Title:** Reports page loads
- **Preconditions:** Logged in
- **Steps:** Navigate to /reports
- **Expected:** Page loads without error, tabs or sections visible
- **Automation:** 10-reports.spec.ts, 23-reports-advanced.spec.ts

**REPORTS-002**
- **Title:** Spending report shows category breakdown
- **Preconditions:** Logged in, transactions exist
- **Steps:** Navigate to /reports, select Spending tab
- **Expected:** Categories listed with amounts, total shown
- **Automation:** 23-reports-advanced.spec.ts › 23.2

**REPORTS-003**
- **Title:** Budget variance report shows actual vs planned
- **Preconditions:** Budgets and transactions both exist
- **Steps:** Select Budget Variance tab
- **Expected:** Each budget shows planned vs actual, variance highlighted
- **Automation:** 23-reports-advanced.spec.ts › 23.3

**REPORTS-004**
- **Title:** Export PDF generates download
- **Preconditions:** Logged in, date range selected
- **Steps:** Click Export PDF button
- **Expected:** PDF file download initiates (or new tab with PDF)
- **Automation:** 23-reports-advanced.spec.ts › 23.5

**REPORTS-005**
- **Title:** Export Excel generates download
- **Preconditions:** Logged in
- **Steps:** Click Export Excel/CSV
- **Expected:** File download with .xlsx or .csv extension
- **Automation:** 23-reports-advanced.spec.ts › 23.6

**REPORTS-006**
- **Title:** Date range filter updates report data
- **Preconditions:** Logged in, transactions in multiple months
- **Steps:** Set date range to Jan–Mar 2026, apply
- **Expected:** Report shows only data for selected range
- **Automation:** 23-reports-advanced.spec.ts › 23.8

**REPORTS-007**
- **Title:** API spending report requires date params
- **Preconditions:** Logged in
- **Steps:** `GET /api/v1/reports/spending` (no params)
- **Expected:** 400 with error message about required params
- **Automation:** Manual API test

**REPORTS-008**
- **Title:** API spending report with dates returns data
- **Preconditions:** Logged in
- **Steps:** `GET /api/v1/reports/spending?startDate=2026-01-01&endDate=2026-03-31`
- **Expected:** 200, category spending breakdown
- **Automation:** 23-reports-advanced.spec.ts › 23.10

---

### IMPORT — CSV/PDF Import

**IMPORT-001**
- **Title:** Import modal opens on button click
- **Preconditions:** Logged in
- **Steps:** Navigate to /transactions, click Import CSV
- **Expected:** Import modal/wizard opens with upload area
- **Automation:** 04-import-export.spec.ts › 4.1, 13-import.spec.ts

**IMPORT-002**
- **Title:** Next button disabled until file and account selected
- **Preconditions:** Import modal open
- **Steps:** Open modal, do not select file or account
- **Expected:** Next/Analyse button disabled
- **Automation:** 04-import-export.spec.ts › 4.2

**IMPORT-003**
- **Title:** Upload valid CSV shows row count
- **Preconditions:** Valid CSV file available
- **Steps:** Upload a bank CSV, select account
- **Expected:** Row count or "Analysing" shown, then preview table
- **Automation:** 04-import-export.spec.ts › 4.3 (CURRENTLY FAILING — see BUG-003)

**IMPORT-004**
- **Title:** Preview shows summary stats (new/duplicate/total)
- **Preconditions:** CSV parsed successfully
- **Steps:** After parse, view preview header
- **Expected:** "X new, Y duplicates, Z total" breakdown
- **Automation:** 13-import.spec.ts › 13.8 (blocked by BUG-003)

**IMPORT-005**
- **Title:** Confirm import creates transactions
- **Preconditions:** CSV parsed, transactions previewed
- **Steps:** Click Confirm / Import All
- **Expected:** Transactions created, success message shown
- **Automation:** 13-import.spec.ts › 13.9 (blocked by BUG-003)

**IMPORT-006**
- **Title:** Import history shows past imports
- **Preconditions:** At least one import completed
- **Steps:** Open import modal, click History tab
- **Expected:** List of previous imports with date and count
- **Automation:** Manual (backend 404 — BUG-001)

---

### WEALTH — Wealth Strategy

**WEALTH-001**
- **Title:** Wealth page loads without error
- **Preconditions:** Logged in
- **Steps:** Navigate to /wealth
- **Expected:** Page loads, no error messages
- **Automation:** 19-wealth-deep.spec.ts › 19.1

**WEALTH-002**
- **Title:** Monthly income is displayed
- **Preconditions:** Logged in, income transactions exist
- **Steps:** Navigate to /wealth
- **Expected:** Income amount shown (auto-detected from transactions)
- **Automation:** 19-wealth-deep.spec.ts › 19.2

**WEALTH-003**
- **Title:** 50/30/20 buckets are displayed with percentages
- **Preconditions:** Logged in, income configured
- **Steps:** Navigate to /wealth
- **Expected:** Three buckets (Needs ~50%, Wants ~30%, Savings ~20%) with dollar amounts
- **Automation:** 19-wealth-deep.spec.ts › 19.3, 19.4

**WEALTH-004**
- **Title:** Category bucket assignments are shown
- **Preconditions:** Logged in, transactions in various categories
- **Steps:** Navigate to /wealth
- **Expected:** Each category shows which bucket it's assigned to
- **Automation:** 19-wealth-deep.spec.ts › 19.5

**WEALTH-005**
- **Title:** Where to Cut section shows overspending categories
- **Preconditions:** Categories with spending > budget
- **Steps:** Navigate to /wealth
- **Expected:** "Where to Cut" section lists overspent categories
- **Automation:** 19-wealth-deep.spec.ts › 19.6

**WEALTH-006**
- **Title:** Investment ladder section visible
- **Preconditions:** Logged in
- **Steps:** Navigate to /wealth, scroll to investment ladder
- **Expected:** Emergency fund, TFSA, RRSP, taxable steps shown
- **Automation:** 19-wealth-deep.spec.ts › 19.7

**WEALTH-007**
- **Title:** AI analysis returns fallback when provider not configured
- **Preconditions:** No AI provider configured
- **Steps:** Click "Get AI Analysis" button on wealth page
- **Expected:** "Configure AI" message or graceful fallback shown
- **Automation:** 19-wealth-deep.spec.ts › 19.8

**WEALTH-008**
- **Title:** API wealth analysis endpoint works
- **Preconditions:** Logged in
- **Steps:** `GET /api/v1/wealth/analysis`
- **Expected:** 200, analysis object with income/spending breakdown
- **Automation:** Manual API test

**WEALTH-009**
- **Title:** Reset category buckets to defaults
- **Preconditions:** Logged in
- **Steps:** `POST /api/v1/wealth/category-buckets/reset`
- **Expected:** 200, buckets reset to default 50/30/20 assignments
- **Automation:** Manual API test

---

### RULES — Auto-categorization Rules Engine

**RULES-001**
- **Title:** Rules page loads with existing rules
- **Preconditions:** Logged in, seeded rules
- **Steps:** Navigate to /rules
- **Expected:** Rule list with conditions and actions shown
- **Automation:** 09-rules.spec.ts

**RULES-002**
- **Title:** Create a new rule
- **Preconditions:** Logged in
- **Steps:** Click Add Rule, set condition (merchant contains X), set action (categorize), save
- **Expected:** New rule appears in list
- **Automation:** 09-rules.spec.ts

**RULES-003**
- **Title:** Apply a rule to existing transactions
- **Preconditions:** Rule exists, matching transactions exist
- **Steps:** Click "Apply" on a rule
- **Expected:** Matching transactions updated with new category
- **Automation:** 09-rules.spec.ts

**RULES-004**
- **Title:** Apply all rules
- **Preconditions:** Rules exist
- **Steps:** Click "Apply All Rules"
- **Expected:** All rules applied, success count shown
- **Automation:** Manual API test (`POST /api/v1/rules/apply-all`)

**RULES-005**
- **Title:** Delete a rule
- **Preconditions:** Rule exists
- **Steps:** Click delete on a rule, confirm
- **Expected:** Rule removed
- **Automation:** 09-rules.spec.ts

---

### ADVISOR — AI Advisor / Chat

**ADVISOR-001**
- **Title:** Advisor page loads
- **Preconditions:** Logged in
- **Steps:** Navigate to /advisor
- **Expected:** Chat interface or advisor page loads without error
- **Automation:** 12-advisor.spec.ts

**ADVISOR-002**
- **Title:** New conversation can be started
- **Preconditions:** Logged in
- **Steps:** Click New Conversation or equivalent
- **Expected:** Empty chat interface ready for input
- **Automation:** 12-advisor.spec.ts

**ADVISOR-003**
- **Title:** Send message — AI not configured shows friendly message
- **Preconditions:** No AI provider configured
- **Steps:** Type a message, press Send
- **Expected:** Helpful message about configuring AI provider, no crash
- **Automation:** 12-advisor.spec.ts

**ADVISOR-004**
- **Title:** Conversation history is persisted
- **Preconditions:** At least one conversation exists
- **Steps:** Navigate away and back to /advisor
- **Expected:** Previous conversations listed
- **Automation:** 12-advisor.spec.ts

**ADVISOR-005**
- **Title:** API conversations list endpoint
- **Preconditions:** Logged in
- **Steps:** `GET /api/v1/advisor/conversations`
- **Expected:** 200, array of conversation objects
- **Automation:** Manual API test

---

### NOTIF — Notification Center

**NOTIF-001**
- **Title:** Notification bell is visible in nav
- **Preconditions:** Logged in
- **Steps:** Look at top navigation
- **Expected:** Bell icon or notification indicator visible
- **Automation:** 14-notifications.spec.ts › 14.1

**NOTIF-002**
- **Title:** Clicking bell opens notification panel
- **Preconditions:** Logged in
- **Steps:** Click the bell icon
- **Expected:** Notification panel slides open or dropdown appears
- **Automation:** 14-notifications.spec.ts › 14.2

**NOTIF-003**
- **Title:** Notification panel shows items or empty state
- **Preconditions:** Logged in
- **Steps:** Open notification panel
- **Expected:** Either notification list or "All caught up" empty state
- **Automation:** 14-notifications.spec.ts › 14.3

**NOTIF-004**
- **Title:** Mark notification as read
- **Preconditions:** Unread notification exists
- **Steps:** Click on a notification or mark-as-read button
- **Expected:** Notification marked read, badge count decreases
- **Automation:** 14-notifications.spec.ts › 14.4 (Manual for full flow)

**NOTIF-005**
- **Title:** API notifications returns 200 (after BUG-002 fix)
- **Preconditions:** Server restarted, notifications table exists
- **Steps:** `GET /api/v1/notifications`
- **Expected:** 200, `{ items: [...], unreadCount: N }`
- **Automation:** Manual API test

**NOTIF-006**
- **Title:** Anomaly notification generated for unusual spending
- **Preconditions:** Transaction significantly above average for category
- **Steps:** Trigger proactive checks (new transaction posted)
- **Expected:** Anomaly notification appears in bell
- **Automation:** Manual

---

### ASSETS — Manual Assets & Liabilities

**ASSETS-001**
- **Title:** Assets section accessible from Accounts
- **Preconditions:** Logged in
- **Steps:** Navigate to /accounts, look for Assets tab or section
- **Expected:** Assets section or tab visible
- **Automation:** 15-assets-liabilities.spec.ts › 15.1

**ASSETS-002**
- **Title:** Add a manual asset
- **Preconditions:** Logged in
- **Steps:** Click Add Asset, enter name / value / type, save
- **Expected:** Asset appears in assets list
- **Automation:** 15-assets-liabilities.spec.ts › 15.2

**ASSETS-003**
- **Title:** Edit a manual asset value
- **Preconditions:** Manual asset exists
- **Steps:** Click edit, update current value, save
- **Expected:** Asset shows updated value, value history snapshot created
- **Automation:** Manual

**ASSETS-004**
- **Title:** Delete a manual asset
- **Preconditions:** Manual asset exists
- **Steps:** Click delete, confirm
- **Expected:** Asset removed from list
- **Automation:** Manual

**ASSETS-005**
- **Title:** Add a manual liability
- **Preconditions:** Logged in
- **Steps:** Click Add Liability, enter name / balance / type, save
- **Expected:** Liability appears in liabilities list
- **Automation:** 15-assets-liabilities.spec.ts › 15.3

**ASSETS-006**
- **Title:** Net worth breakdown shows assets vs liabilities
- **Preconditions:** Assets and liabilities exist
- **Steps:** View net worth section (accounts or wealth page)
- **Expected:** Bank accounts + investments + manual assets - liabilities = total net worth
- **Automation:** 15-assets-liabilities.spec.ts › 15.4

**ASSETS-007**
- **Title:** API assets endpoint returns list (after BUG-001 fix)
- **Preconditions:** Server restarted
- **Steps:** `GET /api/v1/assets`
- **Expected:** 200, array of manual asset objects
- **Automation:** Manual API test

**ASSETS-008**
- **Title:** API net worth breakdown (after BUG-001 fix)
- **Preconditions:** Server restarted
- **Steps:** `GET /api/v1/assets/net-worth-breakdown`
- **Expected:** 200, `{ bankAccounts, investments, manualAssets, manualLiabilities, total }`
- **Automation:** Manual API test

---

### TFSA — Tax Account Tracker

**TFSA-001**
- **Title:** Tax Accounts section in Settings
- **Preconditions:** Logged in
- **Steps:** Navigate to /settings, look for Tax Accounts
- **Expected:** Tax Accounts section or tab visible
- **Automation:** 16-tfsa-rrsp.spec.ts › 16.2

**TFSA-002**
- **Title:** TFSA contribution room displayed
- **Preconditions:** TFSA account configured
- **Steps:** Navigate to Tax Accounts section
- **Expected:** TFSA room remaining shown in dollars
- **Automation:** 16-tfsa-rrsp.spec.ts › 16.3

**TFSA-003**
- **Title:** Add TFSA account for household member
- **Preconditions:** Logged in
- **Steps:** Click Add Account, select TFSA type, enter year and limit
- **Expected:** TFSA account added, contribution room calculated
- **Automation:** 16-tfsa-rrsp.spec.ts › 16.4

**TFSA-004**
- **Title:** RRSP deduction limit displayed
- **Preconditions:** RRSP account configured with income data
- **Steps:** View Tax Accounts section
- **Expected:** RRSP deduction limit and room shown
- **Automation:** Manual

**TFSA-005**
- **Title:** Over-contribution warning shown
- **Preconditions:** Contributions exceed limit
- **Steps:** View Tax Accounts section
- **Expected:** Warning badge or alert about over-contribution
- **Automation:** 16-tfsa-rrsp.spec.ts › 16.5

**TFSA-006**
- **Title:** API tax-accounts endpoint (after BUG-001 fix)
- **Preconditions:** Server restarted
- **Steps:** `GET /api/v1/tax-accounts`
- **Expected:** 200, array of tax account objects
- **Automation:** Manual API test

**TFSA-007**
- **Title:** API household summary (after BUG-001 fix)
- **Preconditions:** Server restarted
- **Steps:** `GET /api/v1/tax-accounts/household-summary`
- **Expected:** 200, combined TFSA/RRSP room for all members
- **Automation:** Manual API test

---

### SETTINGS — Application Settings

**SETTINGS-001**
- **Title:** Settings page loads all sections
- **Preconditions:** Logged in
- **Steps:** Navigate to /settings
- **Expected:** Profile, Display, Notifications, Security, etc. sections visible
- **Automation:** 11-settings.spec.ts, 16-tfsa-rrsp.spec.ts › 16.1

**SETTINGS-002**
- **Title:** Edit profile name
- **Preconditions:** Logged in
- **Steps:** Navigate to /settings > Profile, change name, save
- **Expected:** Name updated, success toast shown
- **Automation:** 11-settings.spec.ts

**SETTINGS-003**
- **Title:** Change display preferences (dark mode / currency)
- **Preconditions:** Logged in
- **Steps:** Navigate to /settings > Display, toggle dark mode
- **Expected:** App switches to dark/light mode
- **Automation:** 11-settings.spec.ts

**SETTINGS-004**
- **Title:** Configure household members
- **Preconditions:** Logged in
- **Steps:** Navigate to /settings > Household
- **Expected:** Household member list visible
- **Automation:** 11-settings.spec.ts

**SETTINGS-005**
- **Title:** Categories management — list and create
- **Preconditions:** Logged in
- **Steps:** Navigate to /settings > Categories
- **Expected:** Category list visible, Add Category button works
- **Automation:** 11-settings.spec.ts

**SETTINGS-006**
- **Title:** Notification preferences can be toggled
- **Preconditions:** Logged in
- **Steps:** Navigate to /settings > Notifications, toggle email notifications
- **Expected:** Setting saved, toggle reflects state
- **Automation:** 11-settings.spec.ts

**SETTINGS-007**
- **Title:** Report digest schedule configuration
- **Preconditions:** Logged in
- **Steps:** Navigate to /settings > Report Digest
- **Expected:** Schedule frequency options visible, can be saved
- **Automation:** Manual

**SETTINGS-008**
- **Title:** Data section in settings accessible
- **Preconditions:** Logged in
- **Steps:** Navigate to /settings > Data
- **Expected:** Data management options visible (export, checkpoints)
- **Automation:** 18-checkpoints.spec.ts › 18.2

---

### EXPORT — Data Export

**EXPORT-001**
- **Title:** Export transactions CSV from transactions page
- **Preconditions:** Logged in, transactions exist
- **Steps:** `GET /api/v1/transactions/export/csv`
- **Expected:** 200, CSV file with transaction rows
- **Automation:** Manual API test

**EXPORT-002**
- **Title:** Export transactions CSV from dedicated export endpoint (after BUG-001 fix)
- **Preconditions:** Server restarted
- **Steps:** `GET /api/v1/export/csv?type=transactions`
- **Expected:** 200, CSV file
- **Automation:** Manual API test

**EXPORT-003**
- **Title:** Export accounts CSV (after BUG-001 fix)
- **Preconditions:** Server restarted
- **Steps:** `GET /api/v1/export/csv?type=accounts`
- **Expected:** 200, CSV file with account balances
- **Automation:** Manual API test

**EXPORT-004**
- **Title:** Export report as PDF
- **Preconditions:** Logged in
- **Steps:** `GET /api/v1/reports/export/pdf?from=2026-01-01&to=2026-03-31&type=spending`
- **Expected:** 200, PDF content
- **Automation:** 23-reports-advanced.spec.ts › 23.10

---

### DUPDET — Duplicate Transaction Detection

**DUPDET-001**
- **Title:** Duplicates API returns grouped potential duplicates
- **Preconditions:** Logged in
- **Steps:** `GET /api/v1/transactions/duplicates`
- **Expected:** 200, `{ count: N, groups: [...] }` (empty groups when no duplicates)
- **Automation:** 20-duplicate-detection.spec.ts › 20.6

**DUPDET-002**
- **Title:** Duplicate detection UI shown when duplicates exist
- **Preconditions:** Two near-identical transactions exist
- **Steps:** Navigate to /transactions, look for duplicate banner/tab
- **Expected:** Banner or indicator showing N potential duplicates
- **Automation:** 20-duplicate-detection.spec.ts › 20.2, 20.3

**DUPDET-003**
- **Title:** Merge duplicates combines into one transaction
- **Preconditions:** Duplicate pair identified
- **Steps:** Click Merge on a duplicate group
- **Expected:** One transaction remains, other soft-deleted
- **Automation:** 20-duplicate-detection.spec.ts › 20.4

**DUPDET-004**
- **Title:** Dismiss duplicates marks as not-duplicate
- **Preconditions:** Duplicate pair identified
- **Steps:** Click Dismiss/Not a Duplicate
- **Expected:** Pair removed from duplicates list, both transactions kept
- **Automation:** 20-duplicate-detection.spec.ts › 20.5

**DUPDET-005**
- **Title:** Import auto-detects duplicates against existing transactions
- **Preconditions:** Transactions exist that match incoming CSV
- **Steps:** Import a CSV containing transactions already in the DB
- **Expected:** Duplicate count shown in preview, existing transactions flagged
- **Automation:** Manual (dependent on IMPORT-003 fix)

---

### CASHFLOW — Cash Flow Module

**CASHFLOW-001**
- **Title:** Cash flow page loads without error
- **Preconditions:** Logged in
- **Steps:** Navigate to /cash-flow
- **Expected:** Monthly income and expense breakdown visible
- **Automation:** 22-cash-flow-merchants.spec.ts › 22.1

**CASHFLOW-002**
- **Title:** Monthly income and expense totals shown
- **Preconditions:** Logged in, transactions for current year
- **Steps:** Navigate to /cash-flow
- **Expected:** Dollar amounts for income and expenses per month
- **Automation:** 22-cash-flow-merchants.spec.ts › 22.2

**CASHFLOW-003**
- **Title:** Tabs available for overview / by month / merchants
- **Preconditions:** Logged in
- **Steps:** View /cash-flow page tabs
- **Expected:** Multiple view tabs or sections
- **Automation:** 22-cash-flow-merchants.spec.ts › 22.3

**CASHFLOW-004**
- **Title:** Merchant breakdown tab shows top merchants
- **Preconditions:** Transactions with merchant names
- **Steps:** Click Merchants tab in cash flow
- **Expected:** Top merchants by spending amount listed
- **Automation:** 22-cash-flow-merchants.spec.ts › 22.4

**CASHFLOW-005**
- **Title:** Year selector changes cash flow data
- **Preconditions:** Transactions in multiple years
- **Steps:** Change year to 2025 in selector
- **Expected:** Data updates to show 2025 cash flow
- **Automation:** 22-cash-flow-merchants.spec.ts › 22.6

**CASHFLOW-006**
- **Title:** Net cash flow (income - expenses) calculated correctly
- **Preconditions:** Income and expense transactions for same period
- **Steps:** View cash flow for a specific month
- **Expected:** Net = income - expenses, positive or negative shown
- **Automation:** 22-cash-flow-merchants.spec.ts › 22.7

**CASHFLOW-007**
- **Title:** API cashflow summary endpoint
- **Preconditions:** Logged in
- **Steps:** `GET /api/v1/cashflow`
- **Expected:** 200, `{ year, months: [{ month, income, expenses, net }] }`
- **Automation:** Manual API test

---

### DASHBOARD — Dashboard Module

**DASHBOARD-001**
- **Title:** Dashboard loads with widget cards
- **Preconditions:** Logged in
- **Steps:** Navigate to /
- **Expected:** Multiple widget cards visible (net worth, budgets, recent transactions, etc.)
- **Automation:** 17-dashboard-customization.spec.ts › 17.1

**DASHBOARD-002**
- **Title:** Net worth or balance summary shown
- **Preconditions:** Accounts with balances
- **Steps:** Navigate to /
- **Expected:** Total net worth or account balance dollar amount shown
- **Automation:** 17-dashboard-customization.spec.ts › 17.4

**DASHBOARD-003**
- **Title:** Recent transactions widget shows latest transactions
- **Preconditions:** Transactions exist
- **Steps:** Navigate to /
- **Expected:** Last 5–10 transactions listed in a widget
- **Automation:** 17-dashboard-customization.spec.ts › 17.5

**DASHBOARD-004**
- **Title:** Budget progress widget shows spending vs budgets
- **Preconditions:** Budgets exist
- **Steps:** Navigate to /
- **Expected:** Budget widget with progress bars
- **Automation:** 17-dashboard-customization.spec.ts › 17.6

**DASHBOARD-005**
- **Title:** Dashboard customize button available
- **Preconditions:** Logged in
- **Steps:** Look for Customize Dashboard button
- **Expected:** Button visible; clicking opens customization panel
- **Automation:** 17-dashboard-customization.spec.ts › 17.2 (CURRENTLY NOT FOUND)

**DASHBOARD-006**
- **Title:** Widgets can be hidden
- **Preconditions:** Customize mode accessible
- **Steps:** Enter customize mode, toggle off a widget, save
- **Expected:** Widget disappears from dashboard
- **Automation:** 17-dashboard-customization.spec.ts › 17.3 (CURRENTLY SKIPPED)

---

## Appendix: Known Blockers

| Blocker | Affects Scenarios | Fix |
|---------|-------------------|-----|
| BUG-001 (server not serving routes) | ASSETS-007/8, TFSA-006/7, EXPORT-002/3, NOTIF-005, DUPDET-003/4 (via API) | Restart server process |
| BUG-002 (notifications 500) | NOTIF-001–006 | Fix proactiveAi import in notifications.ts |
| BUG-003 (CSV parse fails) | IMPORT-003–006, DUPDET-005 | Fix import parser for sample fixture |

---

## Appendix: API Quick Reference

| Path | Method | Auth | Working? |
|------|--------|------|----------|
| /api/v1/auth/login | POST | No | YES |
| /api/v1/auth/logout | POST | Yes | YES |
| /api/v1/users/me | GET/PUT | Yes | YES |
| /api/v1/accounts | GET | Yes | YES (grouped) |
| /api/v1/accounts/:id | GET/PUT/DELETE | Yes | YES |
| /api/v1/accounts/:id/history | GET | Yes | YES |
| /api/v1/transactions | GET | Yes | YES (paginated) |
| /api/v1/transactions/:id | GET/PUT/DELETE | Yes | YES |
| /api/v1/transactions/duplicates | GET | Yes | YES |
| /api/v1/transactions/export/csv | GET | Yes | YES |
| /api/v1/budgets | GET/POST | Yes | YES |
| /api/v1/budgets/:id | PUT/DELETE | Yes | YES |
| /api/v1/goals | GET/POST/PUT/DELETE | Yes | YES |
| /api/v1/recurring | GET/PUT | Yes | YES |
| /api/v1/categories | GET | Yes | YES |
| /api/v1/rules | GET | Yes | YES |
| /api/v1/rules/apply-all | POST | Yes | YES |
| /api/v1/advisor/conversations | GET | Yes | YES |
| /api/v1/advisor/chat | POST | Yes | 400 (no AI) |
| /api/v1/wealth/income | GET | Yes | YES |
| /api/v1/wealth/analysis | GET | Yes | YES |
| /api/v1/wealth/category-buckets | GET/PUT | Yes | YES |
| /api/v1/wealth/ai-analysis | POST | Yes | YES (fallback) |
| /api/v1/cashflow | GET | Yes | YES |
| /api/v1/networth/history | GET | Yes | YES |
| /api/v1/advice/topics | GET | Yes | YES |
| /api/v1/reports/spending | GET | Yes | YES (needs dates) |
| /api/v1/reports/budget-variance | GET | Yes | YES (needs from/to) |
| /api/v1/reports/export/pdf | GET | Yes | YES (needs params) |
| /api/v1/audit | GET | Yes | YES |
| /api/v1/investments/holdings | GET | Yes | YES |
| /api/v1/investments/allocation | GET | Yes | YES |
| /api/v1/investments/performance | GET | Yes | YES |
| /api/v1/notifications | GET | Yes | 500 ERROR (BUG-002) |
| /api/v1/assets | GET/POST | Yes | 404 (BUG-001) |
| /api/v1/liabilities | GET/POST | Yes | 404 (BUG-001) |
| /api/v1/tax-accounts | GET/POST | Yes | 404 (BUG-001) |
| /api/v1/fx/rates | GET | Yes | 404 (BUG-001) |
| /api/v1/checkpoints | GET | Yes | 404 (BUG-001) |
| /api/v1/email-connector | GET | Yes | 404 (BUG-001) |
| /api/v1/import/history | GET | Yes | 404 (BUG-001) |
| /api/v1/auto-categorize | POST | Yes | 404 (BUG-001) |
| /api/v1/receipts/ocr | POST | Yes | 404 (BUG-001) |
| /api/v1/export/csv | GET | Yes | 404 (BUG-001) |
