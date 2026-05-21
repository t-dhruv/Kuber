# Full Application Gap Audit - 2026-05-07

Scope: Kuber full repository, with emphasis on security, compliance/privacy, UI/UX/accessibility, product feature completeness, documentation accuracy, and test coverage.

This is an engineering audit, not legal advice. Compliance items below identify product, privacy, retention, and operational gaps that should be reviewed against the deployment jurisdiction and user commitments before production use.

## Executive Summary

Overall risk: High.

The application has a broad feature surface and good baseline controls in several areas: JWT plus refresh-cookie sessions, bcrypt password hashing, TOTP support, rate limiting, Helmet, Prisma query scoping by household in most business routes, and no current `npm audit` vulnerabilities. The largest gaps are not missing libraries; they are authorization boundaries, data-retention contradictions, third-party data disclosure controls, and accessibility/workflow polish.

Immediate P0/P1 priorities:

1. Enforce owner/admin authorization for household-wide integrations, API tokens, webhooks, email, AI, and system settings.
2. Resolve household invite/role claims versus implementation.
3. Remove or constrain arbitrary outbound URLs for webhooks and custom AI providers.
4. Stop persisting bearer access tokens in `localStorage`.
5. Encrypt IMAP credentials, webhook secrets, and reset-token storage appropriately.
6. Decide the retention model: true soft delete or documented hard-delete/export semantics.
7. Fix production insecure defaults and missing/contradictory self-hosting docs.
8. Address high-impact UI accessibility gaps in navigation drawers, import flows, advice chat, and custom widgets.

## Evidence Collected

Automated/static checks:

- `npm audit --json`: 0 vulnerabilities across 1138 dependencies.
- `git ls-files .env server/.env .env.example docker-compose.prod.yml docker-compose.yml`: `.env.example`, compose files tracked; live `.env` files are ignored.
- `git status --short`: existing modified source files were present before this audit doc was written; this audit did not change app source code.
- Vercel Web Interface Guidelines fetched from `https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md`.
- Static scans for token storage, secrets, outbound fetches, file upload/storage, unsafe rendering/navigation, UI roles, hardcoded locales, and docs/product claim mismatches.

Areas inspected:

- `client/src`, especially auth store/API client, app shell, navigation, import, advice, reports, settings, transactions, accounts, and shared UI.
- `server/src`, especially auth, settings, webhooks, API tokens, email/IMAP, AI providers, uploads, imports, attachments, system routes, middleware, and startup config.
- `shared/src`, Prisma schema/migrations, `docker-compose*.yml`, nginx config, workflows, README, docs, and E2E tests.

## Security Findings

### S1 - Household-wide admin actions lack owner/admin authorization

Severity: High  
Category: OWASP A01 Broken Access Control  
Evidence: [apiTokens.ts](C:/_Code/_selfHosted/Kuber/server/src/routes/apiTokens.ts:15), [webhooks.ts](C:/_Code/_selfHosted/Kuber/server/src/routes/webhooks.ts:23), [settings.ts](C:/_Code/_selfHosted/Kuber/server/src/routes/settings.ts:900), [settings.ts](C:/_Code/_selfHosted/Kuber/server/src/routes/settings.ts:1232), existing membership-role check contrast in [settings.ts](C:/_Code/_selfHosted/Kuber/server/src/routes/settings.ts:155), multi-user claim in [README.md](C:/_Code/_selfHosted/Kuber/README.md:35)

Any authenticated household member can create API tokens, modify webhook targets/secrets, and change AI/email integrations for the household. This is privilege escalation inside shared households.

Remediation: add reusable `requireHouseholdRole(['owner', 'admin'])` middleware and apply it to API tokens, webhooks, email connector, AI config, system settings, household invites, and other household-wide controls.

### S2 - SSRF and data exfiltration through arbitrary outbound URLs

Severity: High  
Category: OWASP A10 SSRF / privacy compliance  
Evidence: [webhooks.ts](C:/_Code/_selfHosted/Kuber/server/src/routes/webhooks.ts:9), [webhookFire.ts](C:/_Code/_selfHosted/Kuber/server/src/lib/webhookFire.ts:51), [settings.ts](C:/_Code/_selfHosted/Kuber/server/src/routes/settings.ts:870), [settings.ts](C:/_Code/_selfHosted/Kuber/server/src/routes/settings.ts:944), [custom.ts](C:/_Code/_selfHosted/Kuber/server/src/lib/ai/custom.ts:4), [openai.ts](C:/_Code/_selfHosted/Kuber/server/src/lib/ai/openai.ts:8), provider-sharing docs in [04-explanation.md](C:/_Code/_selfHosted/Kuber/docs/04-explanation.md:152)

Users can configure arbitrary webhook URLs and custom AI base URLs. The server can be induced to call internal services, link-local metadata endpoints, or attacker-controlled endpoints. For AI, financial context can be sent externally with custom headers.

Remediation: validate URL scheme and host, resolve DNS and block private/loopback/link-local ranges, deny redirects to blocked targets, allowlist known AI providers by default, make custom providers admin-only and opt-in, and document exact data sent externally.

### S3 - Access token persists in browser storage

Severity: High  
Category: OWASP A07 Identification and Authentication Failures  
Evidence: [authStore.ts](C:/_Code/_selfHosted/Kuber/client/src/stores/authStore.ts:14), [authStore.ts](C:/_Code/_selfHosted/Kuber/client/src/stores/authStore.ts:27), [api.ts](C:/_Code/_selfHosted/Kuber/client/src/lib/api.ts:10), [useChatStream.ts](C:/_Code/_selfHosted/Kuber/client/src/pages/advice/hooks/useChatStream.ts:222)

The access token is stored in Zustand persistence under `localStorage`. Any XSS, malicious browser extension, or local browser compromise can steal the bearer token until expiry or refresh.

Remediation: keep access tokens in memory only, or move to httpOnly same-site cookies with CSRF protection. Update the streaming advisor path so it does not read tokens from localStorage.

### S4 - IMAP mailbox credentials stored plaintext in DB preferences

Severity: High  
Category: OWASP A02 Cryptographic Failures  
Evidence: [emailConnector.ts](C:/_Code/_selfHosted/Kuber/server/src/routes/emailConnector.ts:4), [emailConnector.ts](C:/_Code/_selfHosted/Kuber/server/src/routes/emailConnector.ts:56), [emailConnector.ts](C:/_Code/_selfHosted/Kuber/server/src/routes/emailConnector.ts:105), [imapWatcher.ts](C:/_Code/_selfHosted/Kuber/server/src/lib/imapWatcher.ts:138)

Mailbox credentials are stored in user preferences without the AES-GCM helper used elsewhere. DB or backup exposure leaks real email credentials, expanding compromise beyond Kuber.

Remediation: encrypt IMAP config at rest with `server/src/lib/encryption.ts`, migrate existing records, and force affected users to rotate mailbox/app passwords.

### S5 - Webhook secrets and password reset tokens are retrievable from DB

Severity: Medium  
Category: OWASP A02 Cryptographic Failures  
Evidence: [webhooks.ts](C:/_Code/_selfHosted/Kuber/server/src/routes/webhooks.ts:26), [webhooks.ts](C:/_Code/_selfHosted/Kuber/server/src/routes/webhooks.ts:44), [webhooks.ts](C:/_Code/_selfHosted/Kuber/server/src/routes/webhooks.ts:73), [auth.ts](C:/_Code/_selfHosted/Kuber/server/src/routes/auth.ts:269), [auth.ts](C:/_Code/_selfHosted/Kuber/server/src/routes/auth.ts:293)

Webhook signing secrets are stored and returned in full. Reset tokens are stored directly in preference keys for their lifetime.

Remediation: encrypt webhook secrets and never return them after creation. Hash reset tokens before storage and lookup, then delete on use or expiry.

### S6 - Production compose allows insecure fallback credentials and plain HTTP

Severity: Medium  
Category: OWASP A05 Security Misconfiguration  
Evidence: [docker-compose.prod.yml](C:/_Code/_selfHosted/Kuber/docker-compose.prod.yml:17), [docker-compose.prod.yml](C:/_Code/_selfHosted/Kuber/docker-compose.prod.yml:35), [docker-compose.prod.yml](C:/_Code/_selfHosted/Kuber/docker-compose.prod.yml:145), [docker-compose.prod.yml](C:/_Code/_selfHosted/Kuber/docker-compose.prod.yml:167), nginx HTTP listener in [docker-compose.prod.yml](C:/_Code/_selfHosted/Kuber/docker-compose.prod.yml:78), tutorial starts on HTTP in [README.md](C:/_Code/_selfHosted/Kuber/README.md:85)

Production can come up with `CHANGE_ME`, `admin`, and `changeme` defaults for Postgres/Grafana/bundled automation services. Plain HTTP is supported without an enforced HTTPS/HSTS path.

Remediation: use `${VAR:?must be set}` in production compose, document a required secret checklist, ship a hardened TLS reverse-proxy example, and add startup checks for obviously unsafe values.

## Compliance and Privacy Gaps

### C1 - External processor disclosure is incomplete

Severity: Medium  
Evidence: privacy claims in [README.md](C:/_Code/_selfHosted/Kuber/README.md:9), AI docs in [ai-advisor.md](C:/_Code/_selfHosted/Kuber/docs/02-how-to/ai-advisor.md:76), financial context assembly in [advisor.ts](C:/_Code/_selfHosted/Kuber/server/src/routes/advisor.ts:77), custom endpoint support in [settings.ts](C:/_Code/_selfHosted/Kuber/server/src/routes/settings.ts:944)

Docs say data stays yours and mention provider choice, but do not define exactly which financial/PII fields leave the server, what third-party processors exist, whether custom providers are trusted, or how retention works.

Remediation: add `PRIVACY.md` with a processor table, data classes sent externally, default retention, user-controlled deletion/export semantics, AI/email/webhook disclosure, and self-host operator responsibilities.

### C2 - Security disclosure policy is incomplete

Severity: Medium  
Evidence: no tracked `SECURITY.md`; CONTRIBUTING references Security tab or `SECURITY.md` in [CONTRIBUTING.md](C:/_Code/_selfHosted/Kuber/CONTRIBUTING.md:190)

The repo asks reporters to use private disclosure but does not provide an in-repo security policy.

Remediation: add `SECURITY.md` with supported versions, contact, expected acknowledgement/remediation windows, and safe harbor language.

### C3 - Retention promise conflicts with hard-delete behavior

Severity: Critical / P0 product-compliance gap  
Evidence: soft-delete claim in [README.md](C:/_Code/_selfHosted/Kuber/README.md:36), deletion discussion in [04-explanation.md](C:/_Code/_selfHosted/Kuber/docs/04-explanation.md:58), hard delete API in [transactions.ts](C:/_Code/_selfHosted/Kuber/server/src/routes/transactions.ts:397), UI permanent deletion in [SettingsPage.tsx](C:/_Code/_selfHosted/Kuber/client/src/pages/settings/SettingsPage.tsx:2880)

Public docs say financial records are soft-deleted and never permanently erased, but the app exposes permanent transaction deletion.

Remediation: make an explicit retention decision. If hard delete is intended, update claims and document retention/export/delete behavior. If soft delete is intended, replace hard delete with archival flags and adjust purge workflows.

## UI and UX Findings

### U1 - Mobile sidebar lacks modal accessibility behavior

Severity: High  
Evidence: [AppShell.tsx](C:/_Code/_selfHosted/Kuber/client/src/components/layout/AppShell.tsx:64), [Sidebar.tsx](C:/_Code/_selfHosted/Kuber/client/src/components/layout/Sidebar.tsx:109)

Mobile navigation behaves as a visual drawer only. Background content remains interactive, focus is not trapped, Escape does not close, and focus is not restored.

Remediation: implement drawer modal behavior on mobile: body scroll lock, `Escape` close, focus trap, inert background, and focus restoration.

### U2 - Import flow has keyboard and labeling gaps

Severity: High  
Evidence: [DropZone.tsx](C:/_Code/_selfHosted/Kuber/client/src/pages/import/components/DropZone.tsx:124), [DropZone.tsx](C:/_Code/_selfHosted/Kuber/client/src/pages/import/components/DropZone.tsx:164), [MappingConfirmStep.tsx](C:/_Code/_selfHosted/Kuber/client/src/pages/import/components/MappingConfirmStep.tsx:200)

The upload/drop zone and mapping controls are mouse-forward and not consistently programmatically labeled.

Remediation: use a real labeled upload button/input, add `htmlFor`/`aria-label` to account and mapping selectors, and support keyboard activation for drag/drop equivalents.

### U3 - Advice chat composer and conversation actions are not fully accessible

Severity: High  
Evidence: [ChatInput.tsx](C:/_Code/_selfHosted/Kuber/client/src/pages/advice/components/ChatInput.tsx:42), [ChatInput.tsx](C:/_Code/_selfHosted/Kuber/client/src/pages/advice/components/ChatInput.tsx:53), [ConversationSidebar.tsx](C:/_Code/_selfHosted/Kuber/client/src/pages/advice/components/ConversationSidebar.tsx:109), [ChatMessage.tsx](C:/_Code/_selfHosted/Kuber/client/src/pages/advice/components/ChatMessage.tsx:67)

The textarea lacks a reliable accessible name, icon-only buttons rely on `title`, conversation rows use click targets, and actions are hover-revealed.

Remediation: add explicit labels, use buttons/links for interactive rows, make actions focus-visible/touch-visible, and increase hit targets.

### U4 - Custom widgets expose ARIA roles without full keyboard contracts

Severity: High  
Evidence: [DataTable.tsx](C:/_Code/_selfHosted/Kuber/client/src/components/ui/DataTable.tsx:124), [SegmentControl.tsx](C:/_Code/_selfHosted/Kuber/client/src/components/ui/SegmentControl.tsx:26), [FilterBar.tsx](C:/_Code/_selfHosted/Kuber/client/src/components/ui/FilterBar.tsx:73)

Sortable headers, segment tabs, and filter listboxes have roles/click behavior but incomplete keyboard semantics.

Remediation: prefer native controls or implement roving focus, arrow-key navigation, `Enter`/`Space`, selected state, and screen-reader announcements.

### U5 - Dense import/report workflows lose context and strain mobile layouts

Severity: Medium  
Evidence: [ImportPreview.tsx](C:/_Code/_selfHosted/Kuber/client/src/pages/import/components/ImportPreview.tsx:301), [MappingConfirmStep.tsx](C:/_Code/_selfHosted/Kuber/client/src/pages/import/components/MappingConfirmStep.tsx:221), [ImportPage.tsx](C:/_Code/_selfHosted/Kuber/client/src/pages/import/ImportPage.tsx:34), [ReportsPage.tsx](C:/_Code/_selfHosted/Kuber/client/src/pages/reports/ReportsPage.tsx:3853)

Import tables are dense on narrow screens. Important state such as import step, advice mode, report tab, date preset, filters, and drilldowns lives only in component state.

Remediation: add mobile card/scroll layouts for dense tables and serialize state into query params or resumable drafts.

### U6 - Locale, copy, and dark-mode polish are inconsistent

Severity: Low  
Evidence: hardcoded dates in [SearchModal.tsx](C:/_Code/_selfHosted/Kuber/client/src/components/search/SearchModal.tsx:50), [ReportsPage.tsx](C:/_Code/_selfHosted/Kuber/client/src/pages/reports/ReportsPage.tsx:3041), [TransactionsPage.tsx](C:/_Code/_selfHosted/Kuber/client/src/pages/transactions/TransactionsPage.tsx:2015), theme issue in [app.css](C:/_Code/_selfHosted/Kuber/client/src/app.css:57)

Several views hardcode `en-US` date formatting, some loading/copy strings use `...`, and dark mode does not consistently declare `color-scheme`.

Remediation: centralize locale/date/currency formatting, standardize ellipsis copy, and set theme-aware `color-scheme`.

## Feature and Product Gaps

### F1 - Household invites and role model are incomplete

Severity: Critical / P0  
Evidence: docs promise invite flow in [household.md](C:/_Code/_selfHosted/Kuber/docs/02-how-to/household.md:21), UI exposes invite in [SettingsPage.tsx](C:/_Code/_selfHosted/Kuber/client/src/pages/settings/SettingsPage.tsx:1167), backend returns email-not-implemented message in [settings.ts](C:/_Code/_selfHosted/Kuber/server/src/routes/settings.ts:234), signup always creates a new household in [auth.ts](C:/_Code/_selfHosted/Kuber/server/src/routes/auth.ts:87), role docs in [household.md](C:/_Code/_selfHosted/Kuber/docs/02-how-to/household.md:36), broad household mutations in [accounts.ts](C:/_Code/_selfHosted/Kuber/server/src/routes/accounts.ts:374)

Implementation supports shared household data, but invite redemption and documented role restrictions are not complete.

Backlog: implement invite redemption, emailed invite links, role-based authorization, per-member ownership semantics, and tests; or de-scope docs to current behavior.

### F2 - Audit log claims exceed implementation

Severity: High / P1  
Evidence: README claim in [README.md](C:/_Code/_selfHosted/Kuber/README.md:34), docs claim in [04-explanation.md](C:/_Code/_selfHosted/Kuber/docs/04-explanation.md:187), API exists in [audit.ts](C:/_Code/_selfHosted/Kuber/server/src/routes/audit.ts:7), Settings nav lacks audit view around [SettingsPage.tsx](C:/_Code/_selfHosted/Kuber/client/src/pages/settings/SettingsPage.tsx:131)

There is an audit route/model, but no visible owner-facing audit UI and several sensitive flows are not clearly instrumented.

Backlog: define auditable events, add UI, instrument auth/2FA/household/integration changes, and add regression tests.

### F3 - 2FA recovery docs do not match behavior

Severity: High / P1  
Evidence: guide says disable requires TOTP in [2fa.md](C:/_Code/_selfHosted/Kuber/docs/02-how-to/2fa.md:75), owner recovery claim in [2fa.md](C:/_Code/_selfHosted/Kuber/docs/02-how-to/2fa.md:93), actual disable uses password in [SettingsPage.tsx](C:/_Code/_selfHosted/Kuber/client/src/pages/settings/SettingsPage.tsx:806), API self-disable in [auth.ts](C:/_Code/_selfHosted/Kuber/server/src/routes/auth.ts:392)

Docs describe admin recovery and TOTP disable, while implementation supports self-disable by password.

Backlog: implement admin recovery and TOTP-confirmed disable, or update docs and UI copy.

### F4 - Self-hosting and onboarding docs are broken or contradictory

Severity: High / P1  
Evidence: README references missing `SELF_HOSTING.md` in [README.md](C:/_Code/_selfHosted/Kuber/README.md:87), missing `DEV.md` in [README.md](C:/_Code/_selfHosted/Kuber/README.md:93), tutorial broken link in [01-tutorial.md](C:/_Code/_selfHosted/Kuber/docs/01-tutorial.md:187), compose says no clone in [docker-compose.prod.yml](C:/_Code/_selfHosted/Kuber/docker-compose.prod.yml:2) but bind-mounts repo files in [docker-compose.prod.yml](C:/_Code/_selfHosted/Kuber/docker-compose.prod.yml:76)

First-run docs and deployment expectations do not reliably match the repo.

Backlog: add missing docs, fix compose prerequisite language, update signup tutorial to include household name, and add link validation.

### F5 - Roadmap is stale

Severity: Medium / P2  
Evidence: future roadmap entries in [README.md](C:/_Code/_selfHosted/Kuber/README.md:162), [README.md](C:/_Code/_selfHosted/Kuber/README.md:164), [README.md](C:/_Code/_selfHosted/Kuber/README.md:165), [README.md](C:/_Code/_selfHosted/Kuber/README.md:166), existing import in [ImportPage.tsx](C:/_Code/_selfHosted/Kuber/client/src/pages/import/ImportPage.tsx:114), webhooks mounted in [index.ts](C:/_Code/_selfHosted/Kuber/server/src/index.ts:264), FX route in [fx.ts](C:/_Code/_selfHosted/Kuber/server/src/routes/fx.ts:17), PWA offline page orphaned in [OfflinePage.tsx](C:/_Code/_selfHosted/Kuber/client/src/pages/OfflinePage.tsx:3)

CSV import/export, webhooks, and multi-currency are listed as future despite partial or shipped implementation. PWA is partial.

Backlog: split roadmap into shipped, partial, and future; define PWA offline acceptance criteria.

### F6 - Reference docs contain stale paths

Severity: Medium / P2  
Evidence: bad relative link in [00-index.md](C:/_Code/_selfHosted/Kuber/docs/02-how-to/00-index.md:31), stale source paths in [03-reference.md](C:/_Code/_selfHosted/Kuber/docs/03-reference.md:204)

Backlog: add markdown/path validation in CI and sweep docs.

### F7 - Test coverage misses high-risk promises

Severity: Medium / P2  
Evidence: skipped reset password success test in [20-reset-password.spec.ts](C:/_Code/_selfHosted/Kuber/tests/e2e/20-reset-password.spec.ts:36), webhook smoke-only test in [11-settings.spec.ts](C:/_Code/_selfHosted/Kuber/tests/e2e/11-settings.spec.ts:128)

No dedicated E2E coverage was found for household invite/join, role restrictions, audit log, 2FA setup/backup-code recovery, account lockout, webhook CRUD/delivery, or PWA/offline behavior.

Backlog: prioritize auth/household/security integration tests, then webhooks and PWA acceptance coverage.

## Recommended Backlog Order

P0:

1. Household invite redemption and role enforcement, or docs de-scope.
2. Retention model decision and implementation/docs alignment.
3. Admin-only controls for API tokens, webhooks, email, AI, and system routes.

P1:

1. SSRF guard and custom AI provider governance.
2. Access-token storage redesign.
3. Encrypt IMAP/webhook/reset-token sensitive data.
4. Production compose hardening and HTTPS/TLS documentation.
5. Audit-log acceptance criteria, instrumentation, and UI.
6. High-impact accessibility fixes for mobile nav, import, advice, and custom widgets.

P2:

1. `PRIVACY.md` and `SECURITY.md`.
2. Docs link validation and self-hosting/onboarding repair.
3. Roadmap refresh.
4. URL-persisted/resumable workflow state.
5. Locale/date/currency formatting cleanup.
6. Expanded E2E suite for promised behavior.

## Open Questions

- Should household members have equal access to all data, or should owner/admin/member roles materially restrict actions?
- Should Kuber guarantee soft delete for financial records, or intentionally support permanent deletion for privacy/data minimization?
- Should custom AI endpoints be a first-class feature, admin-only advanced mode, or removed for safer defaults?
- Should self-host production prioritize a single reverse-proxy path, or support both bundled nginx and external proxy deployments?

## Verification Notes

This audit changed only this document. No application source code was edited. Runtime E2E testing was not run because the task was a read-only audit and the repository already had unrelated modified files. Automated dependency audit passed with zero reported vulnerabilities.
