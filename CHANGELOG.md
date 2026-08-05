# Changelog

All notable changes to Kuber are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Kuber uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.0.0-beta] - 2026-08-05

The first published Kuber. Every earlier version existed only as source — there
has never been a tag, a Release, or a container image, so the advertised install
path had never actually worked. This is that path, made real.

**Installing:** pin the version, because a pre-release never moves `latest`.

```bash
curl -fsSLO https://raw.githubusercontent.com/t-dhruv/Kuber/master/docker-compose.prod.yml
curl -fsSL  https://raw.githubusercontent.com/t-dhruv/Kuber/master/.env.example -o .env
# set POSTGRES_PASSWORD, JWT_SECRET, JWT_REFRESH_SECRET, AI_ENCRYPTION_KEY
echo 'IMAGE_TAG=1.0.0-beta' >> .env
docker compose -f docker-compose.prod.yml up -d
```

See [self-hosting](docs/02-how-to/self-hosting.md) for the full procedure.

### Fixed — a fresh Instance is now usable

- **First run no longer locks its Owner out.** Signup always issued an email
  verification token and login refused unverified Users, but email is optional
  and configured *after* login — so the first User was told to check an inbox
  that would never receive anything. Verification is now skipped when no email
  provider is configured, and applies as before once one is
  ([ADR-0003](docs/adr/0003-email-verification-is-skipped-when-no-provider-is-configured.md)).
- **Registration closes once the first Household exists**, so the change above
  cannot leave an internet-exposed Instance open to strangers. `ALLOW_SIGNUP`
  reopens it deliberately.
- **LAN Instances keep their session.** The refresh cookie set `Secure` whenever
  `NODE_ENV=production`, and browsers discard `Secure` cookies over plain HTTP —
  so a Self-hoster on `http://192.168.1.50` was silently logged out every
  fifteen minutes. `COOKIE_SECURE` now controls this, defaults to enabled, and
  warns at startup when disabled
  ([ADR-0002](docs/adr/0002-cookie-secure-is-configurable.md)).
- **A User belongs to exactly one Household.** Login resolved the session
  Household as the first membership with no ordering, so a User with two
  memberships could land in arbitrary books. A database constraint now permits
  one membership per User, and invite acceptance rejects Users who already have
  one ([ADR-0004](docs/adr/0004-a-user-belongs-to-exactly-one-household.md)).

### Changed — deployment

- **Production runs three services instead of eight**: Postgres, the server, and
  the client. The standalone edge nginx is gone as redundant — the client image
  already contains an nginx that proxies the API, streams server-sent events,
  and serves the SPA — and the client now takes the published port
  ([ADR-0001](docs/adr/0001-three-service-deploy-with-optional-observability.md)).
- **Prometheus, Loki, Promtail and Grafana move to an opt-in overlay**, composed
  alongside the default file. Tracking a budget no longer means operating a
  metrics pipeline.
- **Migrations apply automatically on every start**, so installing and upgrading
  are each a single command.
- **The Instance fails loudly at startup** when a required secret is missing,
  rather than half-running.
- Node is standardised on 24 LTS across the images, CI, and every manifest. The
  image previously shipped Node 25 while CI tested on Node 20.

### Added — release and confidence

- Images published to GHCR as `ghcr.io/t-dhruv/kuber-server` and
  `kuber-client`. Tagging a version builds, publishes, and cuts a Release.
- A database-backed test suite that boots the real application against a
  migrated Postgres, proving the migration history applies to an empty database,
  that a fresh Instance can sign up and log in without email, that the cookie's
  `Secure` flag follows configuration, that security headers and CORS rejection
  and per-client rate limiting hold, and that one Household cannot read
  another's records.
- Critical-path browser tests run against the real Compose stack in CI, so a
  green suite means the deployment works and not merely the code.
- Documentation rewritten against what the software actually does: tutorial,
  how-to guides, environment reference, and explanation.

### Added — application
- **Dashboard** — Net worth widget, weekly recap (spending Δ, net worth Δ, top category, upcoming bills), customizable widget layout with drag-and-drop reorder/hide
- **Transactions** — Cursor pagination, bulk actions, rules engine (auto-categorize), CSV export, CSV import (3-step: upload → column mapping → import), needs-review flag
- **Budget v2** — Fixed / Flexible / Non-Monthly split, left-to-budget banner, savings rate, unbudgeted category alerts
- **Cash Flow** — Monthly grouped bar chart (income/expenses/net), Sankey money flow diagram, merchant breakdown tab
- **Reports v2** — Cash Flow / Spending / Income tabs, filters panel (categories/accounts/tags/amount), Totals vs Change toggle with period comparison, monthly/quarterly grouping, polished transaction list with merchant logos
- **Net Worth** — Daily snapshots, history chart (1M/3M/6M/1Y/ALL), assets vs liabilities breakdown
- **Goals** — Savings goals, debt paydown goals with live account balance, payoff timeline
- **Investments** — Portfolio tracking, live benchmarks (S&P 500/US Bonds/US Stocks via Yahoo Finance), benchmark comparison chart
- **Recurring** — Recurring transaction detection, calendar view with color-coded bill chips
- **Wealth Strategy** — 50/30/20 rule dashboard: salary auto-detection, needs/wants/savings bucket cards, "Where to Cut" ranking, 5-step investment ladder, AI wealth coach
- **AI Advisor** — Multi-provider chat (Claude, OpenAI, Gemini, OpenRouter); conversation history; structured advice library (6 topics × 6 tasks with per-household progress)
- **AI Configuration** — Settings > Integrations: provider selector, model, encrypted API key storage, connection test
- **Auth** — JWT + httpOnly refresh cookie, TOTP 2FA with QR code + backup codes, account lockout (progressive: 15m/1h/24h), password reset via email
- **Settings** — Profile, notifications, display (dark/light/system), 2FA, household management, categories with 50/30/20 bucket assignment, tags, merchants, data export/import, AI provider config
- **Saved Reports** — Save and reload named filter combinations in Reports
- **Audit Log** — All mutations logged with user + action + metadata
- **Self-hostable** — Docker Compose, multi-stage Dockerfiles, Nginx reverse proxy, `.env` configuration
- **Open Source** — MIT license, CONTRIBUTING guide, full README

### Technical
- React 18 + TypeScript + Vite + Tailwind CSS v4
- Express 4 + Prisma 5 + PostgreSQL 16
- TanStack React Query v5, Zustand, React Router v6
- Recharts for all data visualizations
- Playwright E2E tests (smoke + auth), Vitest unit tests (69 passing, 97-100% coverage on lib)
- GitHub Actions CI (lint + build on push/PR)
- GitHub Container Registry publish on release tag

[Unreleased]: https://github.com/tdhruv/kuber/compare/v1.0.0-beta...HEAD
[1.0.0-beta]: https://github.com/tdhruv/kuber/releases/tag/v1.0.0-beta
