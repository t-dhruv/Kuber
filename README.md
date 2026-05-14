# Kuber

**Self-hostable personal finance. Open source.**

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Docker](https://img.shields.io/badge/Docker-ready-2496ED?logo=docker&logoColor=white)](docker-compose.prod.yml)

Kuber is a full-featured personal finance web app you run on your own server. Track accounts, transactions, budgets, investments, and recurring bills — with an AI advisor that works with the provider of your choice. No subscriptions. No third-party bank connections. Your data stays yours.

---

![Kuber dashboard screenshot](docs/screenshot.png)

---

## Features

### Finance Tracking
- **Dashboard** — Net worth snapshot, budget progress, spending charts, upcoming bills, savings goals
- **Accounts** — Checking, savings, credit cards, investments, loans, and custom account types
- **Transactions** — Full CRUD with search, filters, bulk edit, category management, and a rules engine for auto-categorization
- **Cash Flow** — Monthly and yearly income vs. expenses with interactive charts
- **Budgets** — Category-based budgets with inline editing and real-time progress tracking
- **Reports** — Spending and income breakdowns with donut charts and flexible date ranges
- **Recurring Bills** — Track bills with paid/upcoming status and monthly summaries
- **Goals** — Savings goals with contribution tracking and progress rings
- **Investments** — Holdings tracking, allocation breakdown, and performance over time

### Security
- JWT access tokens (15 min) + httpOnly refresh cookie (7 days)
- Two-factor authentication (TOTP — works with any authenticator app)
- Account lockout after failed login attempts
- Audit log for financial record changes
- Household-scoped data — multi-user households supported
- Export and deletion controls for self-hosted data ownership

### AI Advisor
- Chat with an AI financial advisor that has context about your accounts and spending
- Bring your own provider: **Claude, OpenAI, Gemini, Ollama, OpenRouter**, or disable entirely
- API key stored encrypted; never leaves your server

### Self-Hosting
- Single `docker compose up` deployment
- Nginx reverse proxy included
- SMTP email (Gmail or any provider) — user-configurable in Settings
- No external services required; everything runs on your hardware

---

## Documentation

Kuber comes with full documentation for self-hosted users and contributors:

| Doc | What's Inside |
|-----|-----------------|
| [📖 Tutorial](docs/01-tutorial.md) | Install Kuber + record your first transaction in 30min |
| [🍳 How-to Guides](docs/02-how-to/00-index.md) | HTTPS, email, backups, accounts, budgets, 2FA, AI Advisor |
| [📋 Reference](docs/03-reference.md) | Env vars, Docker services, API endpoints, CSV format |
| [💡 Explanations](docs/04-explanation.md) | Why self-hosting, data model, security, 50/30/20 rule |

**Contributors:** See [Development Setup](#development-setup), [DEV.md](DEV.md), and [docs/audits/](docs/audits/) for QA reports, regression tests, and audit plans.

---

## Self-Hosting

Kuber is built to run on your own hardware. The full deployment guide covers quick start, environment variables, HTTPS with Let's Encrypt, backups, updates, and troubleshooting:

**[docs/SELF_HOSTING.md](docs/SELF_HOSTING.md)**

### Quick Start

**Prerequisites:** Docker and Docker Compose v2.

```bash
git clone https://github.com/yourusername/kuber.git
cd kuber
cp .env.example .env
# Edit .env — set JWT_SECRET, JWT_REFRESH_SECRET, AI_ENCRYPTION_KEY, and POSTGRES_PASSWORD
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml exec server npx prisma migrate deploy
```

Visit **http://localhost** and create your account on first run.

> At minimum, set `JWT_SECRET`, `JWT_REFRESH_SECRET`, `AI_ENCRYPTION_KEY`, and `POSTGRES_PASSWORD` before going live. Generate JWT secrets with `openssl rand -base64 64` and the encryption key with `openssl rand -hex 32`. See the [full self-hosting guide](docs/SELF_HOSTING.md) for all configuration options, HTTPS setup, and backup instructions.

---

## Development Setup

See [DEV.md](DEV.md) for all Makefile commands and setup instructions.

```bash
# Prerequisites: Node.js 20+, Docker, npm
git clone https://github.com/yourusername/kuber.git
cd kuber
npm install
cp .env.example .env   # fill in values
make dev-server       # starts backend on localhost:9002
make dev-client      # starts frontend on localhost:9001
```

| URL | Service |
|-----|---------|
| http://localhost:9001 | Frontend |
| http://localhost:9002 | Backend API |
| http://localhost:5555 | Prisma Studio (run `make db-studio`) |

Demo credentials after seeding (`make db-seed`): `demo@kuber.app` / `password123`

> **Full contributor guide**: See [CONTRIBUTING.md](CONTRIBUTING.md)

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS v4 |
| State | Zustand (auth/UI), TanStack React Query v5 (server state) |
| Router | React Router v6, lazy-loaded pages |
| Charts | Recharts |
| Backend | Node.js, Express 4, TypeScript |
| ORM | Prisma 5 |
| Database | PostgreSQL 16 |
| Auth | JWT + httpOnly cookie + TOTP 2FA |
| Email | Nodemailer (SMTP, user-configurable) |
| AI | Multi-provider: Claude, OpenAI, Gemini, Ollama, OpenRouter |
| Infra | Docker Compose, Nginx, Turborepo monorepo |
| Testing | Vitest (unit), Playwright (E2E) |

---

## Project Structure

```
kuber/
├── client/          # React + Vite frontend
│   └── src/
│       ├── components/  # Shared UI components
│       ├── pages/       # Route-level page components
│       ├── hooks/       # Custom React hooks
│       ├── stores/      # Zustand state stores
│       └── lib/         # Axios client, utilities
├── server/          # Node.js + Express backend
│   └── src/
│       ├── routes/      # API route handlers
│       ├── middleware/  # Auth, error handling, rate limiting
│       └── lib/         # Prisma client, AI, email, encryption
│   └── prisma/          # Schema, migrations, seed data
└── shared/          # Shared TypeScript types and enums
```

---

## Roadmap

Shipped or partially shipped:

- **CSV import/export** — CSV transaction import and data export are available
- **Webhooks** — Owner/admin-managed webhook delivery is available
- **Multiple currencies** — Currency fields and FX routes exist; deeper reporting polish remains in progress
- **Mobile PWA** — Installable shell, cached app navigation, offline route, and offline status banner are available; offline write queues remain future work
- **Household invites** — Owner/admin-created email invite links and new-user signup redemption are available
- **2FA owner recovery** — Household owners can reset 2FA for non-owner members

Planned for future releases:

- **Bank sync** — Read-only import via Plaid or MX
- **Offline write queues** — queue account/transaction changes while offline and replay them when connectivity returns

Contributions toward any of these are welcome. Open an issue to discuss before starting large work.

---

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) for setup instructions, code conventions, and the PR process.

For bugs, open a [GitHub Issue](https://github.com/yourusername/kuber/issues). For security vulnerabilities, see the reporting instructions in CONTRIBUTING.md — do not use public issues.

---

## License

[MIT](LICENSE) — Copyright (c) 2026 Kuber Contributors
