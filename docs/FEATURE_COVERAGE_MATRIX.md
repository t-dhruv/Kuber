# Kuber Feature Coverage Matrix

Status: active
Owner: engineering
Target: 100% shipped-feature coverage before production release

## Rules

A feature is `COVERED` only when automated tests prove:

- Happy path.
- Primary validation or failure path.
- Authorization, household boundary, or role boundary when relevant.
- Persistence, side effect, or UI outcome.

`PARTIAL` means at least one automated test exists, but one or more required dimensions are missing.
`MISSING` means no reliable automated coverage has been identified yet.
`BLOCKED` means the feature needs a harness, fixture, or product decision before it can be tested properly.

## Summary

Last reviewed: 2026-05-13

| Status | Count |
| --- | ---: |
| COVERED | 0 |
| PARTIAL | 33 |
| MISSING | 6 |
| BLOCKED | 0 |

## Matrix

| Feature | Risk | Unit | API integration | E2E | Status | Next required test |
| --- | --- | --- | --- | --- | --- | --- |
| Signup | critical | missing | partial: `authResetToken.test.ts`, `householdInvites.test.ts` | smoke: `01-auth.spec.ts` | PARTIAL | API signup validation, duplicate email, household creation, refresh cookie assertions |
| Login/session refresh/logout | critical | partial: token helpers indirectly | missing | smoke: `01-auth.spec.ts` | PARTIAL | API login, refresh, logout, invalid token, refresh-token rotation and revocation |
| Password reset | critical | partial: `authResetToken.test.ts` | partial | e2e: `19-forgot-password.spec.ts`, `20-reset-password.spec.ts` | PARTIAL | End-to-end token reset success path with token invalidation |
| Optional TOTP 2FA | critical | backup-code hashing exercised through route tests | API login challenge, setup, enable, validate, backup-code use, disable | missing | PARTIAL | Browser E2E for setup/challenge and recovery-code UX |
| Household membership/invites | critical | missing | partial: `householdInvites.test.ts` | missing | PARTIAL | Role authorization, cross-household rejection, invite expiry/reuse |
| Profile and user settings | high | missing | partial: `system.test.ts` | smoke: `11-settings.spec.ts` | PARTIAL | API profile validation and persistence, password-change refresh invalidation |
| Accounts CRUD | critical | missing | partial: `accounts.test.ts` | smoke: `02-accounts.spec.ts` | PARTIAL | API update happy path, balance precision, export, history, transactions, reconciliation |
| Account reconciliation | high | missing | API preview, commit, history, adjustment creation, active-account and journal scoping | missing | PARTIAL | UI/E2E reconciliation flow and persistence-backed adjustment verification |
| Transactions CRUD | critical | partial: journal services | API list/create validation/update validation/delete soft-delete, household isolation | smoke: `03-transactions.spec.ts` | PARTIAL | Full create/edit happy path, splits, attachments, richer cross-household regression pack |
| Transfers | critical | partial: `transferConversion.test.ts` | missing | missing | PARTIAL | API transfer linking, double-entry journal assertions, deletion behavior |
| Transaction splits | critical | partial: `transactionSplits.test.ts` | partial: `splits.test.ts` | e2e: `03-transactions.spec.ts` | PARTIAL | Split persistence, validation, household isolation, balance impact |
| Duplicate detection/review queue | high | partial: `importDedup.test.ts` absent | API detection, dismiss, merge, canonical pairs, live-journal scoping, soft delete | e2e: `17-review-queue.spec.ts` | PARTIAL | Import duplicate matcher unit coverage and richer UI review assertions |
| CSV import and mapping | critical | partial: parsers/export helpers | missing | e2e: `10-import.spec.ts`, `21-bulk-import-accounts.spec.ts` | PARTIAL | API parse/confirm, duplicate handling, bad-file validation, database state |
| Export CSV/PDF | high | covered: `csvExport.test.ts` | PDF/Excel export validation, download headers, spending/cashflow/tax data scopes | e2e: `09-reports.spec.ts` | PARTIAL | CSV route variants and richer file-content assertions |
| Categories/tags/merchants | high | missing | API category list/create/delete, household scoping, system delete guard, soft delete | e2e: `11-settings.spec.ts` | PARTIAL | Tags and merchants API coverage, UI assertions |
| Budgets and budget limits | critical | partial: `budgetLimits.test.ts` | partial: `budgets.test.ts` | smoke: `04-budgets.spec.ts` | PARTIAL | Budget limit rollover/recalc endpoints, update happy path, income budgets, edge-period calculations |
| Goals and contributions | critical | API CRUD, linked debt accounts, contribution, household isolation, soft delete | missing | smoke: `05-goals.spec.ts` | PARTIAL | Dashboard/report impact and richer UI assertions |
| Recurring bills/items | high | partial: `recurringJob.test.ts`, `billMatcher.test.ts` | API lifecycle, detect endpoint, monthly summary, active-account validation, soft delete | e2e: `06-recurring.spec.ts` | PARTIAL | Auto-create job side effects and richer UI/database assertions |
| Rules and rule execution | high | covered: `ruleEngine.test.ts`, `ruleEngineV2.test.ts`, `ruleExecutionJob.test.ts` | partial: `rules.test.ts` | e2e: `08-rules.spec.ts` | PARTIAL | Full route auth/validation/household isolation and apply-all persistence |
| Dashboard widgets/layout | high | missing | API summary, charts, budgets, recent transactions, recurring, goals, weekly recap, health score | smoke: `14-dashboard.spec.ts` | PARTIAL | Layout persistence, no-data states, richer UI assertions |
| Reports overview/spending/income/cashflow | critical | partial: report lib tests | partial: `reports.test.ts`, `cashflow.test.ts` | e2e: `09-reports.spec.ts`, `18-cash-flow.spec.ts` | PARTIAL | API route coverage for each report, saved reports, household isolation |
| Net worth snapshots | critical | covered: `netWorthJob.test.ts` | API history/snapshot, household isolation, active account filtering | e2e: `13-wealth.spec.ts`, `14-dashboard.spec.ts` | PARTIAL | Persistence regression with real database |
| Investments, holdings, lots | critical | missing | API holdings list/create validation, allocation, performance, quote, pending lots, active account scoping | e2e: `07-investments.spec.ts` | PARTIAL | Remaining lots CRUD, price updates, recurring investments, precision |
| Investment intelligence/news | medium | missing | missing | missing | MISSING | Provider-off behavior, feed CRUD, projection validation |
| Manual assets | high | missing | API CRUD, household scoping, net-worth breakdown, snapshot on value change | e2e: `15-assets-liabilities.spec.ts` | PARTIAL | UI assertions and soft-delete decision/schema support |
| Liabilities/debt payoff | high | amortization helpers mocked at route layer | API CRUD, debt payoff, amortization, payoff simulator, household scoping | e2e: `15-assets-liabilities.spec.ts` | PARTIAL | Real amortization edge cases and UI assertions |
| Tax accounts and tax reports | high | `taxRoomCalculator.test.ts` edge cases | API CRUD, household summary calculations, linked-account validation | e2e: `09-reports.spec.ts` | PARTIAL | Tax report UI assertions and persistence-backed summary checks |
| Cash-flow forecasting | high | partial: `reportCashFlow.test.ts` | partial: `cashflow.test.ts` | e2e: `18-cash-flow.spec.ts` | PARTIAL | Forecast route edge cases, scenario validation, household isolation |
| AI advisor provider none | critical | missing | missing | missing | MISSING | Provider none works without API key, no secret logging, advice page safe state |
| AI advisor configured providers | high | partial: outbound URL | missing | e2e: `12-advisor.spec.ts`, `11-settings.spec.ts` | PARTIAL | Provider config encryption, invalid key behavior, secret redaction |
| Email SMTP/Resend settings | high | missing | partial: `emailConnector.test.ts` | e2e: `11-settings.spec.ts` | PARTIAL | Email config CRUD, test send, digest trigger, secret redaction |
| IMAP/email connector | high | missing | partial: `emailConnector.test.ts` | missing | PARTIAL | IMAP test endpoint, watcher import flow, invalid credentials |
| Webhooks/API tokens | high | partial: webhook secret untested | partial: `webhooks.test.ts` | e2e: `11-settings.spec.ts` | PARTIAL | Delivery signing, retry/failure recording, token auth flows |
| Push notifications | medium | missing | missing | e2e: `16-notifications.spec.ts` | PARTIAL | Subscribe/unsubscribe API, VAPID config, notification read/clear |
| PWA/offline | medium | missing | missing | missing | MISSING | Offline route, service worker cache smoke, update behavior |
| Admin/system automation | high | partial: `system.test.ts`, cron registry | partial: `audit.test.ts`, `system.test.ts` | e2e: `11-settings.spec.ts` | PARTIAL | Trigger authorization, rate limit, job side effects |
| Security headers/rate limits/CORS | critical | missing | missing | missing | MISSING | Helmet/CORS behavior, auth/general rate limit, production CLIENT_URL enforcement |
| Migrations/deployability | critical | missing | missing | missing | MISSING | Empty DB migrate, prod-like migrate, rollback/deploy smoke |
| Visual/accessibility UX smoke | high | missing | missing | missing | MISSING | Desktop/mobile screenshots, keyboard navigation, accessible names |
