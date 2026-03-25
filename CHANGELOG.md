# Changelog

All notable changes to Kuber are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Kuber uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.0.0-beta] - 2026-03-24

### Added
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
