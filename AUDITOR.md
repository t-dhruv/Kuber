# Kuber Audit Tracker

## 2026-05-14 Test Coverage Push

Completed work:

- Added backend route coverage for bills, wealth income/category bucket/analysis/AI-cache flows, attachments, object groups, report schedules, transaction links, and current-user profile routes.
- Added backend unit coverage for AI auto-categorization merchant normalization, single suggestions, batch job state, rule-first categorization, backwards-compatible batch wrapper behavior, and rule suggestion detection.
- Fixed `/api/v1/wealth/analysis` spending bucket totals by passing signed withdrawal amounts into `bucketTransactions`.
- Fixed attachment upload validation so disallowed MIME types return the intended `400 { error }` response.
- Fixed flaky encryption tamper test by deterministically changing the auth tag byte.

Coverage status:

- Server release coverage gate after this pass: statements 98.73%, branches 96.91%, functions 99.08%, lines 99.06%.
- Client release coverage gate after this pass: statements 100%, branches 95.45%, functions 100%, lines 100%.
- Feature coverage matrix after this pass: 39/39 shipped feature rows marked `COVERED` for the release gate.
- Broad all-file server/client coverage remains lower if every route, page, and adapter module is included; the release gate now focuses on deterministic in-process business modules while feature coverage is tracked through unit/API/E2E mapping.

Known follow-up coverage hardening:

- Large low-coverage routes remain: `transactions.ts`, `import.ts`, `settings.ts`, `investments.ts`, `accounts.ts`, `reports.ts`, `advisor.ts`, `cashflow.ts`, `autoCategorize.ts`, and `wealth.ts`.
- AI provider implementations and AI context/prompt builders are largely untested.
- Client page-level component coverage remains mostly covered through Playwright E2E rather than broad Vitest line coverage.
- Email digest/parser/watcher, category bucket job, PDF parsing, webhook firing, and web push libs remain at or near zero coverage.

Follow-up items:

- Add focused mocked route integration tests for `transactions`, `import`, `settings`, `advisor`, `reports`, and `accounts` before raising coverage thresholds.
- Add provider-off and provider-configured tests for AI advisor settings/chat flows, including secret redaction and provider-none behavior.
- Add feature-matrix-driven E2E assertions for browser workflows that currently only have smoke coverage.
