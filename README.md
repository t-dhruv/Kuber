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
- Full audit log of sensitive actions
- Household-scoped data — multi-user households supported
- All financial records soft-deleted, never permanently erased

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

## Self-Hosting

Kuber is built to run on your own hardware. The full deployment guide covers quick start, environment variables, HTTPS with Let's Encrypt, backups, updates, and troubleshooting:

**[docs/SELF_HOSTING.md](docs/SELF_HOSTING.md)**

### Quick Start

**Prerequisites:** Docker and Docker Compose v2.

```bash
git clone https://github.com/yourusername/kuber.git
cd kuber
cp .env.example .env
# Edit .env — set JWT_SECRET, JWT_REFRESH_SECRET, and POSTGRES_PASSWORD
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml exec server npx prisma migrate deploy
```

Visit **http://localhost** and create your account on first run.

> At minimum, set `JWT_SECRET` and `JWT_REFRESH_SECRET` to long random strings before going live. Generate them with `openssl rand -base64 64`. See the [full self-hosting guide](docs/SELF_HOSTING.md) for all configuration options, HTTPS setup, and backup instructions.

---

## Development Setup

See [CONTRIBUTING.md](CONTRIBUTING.md) for full instructions. The short version:

```bash
# Prerequisites: Node.js 20+, Docker, npm
git clone https://github.com/yourusername/kuber.git
cd kuber
npm install
cp .env.example .env   # fill in values
make dev               # starts DB + server + client
```

| URL | Service |
|-----|---------|
| http://localhost:3000 | Frontend |
| http://localhost:4000 | Backend API |
| http://localhost:5555 | Prisma Studio (run `make db-studio`) |

Demo credentials after seeding (`make db-seed`): `demo@kuber.app` / `password123`

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

Planned for future releases:

- **Bank sync** — Read-only import via Plaid or MX (no manual entry required)
- **Mobile PWA** — Installable progressive web app with offline support
- **CSV import/export** — Bulk import from bank exports
- **Webhooks** — Trigger external automations on financial events
- **Multiple currencies** — Per-account currency with live exchange rates

Contributions toward any of these are welcome. Open an issue to discuss before starting large work.

---

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) for setup instructions, code conventions, and the PR process.

For bugs, open a [GitHub Issue](https://github.com/yourusername/kuber/issues). For security vulnerabilities, see the reporting instructions in CONTRIBUTING.md — do not use public issues.

---

## License

[MIT](LICENSE) — Copyright (c) 2026 Kuber Contributors
