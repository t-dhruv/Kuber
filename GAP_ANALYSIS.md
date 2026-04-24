# Kuber — Gap Analysis vs Firefly III
> Reference: [firefly-iii](https://github.com/firefly-iii/firefly-iii) (PHP/Laravel)
> Kuber stack: Node/Express/Prisma/TypeScript/React
> Date: 2026-04-23 | Branch: feat/sprint-1-core-gaps

---

## Legend
| Status | Meaning |
|--------|---------|
| ✅ Identical | Logic and edge-case handling match reference |
| ⚠️ Partial | Feature exists but missing sub-logic, validation, or depth |
| ❌ Missing | No equivalent found |

---

## Feature Comparison Table

### Core Financial Data

| Feature | Kuber Status | Notes |
|---------|-------------|-------|
| Asset accounts (checking, savings, cash) | ✅ Identical | `Account` model, full CRUD |
| Liability accounts | ✅ Identical | `ManualLiability` model |
| Transaction CRUD + pagination | ✅ Identical | Cursor + offset pagination, full filter set |
| Transaction splits | ✅ Identical | `TransactionSplit` model, `splits.ts` route |
| Transaction tags | ✅ Identical | `Tag` + `TransactionTag` many-to-many |
| Transfer between accounts | ⚠️ Partial | `TransferGroup` exists but transfer type not a first-class enum; amounts managed as sign flip |
| **Bills** (recurring bill tracker with paid/unpaid state per period) | ❌ Missing | Firefly: `Bill` model + `BillRepository`. Tracks expected min/max amount, marks each period paid/unpaid, sends alerts |
| **Account reconciliation** | ❌ Missing | Firefly: `ReconcileController`. User enters bank balance, system shows difference, creates reconciliation transaction |
| **Transaction notes** (rich, separate from description) | ⚠️ Partial | Kuber `Transaction.notes` field exists; Firefly has separate `Note` model attachable to any entity |
| **Transaction location / GPS** | ❌ Missing | Firefly: `Location` model on transactions. Lat/long/zoom |
| **Multi-currency per transaction** | ⚠️ Partial | Kuber has `FX` route for rates but no per-transaction currency field or conversion stored on ledger |
| **File attachments on transactions** | ❌ Missing | Firefly: `Attachment` model, binary upload, downloadable. Kuber has receipt OCR but no stored file attachment |
| **Transaction links** (related transactions) | ❌ Missing | Firefly: `LinkType` + `TransactionJournalLink`. User creates typed links (repayment, related, etc.) |
| **Transaction types as enum** (withdrawal/deposit/transfer/reconcile) | ⚠️ Partial | Kuber uses positive/negative amounts; no explicit type enum stored |
| **Object groups** (organize bills, piggy banks) | ❌ Missing | Firefly: `ObjectGroup` model. Kuber has `CategoryGroup` only |

### Budgeting

| Feature | Kuber Status | Notes |
|---------|-------------|-------|
| Budget CRUD | ✅ Identical | FIXED / FLEXIBLE / NON_MONTHLY types |
| Budget limits per period | ✅ Identical | `BudgetLimit` with `periodKey`, spent, rollover |
| Budget rollover | ✅ Identical | `rolloverPreviousPeriod()` in `budgetLimits.ts` |
| Budget vs actual reporting | ✅ Identical | `BudgetVarianceChart` on reports page |
| **Available budget** (global spending cap per period) | ❌ Missing | Firefly: `AvailableBudget` model. Sets a household-level total budget ceiling; warns when total category budgets exceed it |
| **Auto-budget** (auto-fill limit each period) | ❌ Missing | Firefly: `AutoBudget` model. Enum: `BUDGET_TYPE_RESET` (reset to fixed), `BUDGET_TYPE_ROLLOVER`, `BUDGET_TYPE_ADJUSTED`. Runs via cron |

### Goals / Savings

| Feature | Kuber Status | Notes |
|---------|-------------|-------|
| Goals with target amount and date | ✅ Identical | `Goal` + `GoalAllocation` models |
| Goal progress tracking | ✅ Identical | |
| **Piggy banks with event log** | ⚠️ Partial | Kuber Goals cover the concept; Firefly's `PiggyBank` additionally tracks `PiggyBankEvent` (each add/remove with journal link) and `PiggyBankRepetition` (multiple savings pots per piggy bank with start/end dates) |

### Categories

| Feature | Kuber Status | Notes |
|---------|-------------|-------|
| Categories CRUD | ✅ Identical | |
| Category groups | ✅ Identical | `CategoryGroup` |
| Category-level budgets | ✅ Identical | Budget linked to category |
| **No-category report** | ❌ Missing | Firefly: `NoCategoryController` — report showing all transactions with no category assigned |

### Rules & Automation

| Feature | Kuber Status | Notes |
|---------|-------------|-------|
| Rule CRUD | ✅ Identical | |
| Rule conditions (field/operator/value) | ⚠️ Partial | Kuber: `merchantName`, `description`, `amount`. Firefly: 30+ trigger fields (account name, amount, currency, description, notes, tag, category, budget, date, type, source/dest account) |
| Rule actions | ⚠️ Partial | Kuber: 4 actions (`setCategory`, `addTag`, `hide`, `markReviewed`). Firefly: 30+ actions (set amount, convert type, link to bill, update piggy bank, switch accounts, prepend/append description/notes, delete transaction, set source/dest account, etc.) |
| Rule execution on save | ✅ Identical | `applyActiveRulesToTransaction()` called on transaction create/update |
| **Rule groups** (ordered groups, stop-on-match) | ❌ Missing | Firefly: `RuleGroup` with `stop_processing` flag. Rules evaluated group by group; a group can short-circuit evaluation |
| **Rule triggers** (on-store vs on-update vs on-cli) | ⚠️ Partial | Kuber runs on save. Firefly distinguishes `store_journal`, `update_journal`, and manual trigger |
| **Manual rule run** (apply rules to existing transactions in bulk) | ⚠️ Partial | Kuber has `POST /rules/:id/test` endpoint exists; bulk re-apply to historical transactions not exposed |
| Scheduled rule execution | ✅ Identical | `ruleExecutionJob.ts` via 5-min scheduler |
| Auto-categorize via ML | ✅ Identical | `autoCategorize.ts`, `CategoryLearningExample` model |

### Recurring Transactions

| Feature | Kuber Status | Notes |
|---------|-------------|-------|
| Recurring item CRUD | ✅ Identical | `RecurringItem` model |
| Frequency types (daily/weekly/monthly/yearly) | ✅ Identical | |
| Recurring detection from transaction history | ✅ Identical | `POST /recurring/detect` |
| Monthly summary | ✅ Identical | `GET /recurring/monthly-summary` |
| **Advanced repeat patterns** | ⚠️ Partial | Firefly: `RecurrenceRepetition` stores `repetition_type` (ndom = nth day of month), `repetition_moment`, `repetition_skip` (skip N occurrences), `weekend_skip`, `occurrences`. Kuber: fixed frequency enum only |
| **Recurring transaction meta** | ❌ Missing | Firefly: `RecurrenceMeta` + `RecurrenceTransactionMeta` for per-transaction metadata on recurrences |
| **Auto-create transactions from recurrences** | ⚠️ Partial | Firefly cron job creates actual transactions automatically. Kuber tracks `nextDate` but creation appears manual/UI-triggered |

### Search

| Feature | Kuber Status | Notes |
|---------|-------------|-------|
| Basic text search on transactions | ✅ Identical | `description ILIKE %search%` filter |
| Filter by account, category, date, amount | ✅ Identical | |
| **Advanced operator query search** | ❌ Missing | Firefly: `OperatorQuerySearch` + `QueryParser`. Supports `amount:>100`, `category:food`, `account:HSBC`, `date:last-month`, `has:attachment`, `description_contains:coffee`. Full boolean query parser |
| Auto-complete endpoints | ❌ Missing | Firefly: `/json/auto-complete/*` endpoints for accounts, categories, tags, bills. Powers typeahead UX |

### Reports

| Feature | Kuber Status | Notes |
|---------|-------------|-------|
| Budget variance report | ✅ Identical | |
| Cash flow forecast | ✅ Identical | |
| Sankey chart | ✅ Identical | |
| Tax summary | ✅ Identical | |
| Net worth over time | ✅ Identical | Snapshots + chart |
| **Account-level reports** | ⚠️ Partial | Firefly has dedicated chart controllers per entity (Bill, Budget, Category, PiggyBank, Tag). Kuber reports are more aggregated |
| **Tag-based reports** | ❌ Missing | Firefly: tag report grouping income/expenses by tag |
| **Double-entry report** | ❌ Missing | Firefly: expense/income reports that show paired accounts |
| **Export formats** | ⚠️ Partial | Kuber: CSV only. Firefly: CSV + JSON + OFX + CAMT.053 |
| **Fiscal year support** | ❌ Missing | Firefly: configurable fiscal year start (month/day). Affects all period-based reports |
| Saved reports / schedules | ✅ Identical | `ReportSchedule` model, `schedules.ts` route |

### Investments

| Feature | Kuber Status | Notes |
|---------|-------------|-------|
| Investment holdings | ✅ Identical | `InvestmentHolding` + `HoldingLot` models |
| Recurring investments | ✅ Identical | `RecurringInvestment` model |
| Investment intelligence (AI) | ✅ Identical | `InvestmentIntel` model + route |
| Price cache | ✅ Identical | `priceCache.ts` |
| Tax accounts | ✅ Identical | `TaxAccount` model + route |
| **No Firefly equivalent** | — | Kuber-unique; Firefly does not track investments |

### Import / Export

| Feature | Kuber Status | Notes |
|---------|-------------|-------|
| CSV import with column mapping | ✅ Identical | `ImportPage.tsx`, `import.ts` route |
| Import deduplication | ✅ Identical | `importDedup.ts` |
| Import history | ✅ Identical | `ImportHistory` model |
| Bank format detection | ✅ Identical | `bankFormats.ts` |
| Receipt OCR | ✅ Identical | `receipts.ts` route, `pdfParser.ts` |
| **Bulk import via email** | ✅ Identical | `emailParser.ts`, `imapWatcher.ts` — Kuber-unique |
| Export to CSV | ✅ Identical | `csvExport.ts` |
| **Export to OFX / CAMT.053 / JSON** | ❌ Missing | Firefly supports multiple financial export formats |

### Authentication & Users

| Feature | Kuber Status | Notes |
|---------|-------------|-------|
| JWT auth + refresh tokens | ✅ Identical | 15min access, 7d refresh, hashed in DB |
| TOTP 2FA | ✅ Identical | |
| Password reset via email | ✅ Identical | |
| Household multi-tenancy | ✅ Identical | Every query scoped to `householdId` |
| Household invites | ✅ Identical | `HouseholdInvite` model |
| API tokens | ✅ Identical | `ApiToken` model + route |
| **Role-based access within household** | ⚠️ Partial | Firefly: `UserRole`, `GroupMembership` with owner/manager/member roles. Kuber: `HouseholdMember` without granular permissions |
| **Admin panel** (system config, user management) | ❌ Missing | Firefly: `Admin/*` controllers for system configuration, user admin, notifications admin |
| **OAuth / social login** | ❌ Missing | Firefly: `Profile/OAuthController`. Kuber: JWT-only |
| **Invited user management** (resend, revoke) | ⚠️ Partial | `HouseholdInvite` model exists; management API coverage unclear |

### Infrastructure & Observability

| Feature | Kuber Status | Notes |
|---------|-------------|-------|
| Webhooks with delivery tracking | ✅ Identical | `Webhook` model, `webhookFire.ts` |
| **Webhook attempt/retry log** | ⚠️ Partial | Firefly: `WebhookAttempt`, `WebhookDelivery`, `WebhookResponse` with retry logic. Kuber: `webhookFire.ts` fires but no persistent attempt log |
| Audit log | ✅ Identical | `AuditLog` model, `logAudit()` |
| Push notifications | ✅ Identical | `PushSubscription` + `webPush.ts` |
| In-app notifications | ✅ Identical | `Notification` model + route |
| **Email notifications per event type** | ⚠️ Partial | Firefly: granular notification preferences (new user, login, maintenance). Kuber: digest email only |
| Prometheus metrics | ✅ Identical | `metrics.ts` |
| Structured logging (pino) | ✅ Identical | |
| **Cron management UI** | ❌ Missing | Firefly: `System/CronController` — trigger cron jobs via API call. Kuber crons are hardcoded in `index.ts` |
| **Scheduled jobs visibility** | ❌ Missing | Kuber jobs run invisibly; no endpoint to inspect last-run or trigger manually |
| Net worth snapshots | ✅ Identical | `NetWorthSnapshot`, `netWorthJob.ts` |
| Account balance snapshots | ✅ Identical | `AccountBalanceSnapshot`, `accountBalanceJob.ts` |
| Operation checkpoints | ✅ Identical | `OperationCheckpoint` model — Kuber-unique |

### AI / Advisor

| Feature | Kuber Status | Notes |
|---------|-------------|-------|
| Multi-provider AI chat | ✅ Identical | Claude / OpenAI / Gemini / Ollama / OpenRouter |
| AI conversation history | ✅ Identical | `Conversation` + `ConversationMessage` models |
| Proactive AI checks | ✅ Identical | `proactiveAi.ts` — Kuber-unique |
| Wealth analysis AI | ✅ Identical | `wealthAnalysis.ts`, `WealthAiCache` — Kuber-unique |
| Investment intelligence AI | ✅ Identical | `InvestmentIntel` — Kuber-unique |
| Digest email | ✅ Identical | `digestEmail.ts` — Kuber-unique |
| **No Firefly equivalent** | — | Entire AI layer is Kuber-unique |

---

## Architectural Drift

| Area | Firefly Pattern | Kuber Pattern | Risk |
|------|----------------|---------------|------|
| **Transaction representation** | Double-entry: `TransactionJournal` (header) + `Transaction` (credit+debit legs). Every transfer = 2 transaction rows | Single-entry: one `Transaction` row, sign encodes direction. Transfers use `TransferGroup` | Medium — single-entry is simpler but makes true double-entry reports (balance sheets, debit/credit clarity) harder |
| **Transaction type** | First-class enum (`TransactionType` model: withdrawal, deposit, transfer, reconcile, opening balance, liability credit) | Implicit via amount sign + `isTransfer` flag | Low-Medium — type inference works but edge cases (reconciliation, opening balance) need explicit handling |
| **Rule architecture** | Separate `Rule`, `RuleTrigger[]`, `RuleAction[]` rows — each trigger/action is a DB row with type+value | Single `Rule` row with `conditions` + `actions` as JSON columns | Low — JSON approach is more flexible for Kuber's current scale, but loses queryability |
| **Recurring transaction execution** | Cron job uses `RecurrenceRepository` to calculate next-date via repetition model, then creates real `TransactionJournal` rows automatically | Tracks `nextDate` on `RecurringItem`; actual transaction creation appears UI/user-triggered | Medium — users must manually confirm recurring transactions; Firefly creates them silently |
| **Currency** | First-class: `TransactionCurrency` model, exchange rate stored per transaction, `CurrencyExchangeRate` history table | FX rates fetched/cached via `fxRates.ts` but not stored per transaction in ledger | High — if user has multi-currency accounts, historical reports will be inaccurate without stored rates |
| **Webhook delivery** | Full delivery pipeline: `WebhookMessage` → `WebhookDelivery` → `WebhookAttempt` with HTTP response stored | Fire-and-forget with basic error logging | Medium — no retry, no delivery history, hard to debug failed webhooks |
| **Search** | Dedicated query parser with operator grammar, account search and transaction search as separate controllers | Inline `where` building in route handler with basic text + filter params | Medium — hard to extend; complex search requires route refactor |
| **Auth** | Laravel Sanctum + optional OAuth + 2FA enforced per admin config | Custom JWT + refresh + TOTP | Low — equivalent security posture; missing OAuth is a UX gap not security gap |
| **Multi-tenancy** | `UserGroup` (household equivalent) — users can belong to multiple groups with different roles | `Household` — users belong to one household; role granularity limited | Low for personal use; matters at multi-family/shared accounts scale |

---

## Prioritized Execution Roadmap

### P0 — Fix Broken / High-Impact Partial (implement in current sprint)

| # | Item | Why |
|---|------|-----|
| P0-1 | **Auto-create transactions from recurring items** | Core UX gap — users expect recurring transactions to appear automatically |
| P0-2 | **Webhook delivery log** (`WebhookAttempt` table, retry on failure) | Integration reliability; no way to debug failed webhooks today |
| P0-3 | **Rule groups + stop-on-match** | Power-user automation gap; rules currently have no ordering boundary |
| P0-4 | **Rule action depth** (set description, set notes, set merchant, convert type, delete) | Current 4 actions are too limited for real automation |
| P0-5 | **Multi-currency per transaction** (store `currencyCode` + `originalAmount` on `Transaction`) | Correctness gap; FX-aware households get wrong balances |

### P1 — High-Value Missing Features

| # | Item | Why |
|---|------|-----|
| P1-1 | **Bills** (recurring bill tracker with paid/unpaid state per period) | Very common PF use-case; differs from recurring transactions |
| P1-2 | **Account reconciliation** | Required for trust in account balances |
| P1-3 | **Advanced operator search** | Power-user retention; basic search insufficient for large history |
| P1-4 | **File attachments on transactions** | Receipts stored vs OCR-and-discard |
| P1-5 | **Available budget** (global spending ceiling) | Budget hygiene; prevents over-allocation |
| P1-6 | **Auto-budget** (per-period automatic limit reset/rollover) | Reduces manual budget maintenance |

### P2 — Nice-to-Have / Completeness

| # | Item | Why |
|---|------|-----|
| P2-1 | **Transaction links** (typed relationship between transactions) | Reimbursements, loan repayments |
| P2-2 | **Fiscal year configuration** | Non-calendar-year reporting |
| P2-3 | **Additional export formats** (OFX, JSON) | Import into other tools |
| P2-4 | **Tag-based reports** | More granular spend analysis |
| P2-5 | **No-category transaction report** | Data quality / cleanup workflow |
| P2-6 | **Cron management endpoint** (trigger/inspect jobs) | Operator observability |
| P2-7 | **Granular household roles** (owner/manager/member) | Multi-user households |
| P2-8 | **Transaction location / GPS** | Nice for travel expense tracking |
| P2-9 | **OAuth / social login** | Onboarding friction reduction |
| P2-10 | **Object groups** for bills/piggy banks | Organization at scale |

### P3 — Out of Scope (Firefly-only, not relevant to Kuber's vision)

- Admin system config panel (Kuber is single-household self-hosted)
- Multi-instance user management
- Laravel-specific patterns (Twig, Blade, Sanctum)

---

## Summary Counts

| Status | Count |
|--------|-------|
| ✅ Identical | 38 |
| ⚠️ Partial | 19 |
| ❌ Missing | 22 |

Kuber is **~60% feature-complete** relative to Firefly III on core personal finance features, and **ahead** on AI, investment tracking, email import, and observability.
