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

The `Tests` column must cite repo-relative paths to files that exist. `scripts/check-feature-coverage.mjs` fails the gate if a `COVERED` row cites nothing, or cites a path that is not on disk. The script proves the files exist; it cannot prove they test the feature named, so review the citations when a row changes.

Note on E2E citations: the Playwright specs under `tests/e2e/` are real, but `.github/workflows/ci.yml` does not run them today. A row resting mainly on E2E is weaker than it looks.

## Summary

Last reviewed: 2026-07-29

| Status | Count |
| --- | ---: |
| COVERED | 21 |
| PARTIAL | 14 |
| MISSING | 4 |
| BLOCKED | 0 |

## Matrix

| Feature | Risk | Unit | API integration | E2E | Tests | Status | Next required test |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Signup | critical | no | partial | yes | server/tests/routes/authEmailVerification.test.ts<br>tests/e2e/01-auth.spec.ts | PARTIAL | API test asserting signup with an already-registered email is rejected and does not join the existing household |
| Login/session refresh/logout | critical | yes | yes | yes | server/tests/lib/token.test.ts<br>server/tests/routes/authMfaEmail.test.ts<br>client/tests/stores/authStore.test.ts<br>tests/e2e/01-auth.spec.ts | COVERED | No gap tracked; extend with behaviour changes |
| Password reset | critical | yes | yes | yes | server/tests/routes/authResetToken.test.ts<br>server/tests/lib/securityTokens.test.ts<br>tests/e2e/19-forgot-password.spec.ts<br>tests/e2e/20-reset-password.spec.ts | COVERED | No gap tracked; extend with behaviour changes |
| Optional TOTP 2FA | critical | yes | yes | no | server/tests/routes/auth2fa.test.ts<br>server/tests/routes/authMfaEmail.test.ts<br>client/tests/pages/loginMfa.test.tsx | COVERED | No gap tracked; extend with behaviour changes |
| Household membership/invites | critical | no | yes | no | server/tests/routes/householdInvites.test.ts<br>server/tests/routes/adminAuthorization.test.ts | COVERED | No gap tracked; extend with behaviour changes |
| Profile and user settings | high | no | yes | yes | server/tests/routes/settings.test.ts<br>tests/e2e/11-settings.spec.ts | COVERED | No gap tracked; extend with behaviour changes |
| Accounts CRUD | critical | yes | yes | yes | server/tests/routes/accounts.test.ts<br>server/tests/routes/accountEntryAmount.test.ts<br>tests/e2e/02-accounts.spec.ts | COVERED | No gap tracked; extend with behaviour changes |
| Account reconciliation | high | yes | yes | no | server/tests/routes/reconciliation.test.ts<br>server/tests/lib/transactionJournalService.test.ts | PARTIAL | E2E covering a full reconcile session through to a locked statement balance |
| Transactions CRUD | critical | yes | yes | yes | server/tests/routes/transactions.test.ts<br>server/tests/services/transactionService.test.ts<br>tests/e2e/03-transactions.spec.ts | COVERED | No gap tracked; extend with behaviour changes |
| Transfers | critical | yes | partial | no | server/tests/lib/transferConversion.test.ts<br>server/tests/routes/cashflow.test.ts | PARTIAL | API test asserting a transfer cannot target an account in another household |
| Transaction splits | critical | yes | partial | yes | server/tests/routes/splits.test.ts<br>server/tests/lib/transactionSplits.test.ts<br>tests/e2e/03-transactions.spec.ts | PARTIAL | API test asserting splits cannot be attached to another household's transaction; splits.test.ts asserts no household scoping today |
| Duplicate detection/review queue | high | yes | yes | yes | server/tests/routes/duplicates.test.ts<br>server/tests/lib/importDedup.test.ts<br>tests/e2e/17-review-queue.spec.ts | COVERED | No gap tracked; extend with behaviour changes |
| CSV import and mapping | critical | yes | yes | yes | server/tests/routes/import.test.ts<br>server/tests/lib/csvColumnDetector.test.ts<br>server/tests/lib/bankFormats.test.ts<br>tests/e2e/10-import.spec.ts<br>tests/e2e/21-bulk-import-accounts.spec.ts | COVERED | No gap tracked; extend with behaviour changes |
| Export CSV/PDF | high | yes | yes | no | server/tests/routes/exports.test.ts<br>server/tests/lib/csvExport.test.ts | PARTIAL | E2E asserting a CSV export downloads with the expected header row |
| Categories/tags/merchants | high | yes | yes | no | server/tests/routes/categories.test.ts<br>server/tests/lib/defaultCategories.test.ts<br>server/tests/lib/autoCategorize.test.ts | COVERED | No gap tracked; extend with behaviour changes |
| Budgets and budget limits | critical | yes | yes | yes | server/tests/routes/budgets.test.ts<br>server/tests/lib/budgetLimits.test.ts<br>server/tests/lib/autoBudgetJob.test.ts<br>tests/e2e/04-budgets.spec.ts | COVERED | No gap tracked; extend with behaviour changes |
| Goals and contributions | critical | no | yes | yes | server/tests/routes/goals.test.ts<br>tests/e2e/05-goals.spec.ts | COVERED | No gap tracked; extend with behaviour changes |
| Recurring bills/items | high | yes | yes | yes | server/tests/routes/recurring.test.ts<br>server/tests/routes/bills.test.ts<br>server/tests/lib/recurringJob.test.ts<br>server/tests/lib/billMatcher.test.ts<br>tests/e2e/06-recurring.spec.ts | COVERED | No gap tracked; extend with behaviour changes |
| Rules and rule execution | high | yes | yes | yes | server/tests/routes/rules.test.ts<br>server/tests/lib/ruleEngineV2.test.ts<br>server/tests/lib/ruleExecutionJob.test.ts<br>tests/e2e/08-rules.spec.ts | COVERED | No gap tracked; extend with behaviour changes |
| Dashboard widgets/layout | high | no | yes | yes | server/tests/routes/dashboard.test.ts<br>client/tests/pages/dashboard/DashboardPage.test.tsx<br>tests/e2e/14-dashboard.spec.ts | COVERED | No gap tracked; extend with behaviour changes |
| Reports overview/spending/income/cashflow | critical | yes | yes | yes | server/tests/routes/reports.test.ts<br>server/tests/lib/reportingStandard.test.ts<br>server/tests/lib/reportingCore.test.ts<br>client/tests/pages/reports/standardReportClient.test.ts<br>tests/e2e/09-reports.spec.ts | COVERED | No gap tracked; extend with behaviour changes |
| Net worth snapshots | critical | yes | yes | no | server/tests/routes/networth.test.ts<br>server/tests/lib/netWorthJob.test.ts<br>server/tests/lib/reporting/snapshots.test.ts<br>client/tests/pages/reports/components/NetWorthSection.test.tsx | COVERED | No gap tracked; extend with behaviour changes |
| Investments, holdings, lots | critical | yes | yes | yes | server/tests/routes/investments.test.ts<br>server/tests/lib/priceCache.test.ts<br>tests/e2e/07-investments.spec.ts | COVERED | No gap tracked; extend with behaviour changes |
| Investment intelligence/news | medium | no | no | no | — | MISSING | API test for the investmentIntel Monte Carlo asserting reproducible percentiles from a seeded PRNG |
| Manual assets | high | no | yes | yes | server/tests/routes/assets.test.ts<br>tests/e2e/15-assets-liabilities.spec.ts | COVERED | No gap tracked; extend with behaviour changes |
| Liabilities/debt payoff | high | yes | yes | yes | server/tests/routes/liabilities.test.ts<br>server/tests/lib/amortization.test.ts<br>tests/e2e/15-assets-liabilities.spec.ts | COVERED | No gap tracked; extend with behaviour changes |
| Tax accounts and tax reports | high | yes | yes | no | server/tests/routes/taxAccounts.test.ts<br>server/tests/lib/taxRoomCalculator.test.ts | PARTIAL | E2E covering contribution-room display and the over-contribution warning |
| Cash-flow forecasting | high | yes | partial | yes | server/tests/routes/cashflow.test.ts<br>server/tests/lib/reportCashFlow.test.ts<br>tests/e2e/18-cash-flow.spec.ts | PARTIAL | API test asserting the forecast excludes recurring items belonging to another household |
| AI advisor provider none | critical | no | no | yes | tests/e2e/12-advisor.spec.ts | PARTIAL | API test asserting /advisor/chat degrades gracefully when the provider is None, with no outbound call attempted |
| AI advisor configured providers | high | no | no | yes | tests/e2e/11-settings.spec.ts | PARTIAL | API test asserting provider API keys round-trip encrypted and are never returned in a settings response |
| Email SMTP/Resend settings | high | no | partial | yes | server/tests/routes/settings.test.ts<br>tests/e2e/11-settings.spec.ts | PARTIAL | API test asserting SMTP credentials are stored encrypted and redacted on read |
| IMAP/email connector | high | yes | yes | no | server/tests/routes/emailConnector.test.ts<br>server/tests/lib/imapConfig.test.ts | PARTIAL | API test asserting one household cannot read or trigger another household's IMAP connector |
| Webhooks/API tokens | high | yes | yes | no | server/tests/routes/webhooks.test.ts<br>server/tests/lib/webhookSecret.test.ts<br>server/tests/routes/adminAuthorization.test.ts | COVERED | No gap tracked; extend with behaviour changes |
| Push notifications | medium | no | yes | yes | server/tests/routes/push.test.ts<br>server/tests/routes/notifications.test.ts<br>tests/e2e/16-notifications.spec.ts | PARTIAL | API test asserting a push subscription is scoped to its household and removed on logout |
| PWA/offline | medium | no | no | no | — | MISSING | Client test asserting the service worker registers and the app shell renders offline |
| Admin/system automation | high | yes | partial | no | server/tests/routes/system.test.ts<br>server/tests/routes/adminAuthorization.test.ts<br>server/tests/lib/cronRegistry.test.ts | PARTIAL | API test asserting a non-admin member cannot trigger cron jobs |
| Security headers/rate limits/CORS | critical | no | no | no | — | MISSING | Integration test asserting helmet CSP headers are present, CORS rejects a foreign origin, and the auth limiter buckets per client IP |
| Migrations/deployability | critical | yes | no | no | server/tests/prisma/seed.test.ts<br>server/tests/lib/legacyToJournalMigration.test.ts | PARTIAL | CI check asserting `prisma migrate deploy` applies cleanly to an empty database and the schema matches the migration history |
| Visual/accessibility UX smoke | high | no | no | no | — | MISSING | Playwright + axe pass over the main routes asserting no critical accessibility violations |
