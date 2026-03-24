# Kuber — Auditor Log

> Living document. Updated after every sprint. Tracks progress, tech debt, and open issues.
> Last updated: 2026-03-24 (Sprint 11 complete)

---

## Project Status

| Area | Status | Notes |
|------|--------|-------|
| Core auth | 🟢 Working | JWT + refresh token family tracking + TOTP 2FA + account lockout |
| Dashboard | 🟢 Working | API shape fixed |
| Accounts | 🟢 Enhanced | Net Worth chart (1M/3M/6M/1Y/ALL), assets/liabilities panel |
| Net Worth History | 🟢 Done | Daily snapshots, history API, performance chart in AccountsPage |
| Transactions | 🟢 Working | API shape fixed, bulk actions fixed, PATCH→PUT |
| Budget | 🟢 Enhanced | v2: Fixed/Flexible/Non-Monthly sections, unbudgeted alert, budgetType selector, Left-to-Budget banner |
| Cash Flow | 🟢 Working | NaN crash fixed, income/expenses as objects; Sankey chart implemented |
| Reports | 🟢 Enhanced | Reports v2: Filters panel (categories/accounts/tags/amount), Totals/Change toggle with period comparison, Monthly/Quarterly grouping, Cash Flow grouped bar+line chart, polished transaction rows + full summary sidebar |
| Recurring | 🟢 Working | Runtime crash fixed, MonthlySummary corrected |
| Goals | 🟢 Working | currentAmount/targetAmount fixed in display + forms |
| Investments | 🟢 Enhanced | Live benchmarks via Yahoo Finance (SPY/BND/VTI) with 15-min cache + fallback |
| Settings | 🟢 Working | Notifications fixed; 2FA setup/disable UI; SMTP test; Integrations section |
| Notifications | 🟢 Working | Read/write envelope corrected |
| AI Advisor | 🟢 Done | Real multi-provider (Claude/OpenAI/Gemini/OpenRouter); conversation persistence |
| Advice Library | 🟢 Done | 6 topics × 6 tasks, task checklist UI, per-household completion tracking |
| Tags Management | 🟢 Done | Settings > Tags CRUD with color swatches and transaction counts |
| Transaction Stats | 🟢 Done | Summary panel: count, spending, largest, average, date range |
| Data Downloads | 🟢 Done | Transactions + account balances CSV wired to real endpoints |
| Debt Goals | 🟢 Done | Pay Down tab: debt cards, live balance, payoff summary, Add modal |
| Cash Flow Merchants | 🟢 Done | Merchant breakdown tab with ranked list + percentage bars |
| Recurring Calendar | 🟢 Done | Calendar view toggle: monthly grid with color-coded bill chips |
| Weekly Recap | 🟢 Done | Dashboard widget: spending Δ, net worth Δ, top category, upcoming bills |
| Saved Report Views | 🟢 Done | Save/load/delete named filter combos in Reports page |
| Delete Transactions | 🟢 Done | Settings > Data Management: delete before date (soft-delete, wired) |
| Dashboard Customization | 🟢 Done | Widget reorder/hide with HTML5 drag-and-drop + persisted layout |
| Spending Cumulative Chart | 🟢 Done | Dashboard SpendingWidget: this month vs last month day-by-day |
| Wealth Strategy | 🟢 Done | 50/30/20 dashboard: salary input, bucket cards, alerts, Where to Cut, Investment Ladder, AI coach |
| Merchants Settings | 🟢 Done | Settings > Merchants: search, sort, inline edit, delete |
| E2E Tests | 🟢 Done | Playwright setup + smoke tests (7) + auth tests (3); `npm run test:e2e` |
| Unit Tests | 🔴 None | Server lib unit tests still missing |
| Docker prod | 🟢 Done | Multi-stage Dockerfiles, docker-compose.prod.yml, nginx/prod.conf |
| GitHub Actions CI | 🟢 Done | .github/workflows/ci.yml — lint + build on push/PR |
| CSV Export | 🟢 Done | Transactions, Accounts, Reports — GET /export/csv endpoints |
| 2FA | 🟢 Done | TOTP setup/enable/disable, QR code, backup codes, 2-step login |
| SMTP Email | 🟢 Done | Nodemailer transport, password reset sends, test-email endpoint |
| Audit Log | 🟢 Done | AuditLog table, fire-and-forget logAudit() on all mutations |
| Rules Engine | 🟢 Done | Full CRUD UI + rule builder + apply/apply-all endpoints |
| Cursor Pagination | 🟢 Done | Transactions: base64url cursor, stable sort, backwards compat |
| CSP Headers | 🟢 Done | Helmet CSP with self + unsafe-inline for Tailwind |
| Account Lockout | 🟢 Done | 5/8/10 attempts → 15m/1h/24h, unlock via email |
| Open Source docs | 🟢 Done | LICENSE (MIT), CONTRIBUTING.md, README.md (full rewrite) |

**Legend:** 🟢 Done | ⚠️ Partial / Needs work | 🔴 Not done / Broken

---

## Sprint Log

### Sprint 11 — Wealth Strategy: 50/30/20 Dashboard + AI Coach (2026-03-24)
**Goal:** Smart wealth-building feature: 50/30/20 rule analysis, personalized insights, investment ladder, AI coaching.

**Completed:**
- [x] `Category.bucketType` field added (needs | wants | savings | uncategorized), default 'uncategorized'
- [x] `WealthAiCache` model — per-household 24h AI analysis cache
- [x] Migration `20260324100000_add_wealth_strategy` — ALTER categories + CREATE wealth_ai_cache
- [x] `seedCategoryBuckets()` — keyword-matched defaults seeded for all existing categories
- [x] `GET/PUT /api/v1/wealth/income` — read/write monthly net take-home income (via UserPreference)
- [x] `GET /api/v1/wealth/analysis?month=YYYY-MM` — full 50/30/20 analysis: targets, actuals, per-bucket category breakdown, delta, alerts, savingsCapacity, investmentLadder (5 steps, status from Goals)
- [x] `GET/PUT /api/v1/wealth/category-buckets` — read/override per-category bucket assignment
- [x] `POST /api/v1/wealth/category-buckets/reset` — reset to keyword defaults
- [x] `POST /api/v1/wealth/ai-analysis` — 24h cached AI wealth coaching: prompt with income + bucket data, calls configured provider, returns analysis text
- [x] `client/src/pages/wealth/WealthPage.tsx` — new page at `/wealth`:
  - Income setup card (inline input if not set, edit row if set)
  - 3 bucket cards (Needs/Wants/Savings) with color-coded progress bars, category breakdowns, delta lines
  - Alerts section (danger/warning per bucket)
  - "Where to Cut" — top 5 over-budget categories ranked by overage
  - Investment Ladder — 5 steps with status icons + months-to-fund projection
  - AI Analysis Panel — auto-fetches, 24h cache, refresh button, not-configured fallback
- [x] Sidebar: "Wealth" nav item (Layers icon) between Reports and Budget
- [x] `App.tsx` — lazy route `/wealth` added
- [x] `SettingsPage.tsx` — Categories section: bucket badge + inline dropdown per category, Reset defaults button
- [x] TypeScript: zero errors client + server

---

### Sprint 10 — Reports v2: Filters, Change View, Monthly Grouping, Cash Flow Bar Chart (2026-03-24)
**Goal:** Close the Monarch reports gap — filters panel, period comparison, monthly/quarterly grouping, polished transaction list.

**Completed:**
- [x] `server/src/routes/reports.ts` — filter params (`categoryIds`, `accountIds`, `tagIds`, `minAmount`, `maxAmount`) wired into `/spending`, `/income`, `/cashflow` queries
- [x] `GET /reports/spending/compare` + `GET /reports/income/compare` — prior period computed, returns `{items[{current,prior,delta,deltaPercent}], currentTotal, priorTotal, totalDelta}`
- [x] `GET /reports/spending/monthly` + `GET /reports/income/monthly` — category × month matrix, returns `{months[], series[{id,name,icon,data[]}]}`
- [x] `ReportsPage.tsx` — `FiltersPanel` dropdown: Categories/Accounts/Tags/Amount tabs, active badge, clear all, click-outside close
- [x] `extraParams` wired through `CashFlowTab` and `CategoryTab` so filters apply to all fetches
- [x] Totals/Change toggle in Spending/Income tabs; Change view = grouped bar (current=blue, prior=gray) with delta tooltip
- [x] Monthly/Quarterly grouping dropdown (quarterly computed client-side by summing 3 months)
- [x] Cash Flow tab: default view changed to grouped bar (Income green + Expenses red + Net dashed line); Sankey toggle preserved
- [x] Transaction rows: merchant avatar circle, category emoji+name subtitle, account pill chip, amount+date stacked column
- [x] Summary sidebar: Total spending/income, Largest transaction, Average, First/Last transaction dates — all fields complete
- [x] TypeScript: zero errors client + server

---

### Sprint 9 — Live Investment Benchmarks, Saved Reports, Dashboard Customization (2026-03-24)
**Goal:** Polish and close remaining Monarch feature gaps — live market data, saved views, customizable dashboard.

**Completed:**
- [x] `getLiveBenchmarks()` in `priceCache.ts` — fetches SPY/BND/VTI historical data via Yahoo Finance, computes period returns (1M/3M/6M/1Y/ALL/YTD), 15-min cache, falls back to hardcoded values on error
- [x] `investments.ts` — replaced hardcoded benchmark object with `await getLiveBenchmarks()`
- [x] `SavedReport` model + migration `20260323210000_add_saved_reports` — already existed from prior work
- [x] `GET/POST/DELETE /api/v1/reports/saved` — already existed; `SavedViewsDropdown` + `SaveViewModal` in ReportsPage already built
- [x] `DELETE /api/v1/transactions/before?date=` — already existed (soft-delete, returns count)
- [x] `SettingsPage.tsx` DataSection — wired `handleDeleteHistory` to real mutation (was stub); shows count in success toast
- [x] `DashboardPage.tsx` — connected existing `CustomizeModal` + `WIDGET_META` skeleton to page render; layout fetched from `GET /api/v1/settings/dashboard-layout`, saved via `PUT`; ordered/filtered columns applied
- [x] `SpendingWidget` cumulative chart — already fully wired (this month vs last month lines)
- [x] TypeScript: zero errors client + server

---

### Sprint 8 — Debt Goals, Merchant Breakdown, Calendar, Weekly Recap, Merchants UI (2026-03-23)
**Goal:** Post-release backlog — fill remaining Monarch feature gaps.

**Completed:**
- [x] `GET /goals/accounts-for-debt` — CREDIT_CARD/LOAN accounts for goal linking
- [x] Debt goals: live `currentAmount` from linked account balance, `linkedAccount` in response
- [x] `DebtGoalCard`: paid off / remaining / progress bar / account chip
- [x] `AddDebtGoalModal`: name, total debt, monthly payment, account dropdown, payoff date
- [x] `PayDownSummary`: total debt remaining / total monthly / estimated debt-free date
- [x] `ContributeModal` updated to be debt-aware
- [x] Cash Flow `/month`: `byMerchant` on income + expenses (displayName fallback chain)
- [x] `CashFlowPage`: Merchants tab with ranked list, percentage bars, tx count, Show more
- [x] `RecurringPage`: Calendar view — monthly grid, color chips (green/red/blue), legend
- [x] `GET /dashboard/weekly-recap`: spending Δ, net worth Δ, top category, upcoming bills
- [x] `WeeklyRecapWidget`: 3 stat tiles + upcoming bills strip + empty state
- [x] `GET/PUT/DELETE /settings/merchants` with tx counts + null-safe delete
- [x] `MerchantsSection`: search, sort toggle, inline edit, show more, delete confirm
- [x] TypeScript: zero errors client + server

---

### Sprint 7 — Structured Advice Library + Tags + Transaction Stats (2026-03-23)
**Goal:** Release polish — structured advice, tags management, transaction stats, wired data downloads.

**Completed:**
- [x] `AdviceTopic` / `AdviceTask` / `UserAdviceProgress` schema models + migration `20260323200000`
- [x] Seeded 6 advice topics × 6 tasks each: Emergency Fund, Budget, Pay Off Debt, Start Investing, Buy a Home, Protect Yourself
- [x] `GET /api/v1/advice/topics` — returns topics + tasks + per-household completion state
- [x] `PUT /api/v1/advice/topics/:topicId/tasks/:taskId` — toggle task completion
- [x] `AdvicePage` restructured: AI Chat tab (preserved) + Advice Library tab (category pills, topic cards, progress bars, slide-in checklist panel with optimistic toggles)
- [x] `GET/POST/PUT/DELETE /api/v1/settings/tags` with transaction counts
- [x] Settings > Tags section: color swatch picker, CRUD modals, delete confirmation
- [x] Transaction summary stats panel (count, total spending, largest, average, date range) — computed client-side
- [x] Data section downloads wired: transactions CSV + account balances CSV via authenticated blob download
- [x] TypeScript: zero errors client + server

**Already done (discovered during gap analysis, not new work):**
- Categories management UI — was already fully implemented in SettingsPage
- Dark mode (Light/Dark/System) — already in DisplaySection
- Savings Rate in Reports — already computed
- Dashboard spending chart (this month vs last) — SpendingWidget already existed
- Dashboard onboarding checklist — GettingStartedChecklist already existed

---

### Sprint 6 — Net Worth History + Real AI Advisor (2026-03-23)
**Goal:** Net worth as a first-class feature + real multi-provider AI advisor replacing mock.

**Completed (net worth):**
- [x] `NetWorthSnapshot` model + migration `20260323100000_add_net_worth_snapshots`
- [x] `server/src/lib/netWorthJob.ts` — `takeNetWorthSnapshot()` upserts daily assets/liabilities/netWorth per household
- [x] Fire-and-forget startup snapshot in `index.ts`
- [x] `GET /api/v1/networth/history?range=1M|3M|6M|1Y|ALL` — returns current + history + change since oldest snapshot
- [x] `POST /api/v1/networth/snapshot` — manual trigger endpoint
- [x] `AccountsPage`: `NetWorthChart` component (Recharts LineChart, range tabs), assets/liabilities breakdown panel, `monthChange` prop on `AccountRow`

**Completed (AI advisor):**
- [x] `advisor.ts` rewritten — real AI via `getAiClientForHousehold` + `getChatContext` + `chatSystemPrompt`
- [x] Conversation persistence — saves user + assistant to `ConversationMessage` table
- [x] `GET /api/v1/advisor/conversations` — list with lastMessage preview
- [x] `GET /api/v1/advisor/conversations/:id/messages` — load history
- [x] `DELETE /api/v1/advisor/conversations/:id`
- [x] Graceful unconfigured-provider: returns friendly 200 with Settings CTA (not 500)
- [x] `AdvicePage`: conversation sidebar, load past conversations, delete, Settings deeplink button
- [x] TypeScript: zero errors on client and server

**Deferred:**
- Per-account 30-day balance delta (needs account balance history — future sprint)
- AI streaming responses (SSE) — future enhancement

---

### Sprint 5 — Budget v2 (2026-03-23)
**Goal:** Monarch-parity on budgeting — Fixed/Flexible/Non-Monthly split, income budgeting, unbudgeted detection.

**Completed (backend):**
- [x] Added `budgetType` field to `Budget` model (String, default `'FLEXIBLE'`, values: `FIXED | FLEXIBLE | NON_MONTHLY`)
- [x] Migration: `20260323000000_add_budget_type_to_budget` (run `make db-migrate` to apply)
- [x] `GET /api/v1/budgets` — new `expenses.byType.{fixed,flexible,nonMonthly}` breakdown; `unbudgeted[]` array; `budgetType` on every `CategoryRow`
- [x] `POST /api/v1/budgets` — accepts `budgetType` (validated, defaults to `FLEXIBLE`)
- [x] `PUT /api/v1/budgets/:id` — new endpoint for updating `budgetType` and/or `amount`

**Completed (frontend):**
- [x] `BudgetPage.tsx` rewritten — Fixed / Flexible / Non-Monthly collapsible sections with row counts and subtotals
- [x] "By Type | By Group" toggle — new type view + legacy group view both functional
- [x] Budget type selector on edit (badge when viewing, `<select>` when editing)
- [x] `UnbudgetedAlert` — dismissible banner listing categories with spend but no budget, each with "+ Add Budget" CTA
- [x] `LeftToBudgetBanner` — prominent income − expenses = leftToBudget with green/red coloring
- [x] Savings Rate badge with color thresholds (≥20% green, 10-19% yellow, <10% red)
- [x] TypeScript: zero errors on client and server

**Deferred:**
- Rollover budgets (carry unspent amounts to next month) — future sprint

---

### Sprint 4 — Foundation & Release Infrastructure (2026-03-23)
**Goal:** Production deployability, test coverage baseline, open source readiness, CSV export.

**Completed (infra):**
- [x] `server/Dockerfile` — multi-stage: builder (TS compile + Prisma generate) → runner (prod deps only); CMD runs `prisma migrate deploy` before start
- [x] `client/Dockerfile` — multi-stage: builder (Vite build) → nginx:alpine static server with SPA fallback
- [x] `docker-compose.prod.yml` — postgres (internal only) + server + client + nginx on `kuber_network`
- [x] `nginx/prod.conf` — reverse proxy: `/api/` → server:4000, `/` → client:80; gzip; security headers; 120s timeout for AI streaming
- [x] `.env.example` — full documentation of all env vars with generation instructions
- [x] `.github/workflows/ci.yml` — lint + build on every push/PR (E2E commented out pending DB service setup)

**Completed (testing):**
- [x] `@playwright/test` installed at root; `test:e2e` + `test:smoke` scripts added
- [x] `playwright.config.ts` — Chromium, sequential, baseURL localhost:3000
- [x] `tests/e2e/helpers/auth.ts` — reusable login helper; confirmed seed credentials: `demo@kuber.app` / `password123`
- [x] `tests/e2e/smoke.spec.ts` — 7 smoke tests: login/logout, dashboard, accounts, transactions, budget, goals, settings
- [x] `tests/e2e/auth.spec.ts` — 3 auth tests: unauthenticated redirect, invalid credentials error, valid login

**Completed (open source):**
- [x] `LICENSE` — MIT 2026, Kuber Contributors
- [x] `CONTRIBUTING.md` — setup guide, branch strategy, Conventional Commits, PR checklist, code conventions
- [x] `README.md` — full rewrite: badges, features, Docker quick-start, tech stack table, roadmap

**Completed (features):**
- [x] `server/src/lib/csvExport.ts` — `toCSV()` + `setCsvHeaders()` utility (RFC 4180 compliant)
- [x] `GET /api/v1/transactions/export/csv` — date/account filters, 10k row limit
- [x] `GET /api/v1/accounts/export/csv` — all accounts for household
- [x] `GET /api/v1/reports/export/csv` — type=spending|income|cashflow with date range

**Deferred:**
- Server lib unit tests (Vitest) — Sprint 5+
- E2E tests against real DB in CI (needs postgres service container) — post-release

---

### Sprint 3 — Security Hardening + Rules Engine + Cursor Pagination (2026-03-20)
**Goal:** TD-003/004/005/014/017/018 security hardening; TD-012 Rules UI; TD-015 cursor pagination.

**Completed (server):**
- [x] TD-003: Refresh token family tracking — `lib/token.ts`, token hashing (SHA-256), family invalidation on reuse
- [x] TD-004: TOTP 2FA — setup/enable/disable/validate/use-backup routes; QR code via `otplib` + `qrcode`; 8 bcrypt-hashed backup codes
- [x] TD-005: SMTP email — `lib/email.ts` with Nodemailer; `sendPasswordResetEmail`, `sendAccountLockoutEmail`, `sendTestEmail`
- [x] TD-014: Audit log — `AuditLog` Prisma model; `logAudit()` hooked into transactions, accounts, budgets, goals, rules
- [x] TD-017: CSP headers — Helmet ContentSecurityPolicy in `index.ts`
- [x] TD-018: Account lockout — 5/8/10+ failed attempts → 15m/1h/24h; lockout email sent
- [x] TD-012: Rules engine — `routes/rules.ts` with CRUD, `ruleMatches()`, `applyActionsToTransaction()`, apply/apply-all
- [x] TD-015: Cursor pagination on transactions — base64url `{ date, id }` cursor, composite WHERE, backwards compat offset mode
- [x] `GET /auth/2fa/status` endpoint; `POST /settings/email/test` endpoint

**Completed (client):**
- [x] `LoginPage.tsx` — 2-step login: PasswordStep → TotpStep (TOTP + backup code toggle)
- [x] `useAuth.ts` — added `useTotpStatus`, `useTotpSetup`, `useTotpEnable`, `useTotpDisable`, `useTotpValidate`, `useTotpBackup`
- [x] Settings → Security — `TwoFactorCard`: QR setup flow → confirm code → backup codes display; disable with password
- [x] Settings → Integrations — SMTP config display + "Send test email" button
- [x] `RulesPage.tsx` — rule list with reorder, rule builder modal (conditions + actions), apply/apply-all
- [x] App routing + sidebar: `/rules` route added, `Zap` icon in nav
- [x] TypeScript: zero errors on both client and server (post-sprint)

**Deferred:**
- E2E test infrastructure (Sprint 4)
- Open source docs: LICENSE, CONTRIBUTING (Sprint 4)
- Audit log viewer UI (future)

---

### Sprint 2 — UI Stability & Sankey Charts (2026-03-19)
**Goal:** Fix remaining UI bugs found during E2E: blank pages, broken filters, missing Sankey charts.

**Completed:**
- [x] Added `ErrorBoundary` to `App.tsx` — wraps all protected routes, prevents blank-page crashes
- [x] Fixed `TransactionsPage` filter categories — replaced hardcoded `DEFAULT_CATEGORIES` with real `/categories` API call
- [x] Updated `Category` interface to match server API shape (`emoji`, `groupName` instead of `icon`, `group`)
- [x] Implemented Sankey chart in `CashFlowPage` — income categories → Cash Flow node → expense groups + Savings
- [x] Implemented Sankey chart in `ReportsPage` — Income → top expense categories + Savings (Money Flow section)
- [x] TypeScript: zero errors on both client and server

**Deferred:**
- SMTP email, TOTP 2FA, refresh token families, account lockout (Sprint 3)
- E2E test infrastructure (Sprint 4)

---

### Sprint 1 — Full App Bug Fix (2026-03-19)
**Goal:** Fix all API shape mismatches that made the entire app broken after the server refactor.

**Completed:**
- [x] Full bug audit — identified 5 runtime crashes + 9 broken pages
- [x] Fixed all 10 pages (AccountsPage, TransactionsPage, BudgetPage, CashFlowPage, ReportsPage, RecurringPage, GoalsPage, InvestmentsPage, SettingsPage, DashboardPage)
- [x] Added `GET /api/v1/categories` server route (was missing, caused 404)
- [x] Added `DELETE /api/v1/settings/household/members/:id` server route (was missing)
- [x] Rewrote `POST /transactions/bulk` with action-based dispatch
- [x] TypeScript: zero errors on both client and server
- [x] Committed: `cf4cbbf`

**Deferred to Sprint 2:**
- ESLint strict config + Husky pre-commit
- GitHub Actions CI

---

### Sprint 0 — Foundation & Governance (2026-03-19)
**Goal:** Set up working standards, audit the codebase, establish agent workflow.

**Completed:**
- [x] Created `CLAUDE.md` with full working standards
- [x] Created `AUDITOR.md` (this file)
- [x] Full bug audit — API shape mismatch analysis across all 10 pages

---

## Tech Debt Register

| ID | Item | Priority | Sprint | Notes |
|----|------|----------|--------|-------|
| TD-001 | ~~API response shape mismatch — all pages broken~~ | ✅ Done | Sprint 1 | Fixed in commit cf4cbbf |
| TD-002 | ~~No tests at all (unit or E2E)~~ | ✅ Partial | Sprint 4 | E2E smoke + auth tests added; unit tests still missing |
| TD-003 | Refresh token family tracking not implemented | P1 | Sprint 2 | Security risk: stolen refresh tokens not detectable |
| TD-004 | 2FA (TOTP) not implemented | P1 | Sprint 2 | Planned feature |
| TD-005 | No SMTP email sender | P1 | Sprint 2 | Password reset emails don't actually send |
| TD-006 | AI Advisor is mock-only | P2 | Sprint 5 | Multi-provider (Claude/OpenAI/Gemini/Ollama/OpenRouter) needed |
| TD-007 | ~~No Nginx reverse proxy in Docker~~ | ✅ Done | Sprint 4 | nginx/prod.conf + docker-compose.prod.yml |
| TD-008 | ~~No production Docker Compose~~ | ✅ Done | Sprint 4 | docker-compose.prod.yml created |
| TD-009 | Seed data not realistic enough | P2 | Sprint 4 | Needs multi-year data, multiple personas |
| TD-010 | ~~No LICENSE file~~ | ✅ Done | Sprint 4 | MIT License added |
| TD-011 | ~~No CONTRIBUTING.md~~ | ✅ Done | Sprint 4 | CONTRIBUTING.md added |
| TD-012 | Rules engine has no UI | P3 | Sprint 7 | Backend exists, frontend missing |
| TD-013 | Plaid/MX bank sync not built | P3 | Sprint 7+ | Manual entry only for now |
| TD-014 | No audit log table for financial changes | P1 | Sprint 2 | Security/compliance requirement |
| TD-015 | No cursor-based pagination on transactions | P2 | Sprint 5 | May load all records |
| TD-016 | TypeScript strict mode not enforced | P2 | Sprint 1 | `any` types exist |
| TD-017 | No CSP headers configured in Helmet | P1 | Sprint 2 | XSS mitigation |
| TD-018 | Account lockout after failed logins missing | P1 | Sprint 2 | Brute force protection |
| TD-019 | OpenAPI/Swagger docs missing | P3 | Sprint 6 | Developer experience |
| TD-020 | ~~No multi-stage Docker builds~~ | ✅ Done | Sprint 4 | server/Dockerfile + client/Dockerfile both multi-stage |

---

## Open Issues

| ID | Issue | Status | Sprint |
|----|-------|--------|--------|
| BUG-001 | ~~DashboardPage API shape mismatch~~ | ✅ Fixed | cf4cbbf |
| BUG-002 | ~~All pages had API shape mismatches~~ | ✅ Fixed | cf4cbbf |
| BUG-003 | Email password reset sends nothing | 🔴 Open | Sprint 3 |
| BUG-004 | ~~Pages go blank on crash — no error boundary~~ | ✅ Fixed | Sprint 2 |
| BUG-005 | ~~Transaction filter uses hardcoded category IDs~~ | ✅ Fixed | Sprint 2 |
| BUG-006 | ~~Sankey chart placeholders in CashFlow + Reports~~ | ✅ Fixed | Sprint 2 |

---

## Feature Backlog

| ID | Feature | Priority | Phase |
|----|---------|----------|-------|
| FEAT-001 | TOTP 2FA | P1 | Phase 2 |
| FEAT-002 | SMTP email (Nodemailer) | P1 | Phase 2 |
| FEAT-003 | AI Advisor multi-provider | P2 | Phase 5 |
| FEAT-004 | AI Advisor: Claude, OpenAI, Gemini, Ollama, OpenRouter | P2 | Phase 5 |
| FEAT-005 | Nginx + prod Docker Compose | P1 | Phase 4 |
| FEAT-006 | Multi-stage Docker builds | P2 | Phase 4 |
| FEAT-007 | Plaid bank sync | P3 | Phase 7+ |
| FEAT-008 | MX bank sync | P3 | Phase 7+ |
| FEAT-009 | Rules engine UI | P3 | Phase 7 |
| FEAT-010 | Audit log (financial change history) | P1 | Phase 2 |
| FEAT-011 | Account lockout / brute force protection | P1 | Phase 2 |
| FEAT-012 | Refresh token family (theft detection) | P1 | Phase 2 |
| FEAT-013 | Cursor-based pagination for transactions | P2 | Phase 5 |
| FEAT-014 | OpenAPI/Swagger documentation | P3 | Phase 6 |
| FEAT-015 | GitHub Actions CI pipeline | P1 | Phase 1 |

---

## Security Audit Checklist

- [ ] All routes with body have Zod validation
- [ ] All protected routes use `requireAuth`
- [ ] All DB queries scoped to `householdId`
- [ ] JWT secrets are long (64+ chars) and randomized
- [ ] Refresh tokens stored hashed
- [ ] Refresh token invalidated on password change
- [ ] Rate limiting on auth endpoints (10 req/15min)
- [ ] CORS allows only CLIENT_URL in production
- [ ] Helmet CSP configured
- [ ] bcrypt rounds ≥ 12
- [ ] No sensitive data in logs
- [ ] Account lockout after N failed attempts
- [ ] TOTP 2FA implemented
- [ ] Audit log for financial record changes

---

## Definition of Done (per feature)

- [ ] Feature works as intended
- [ ] TypeScript: no `any` without comment
- [ ] Zod validation on all new routes
- [ ] Unit tests written (if applicable)
- [ ] E2E/smoke test covers the feature
- [ ] `AUDITOR.md` updated
- [ ] No new ESLint errors

---

## Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-19 | Custom JWT, not Auth0 | Self-hostable, no external dependency |
| 2026-03-19 | Turborepo monorepo | Shared types, unified builds |
| 2026-03-19 | SMTP over email SaaS | User configures their own provider |
| 2026-03-19 | Manual bank entry first | Plaid/MX integration in later phase |
| 2026-03-19 | Multi-provider AI advisor | User configures preferred AI model |
| 2026-03-19 | MIT License | Open source, permissive |
