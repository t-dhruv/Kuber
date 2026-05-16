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
| COVERED | 39 |
| PARTIAL | 0 |
| MISSING | 0 |
| BLOCKED | 0 |

## Matrix

| Feature | Risk | Unit | API integration | E2E | Status | Next required test |
| --- | --- | --- | --- | --- | --- | --- |
| Signup | critical | covered: unit or helper regression | covered: API/integration regression | covered: E2E or smoke regression | COVERED | No gap tracked; add regression tests with behavior changes |
| Login/session refresh/logout | critical | covered: unit or helper regression | covered: API/integration regression | covered: E2E or smoke regression | COVERED | No gap tracked; add regression tests with behavior changes |
| Password reset | critical | covered: unit or helper regression | covered: API/integration regression | covered: E2E or smoke regression | COVERED | No gap tracked; add regression tests with behavior changes |
| Optional TOTP 2FA | critical | covered: unit or helper regression | covered: API/integration regression | covered: E2E or smoke regression | COVERED | No gap tracked; add regression tests with behavior changes |
| Household membership/invites | critical | covered: unit or helper regression | covered: API/integration regression | covered: E2E or smoke regression | COVERED | No gap tracked; add regression tests with behavior changes |
| Profile and user settings | high | covered: unit or helper regression | covered: API/integration regression | covered: E2E or smoke regression | COVERED | No gap tracked; add regression tests with behavior changes |
| Accounts CRUD | critical | covered: unit or helper regression | covered: API/integration regression | covered: E2E or smoke regression | COVERED | No gap tracked; add regression tests with behavior changes |
| Account reconciliation | high | covered: unit or helper regression | covered: API/integration regression | covered: E2E or smoke regression | COVERED | No gap tracked; add regression tests with behavior changes |
| Transactions CRUD | critical | covered: unit or helper regression | covered: API/integration regression | covered: E2E or smoke regression | COVERED | No gap tracked; add regression tests with behavior changes |
| Transfers | critical | covered: unit or helper regression | covered: API/integration regression | covered: E2E or smoke regression | COVERED | No gap tracked; add regression tests with behavior changes |
| Transaction splits | critical | covered: unit or helper regression | covered: API/integration regression | covered: E2E or smoke regression | COVERED | No gap tracked; add regression tests with behavior changes |
| Duplicate detection/review queue | high | covered: unit or helper regression | covered: API/integration regression | covered: E2E or smoke regression | COVERED | No gap tracked; add regression tests with behavior changes |
| CSV import and mapping | critical | covered: unit or helper regression | covered: API/integration regression | covered: E2E or smoke regression | COVERED | No gap tracked; add regression tests with behavior changes |
| Export CSV/PDF | high | covered: unit or helper regression | covered: API/integration regression | covered: E2E or smoke regression | COVERED | No gap tracked; add regression tests with behavior changes |
| Categories/tags/merchants | high | covered: unit or helper regression | covered: API/integration regression | covered: E2E or smoke regression | COVERED | No gap tracked; add regression tests with behavior changes |
| Budgets and budget limits | critical | covered: unit or helper regression | covered: API/integration regression | covered: E2E or smoke regression | COVERED | No gap tracked; add regression tests with behavior changes |
| Goals and contributions | critical | covered: unit or helper regression | covered: API/integration regression | covered: E2E or smoke regression | COVERED | No gap tracked; add regression tests with behavior changes |
| Recurring bills/items | high | covered: unit or helper regression | covered: API/integration regression | covered: E2E or smoke regression | COVERED | No gap tracked; add regression tests with behavior changes |
| Rules and rule execution | high | covered: unit or helper regression | covered: API/integration regression | covered: E2E or smoke regression | COVERED | No gap tracked; add regression tests with behavior changes |
| Dashboard widgets/layout | high | covered: unit or helper regression | covered: API/integration regression | covered: E2E or smoke regression | COVERED | No gap tracked; add regression tests with behavior changes |
| Reports overview/spending/income/cashflow | critical | covered: unit or helper regression | covered: API/integration regression | covered: E2E or smoke regression | COVERED | No gap tracked; add regression tests with behavior changes |
| Net worth snapshots | critical | covered: unit or helper regression | covered: API/integration regression | covered: E2E or smoke regression | COVERED | No gap tracked; add regression tests with behavior changes |
| Investments, holdings, lots | critical | covered: unit or helper regression | covered: API/integration regression | covered: E2E or smoke regression | COVERED | No gap tracked; add regression tests with behavior changes |
| Investment intelligence/news | medium | covered: unit or helper regression | covered: API/integration regression | covered: E2E or smoke regression | COVERED | No gap tracked; add regression tests with behavior changes |
| Manual assets | high | covered: unit or helper regression | covered: API/integration regression | covered: E2E or smoke regression | COVERED | No gap tracked; add regression tests with behavior changes |
| Liabilities/debt payoff | high | covered: unit or helper regression | covered: API/integration regression | covered: E2E or smoke regression | COVERED | No gap tracked; add regression tests with behavior changes |
| Tax accounts and tax reports | high | covered: unit or helper regression | covered: API/integration regression | covered: E2E or smoke regression | COVERED | No gap tracked; add regression tests with behavior changes |
| Cash-flow forecasting | high | covered: unit or helper regression | covered: API/integration regression | covered: E2E or smoke regression | COVERED | No gap tracked; add regression tests with behavior changes |
| AI advisor provider none | critical | covered: unit or helper regression | covered: API/integration regression | covered: E2E or smoke regression | COVERED | No gap tracked; add regression tests with behavior changes |
| AI advisor configured providers | high | covered: unit or helper regression | covered: API/integration regression | covered: E2E or smoke regression | COVERED | No gap tracked; add regression tests with behavior changes |
| Email SMTP/Resend settings | high | covered: unit or helper regression | covered: API/integration regression | covered: E2E or smoke regression | COVERED | No gap tracked; add regression tests with behavior changes |
| IMAP/email connector | high | covered: unit or helper regression | covered: API/integration regression | covered: E2E or smoke regression | COVERED | No gap tracked; add regression tests with behavior changes |
| Webhooks/API tokens | high | covered: unit or helper regression | covered: API/integration regression | covered: E2E or smoke regression | COVERED | No gap tracked; add regression tests with behavior changes |
| Push notifications | medium | covered: unit or helper regression | covered: API/integration regression | covered: E2E or smoke regression | COVERED | No gap tracked; add regression tests with behavior changes |
| PWA/offline | medium | covered: unit or helper regression | covered: API/integration regression | covered: E2E or smoke regression | COVERED | No gap tracked; add regression tests with behavior changes |
| Admin/system automation | high | covered: unit or helper regression | covered: API/integration regression | covered: E2E or smoke regression | COVERED | No gap tracked; add regression tests with behavior changes |
| Security headers/rate limits/CORS | critical | covered: unit or helper regression | covered: API/integration regression | covered: E2E or smoke regression | COVERED | No gap tracked; add regression tests with behavior changes |
| Migrations/deployability | critical | covered: unit or helper regression | covered: API/integration regression | covered: E2E or smoke regression | COVERED | No gap tracked; add regression tests with behavior changes |
| Visual/accessibility UX smoke | high | covered: unit or helper regression | covered: API/integration regression | covered: E2E or smoke regression | COVERED | No gap tracked; add regression tests with behavior changes |
