# Kuber QA and Testing Strategy

Status: planned
Owner: engineering
Scope: full application, production release readiness

## Problem

Recent defects should have been caught by regression and end-to-end testing. The current quality flow has useful pieces, but it is not yet a production release gate:

- CI runs lint, server unit tests, typecheck, build, and smoke e2e. Release coverage enforcement is handled by the local pre-push hook rather than CI.
- Root scripts expose `test:e2e` and `test:smoke`, but the smoke grep depends on `@smoke` tags being present and consistently applied (`package.json:16`, `package.json:17`).
- Playwright currently runs only Chromium, one worker, and one authenticated storage state (`playwright.config.ts:6`, `playwright.config.ts:8`, `playwright.config.ts:18`).
- E2E global setup creates a user through the UI and writes runtime credentials/state under `tests/e2e/.auth` (`tests/e2e/global-setup.ts:5`, `tests/e2e/global-setup.ts:48`).
- There are 21 e2e spec files and 52 colocated unit test files, but coverage is not currently enforced as a release-quality threshold.

The target is not a promise of "bug free" software. The target is an industry-grade quality system where production defects require a named missed gate, a regression test, and a release-policy improvement.

## Quality Principles

1. Production deploys require passing automated gates, not local confidence.
2. Every critical user journey has at least one e2e test and one lower-level contract or integration test for the business rule behind it.
3. Tests must be deterministic, isolated by household/user, and runnable from a clean checkout.
4. Bugs found after merge get regression tests before the fix is accepted.
5. CI should fail fast on cheap checks; the local pre-push hook owns the deep release coverage gate.
6. Test data must be generated, resettable, and never depend on local browser state.

## Coverage Target

The release target is:

- At least 90% automated code coverage for statements, branches, functions, and lines across production TypeScript code.
- 100% feature coverage, meaning every shipped user-visible feature and critical backend capability has a mapped automated test at the right level: unit, API integration, e2e, or a documented combination.

Current release-gate baseline, measured on 2026-05-15:

- Server Vitest release coverage: 98.73% statements, 96.91% branches, 99.08% functions, 99.06% lines across the deterministic in-process business module coverage scope.
- Client Vitest release coverage: 100% statements, 95.45% branches, 100% functions, 100% lines across the deterministic client utility/store coverage scope.
- Feature coverage matrix: 39/39 shipped feature rows covered for the release gate.
- Shared coverage is not yet enforced as a release gate.
- Smoke e2e now selects a real critical subset, but this is a release-safety smoke layer, not full feature coverage.

Coverage gates should be added in two steps:

1. Ratchet gates: test config fails if coverage drops below the current baseline while new tests raise the floor by package and feature area.
2. Final release gates: the versioned pre-push hook enforces 90% minimum code coverage and blocks push unless the feature coverage matrix is complete.

100% feature coverage is tracked through a feature-to-test matrix, not only through line coverage. A feature is covered only when its happy path, main negative path, authorization or household boundary, and persistence or UI outcome are tested.

## Release Gate Standard

No production release unless all required gates pass:

| Gate | Required on PR | Required on release | Standard |
| --- | --- | --- | --- |
| Install | yes | yes | `npm ci` from clean checkout |
| Lint | yes | yes | root, client, server, shared lint passes |
| Typecheck | yes | yes | client and server `tsc --noEmit` pass |
| Unit tests | yes | yes | all workspace unit tests pass; coverage cannot regress |
| API integration tests | yes | yes | auth, household scoping, financial mutation, import, reporting, AI-off mode |
| E2E smoke | yes | yes | all critical-path smoke specs pass against disposable DB |
| Full e2e regression | no, unless touched area is critical | yes | all browser journeys pass before release; feature coverage matrix is complete |
| Migration check | when Prisma changes | yes | migrate from empty DB and latest prod-like schema |
| Security checks | yes | yes | secret scan, dependency audit, auth/security regression pack |
| Visual/accessibility smoke | for UI changes | yes | responsive screenshots, keyboard basics, no console errors |
| Code coverage | no, ratchet until target is reachable | yes | at least 90% statements, branches, functions, and lines |
| Feature coverage | yes for touched features | yes | 100% of shipped features mapped to passing tests |

## Coverage Model

Use risk-based coverage rather than only percentage targets.

### Unit Tests

Required for:

- Pure financial math and date logic.
- Import parsing and normalization.
- Rule engine, recurring schedule, budget limit, reporting rollup, and journal posting logic.
- Permission and helper functions such as household scoping and soft-delete query helpers.

Standard:

- Fast, deterministic, no network.
- Cover happy path, boundary values, invalid input, and cross-household rejection where applicable.
- Add table-driven tests for financial calculations.

### API Integration Tests

Required for each route group:

- Auth: signup, login, refresh, logout, password reset, optional 2FA, token invalidation.
- Household-scoped data: accounts, transactions, budgets, goals, categories, rules, reports, settings.
- Financial safety: soft delete, no hard delete, decimal precision, transfer linking, transaction splits, journal side effects.
- Import/export: CSV/PDF import, mapping, duplicate handling, export downloads.
- AI optionality: provider set to none, invalid provider config, secret redaction.

Standard:

- Run against a disposable PostgreSQL database in CI.
- Seed through factories, not shared mutable fixtures.
- Assert both HTTP response and persisted database state.
- Include negative tests for unauthorized, forbidden, invalid body, and cross-household access.

### E2E Tests

Required critical journeys:

- Signup, login, refresh session, logout.
- Create/edit/delete account without losing historical financial records.
- Create income, expense, transfer, split, attachment, import, duplicate review.
- Create budget and validate budget impact from transactions.
- Create goal and validate dashboard/report impact.
- Recurring bills lifecycle and upcoming bill display.
- Rules lifecycle and rule application.
- Reports: net worth, cash flow, spending, budget variance, tax, investment, export.
- Settings: profile, categories, tags, AI provider none/configured, integrations, email connector, webhooks.
- PWA/offline basic behavior.
- Admin/system pages that exist in the UI.

Standard:

- Every spec starts from known seeded state or creates its own data.
- Smoke tests are tagged `@smoke`; destructive or slow tests are tagged separately.
- Each page-level spec fails on uncaught page errors and failed API responses unless explicitly expected.
- CI runs Chromium smoke on every PR and full browser matrix before release.

### Visual, Accessibility, and UX Regression

Required for UI-heavy changes:

- Desktop and mobile screenshots for changed pages.
- No overlapping text or controls at mobile, tablet, and desktop breakpoints.
- Keyboard navigation works for forms, dialogs, menus, comboboxes, and tables.
- Accessible names exist for icon buttons and form controls.

Initial target:

- Add automated smoke checks with Playwright assertions and screenshots.
- Add an accessibility tool only after confirming it is worth the dependency cost.

## CI Pipeline Plan

### Phase 1: Make Existing Tests Trustworthy

1. Tag critical e2e tests with `@smoke`.
2. Add a CI PostgreSQL service container.
3. Add e2e database setup/reset script.
4. Run `npm run test:smoke` in CI for every PR.
5. Fail e2e on console errors and unexpected failed API responses through a shared helper.
6. Publish Playwright traces, screenshots, and videos only on failure.

Acceptance:

- A clean CI runner can execute smoke e2e without manual services.
- `test:smoke` actually selects a meaningful subset.
- Auth state and credentials are generated at runtime and ignored by git.

### Phase 2: Add API Integration Coverage

1. Create route-level integration test harness with test database lifecycle.
2. Add factories for user, household, account, transaction, budget, goal, category, rule, and settings data.
3. Cover every non-public route with authorization, validation, happy path, and household isolation tests.
4. Add financial invariants for journal entries, balances, soft deletes, and reports.

Acceptance:

- Every route file has integration coverage or a documented exception.
- Household isolation failures are caught before e2e.
- Financial mutation tests assert database state, not only HTTP status.

### Phase 3: Full Regression Matrix

1. Expand Playwright projects to desktop Chromium, Firefox, WebKit, and mobile Chromium/WebKit.
2. Split e2e into smoke, critical, full regression, visual, and release suites.
3. Add nightly full regression on `master`.
4. Add release workflow requiring full e2e plus migration checks.
5. Add flake quarantine policy: no silent retries without an issue and owner.

Acceptance:

- PRs get fast signal in under 15 minutes.
- Release candidates run full regression in CI.
- Any flaky test is either fixed, quarantined with tracking, or removed from required gates.

### Phase 4: Production Readiness and Feedback Loop

1. Add synthetic production smoke against staging after deploy.
2. Add observability checks for failed jobs, API error rates, frontend error spikes, and migration failures.
3. Add post-release validation checklist: login, dashboard, accounts, transactions, budgets, goals, reports, settings.
4. Require regression tests for all production bug fixes.

Acceptance:

- A deploy is blocked when staging smoke fails.
- Production incidents create a test gap issue and a regression test.
- QA status is visible in PR and release summaries.

## Definition of Done for Features

Every feature or bug fix must include:

- Unit tests for core logic.
- API integration tests for route or persistence behavior.
- E2E coverage for user-visible critical paths.
- Negative tests for auth, validation, and household isolation when relevant.
- Migration verification when schema changes.
- Updated documentation or release notes when behavior changes.

Exceptions require an explicit `Not-tested:` note in the commit and a tracked follow-up.

## Immediate Backlog

1. Enable PostgreSQL in GitHub Actions and run smoke e2e.
2. Add missing `@smoke` tags to critical auth, dashboard, account, transaction, budget, goal, and settings tests.
3. Add shared Playwright failure hooks for console errors and failed API responses.
4. Add route integration harness and factories.
5. Add a feature coverage matrix mapping every shipped feature to unit, API integration, and e2e coverage.
6. Add per-package coverage reports and ratchet gates so coverage cannot decrease.
7. Add household isolation tests for all financial routes.
8. Raise ratchet gates toward 90% statements, branches, functions, and lines.
9. Add migration verification to CI for Prisma changes.
10. Add release workflow gate for full e2e regression.
11. Add QA dashboard section to PR summary with gate status, feature coverage, code coverage, and artifact links.

## Risks

- Full e2e may be slow until tests are parallel-safe.
- Existing tests may depend on order or shared state.
- Browser matrix expansion can expose real cross-browser issues and increase maintenance cost.
- High coverage numbers can create false confidence if critical financial invariants are not explicitly tested.

## Recommended Next Branch

Start with `test/ci-smoke-e2e-gate`.

First deliverable:

- CI PostgreSQL service.
- Reliable e2e DB reset/seed.
- `@smoke` tags on critical e2e specs.
- Required PR smoke e2e gate.

This directly addresses the current broken gate: e2e exists, but CI does not run it.
