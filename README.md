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
- Household-scoped data — several Users per Household, each User in exactly one
- Export and deletion controls for self-hosted data ownership

### AI Advisor
- Chat with an AI financial advisor that has context about your Accounts and spending
- Bring your own provider: **Claude, OpenAI, Gemini, OpenRouter, Nvidia NIM, Ollama**, any OpenAI-compatible endpoint, or disable entirely
- Off by default. Your API key is stored encrypted and never leaves your server; the
  financial summaries the advisor reasons over are sent to whichever provider you
  configure, so run Ollama locally if that matters to you

### Self-Hosting
- Single `docker compose up` deployment
- Nginx reverse proxy included
- SMTP email (Gmail or any provider) — user-configurable in Settings
- No external services required; everything runs on your hardware

---

## Documentation

| Doc | What's Inside |
|-----|-----------------|
| [docs/](docs/README.md) | Documentation index — tutorial, how-to guides, reference |
| [docs/01-tutorial.md](docs/01-tutorial.md) | From nothing to your first recorded Transaction |
| [docs/02-how-to/](docs/02-how-to/00-index.md) | How-to index — Accounts, Transactions, Budgets, Goals, Investments, MFA, Household |
| [docs/02-how-to/self-hosting.md](docs/02-how-to/self-hosting.md) | Deploying and running an Instance |
| [docs/02-how-to/backup.md](docs/02-how-to/backup.md) | Backing up, restoring, and verifying a restore |
| [docs/02-how-to/https.md](docs/02-how-to/https.md) | Serving Kuber over HTTPS behind your own proxy |
| [docs/03-reference.md](docs/03-reference.md) | Environment variables, ports, and the CSV import format |
| [docs/04-explanation.md](docs/04-explanation.md) | Why self-host, the data model, the 50/30/20 approach, and the security posture |
| [CONTEXT.md](CONTEXT.md) | The domain language — what an Instance, a Household, a Split and a Transfer each mean |
| [docs/adr/](docs/adr/) | Architecture decisions and their consequences |
| [AGENTS.md](AGENTS.md) | Contributor and agent guide |

---

## Self-Hosting

Kuber is built to run on your own hardware. The default production stack is
three services — Postgres, the server, and the client — and the client is the
edge: it serves the app and proxies the API, so nothing else needs to sit in
front of it.

**It does not terminate TLS.** On a trusted LAN you can run it as-is over plain
HTTP. To expose an Instance to the internet, front it with your own reverse
proxy or tunnel and let that handle certificates. See
[ADR-0001](docs/adr/0001-three-service-deploy-with-optional-observability.md).

### Quick Start

**Prerequisites:** Docker and Docker Compose v2.

```bash
git clone https://github.com/t-dhruv/Kuber.git
cd Kuber
cp .env.example .env
# Edit .env — set JWT_SECRET, JWT_REFRESH_SECRET, AI_ENCRYPTION_KEY, and POSTGRES_PASSWORD
echo 'IMAGE_TAG=1.0.0-beta' >> .env
docker compose -f docker-compose.prod.yml up -d
```

Kuber is in beta, so the version must be pinned: `latest` only ever points at a
stable release, and pre-releases are published under their exact version alone.

Migrations apply themselves — the server runs them on every start, before it
accepts traffic.

Visit **http://localhost** and create your User and Household on first run. No
email server is required — see [ADR-0003](docs/adr/0003-email-verification-is-skipped-when-no-provider-is-configured.md).

> At minimum, set `JWT_SECRET`, `JWT_REFRESH_SECRET`, `AI_ENCRYPTION_KEY`, and `POSTGRES_PASSWORD` before going live. Generate JWT secrets with `openssl rand -base64 64` and the encryption key with `openssl rand -hex 32`. See `.env.example` for every option.

To run Prometheus, Loki, Promtail and Grafana alongside the stack, compose the
optional overlay:

```bash
docker compose -f docker-compose.prod.yml -f docker-compose.observability.yml up -d
```

---

## Development Setup

See [AGENTS.md](AGENTS.md) for the contributor guide.

```bash
# Prerequisites: Node.js 24, Docker, npm
git clone https://github.com/t-dhruv/Kuber.git
cd Kuber
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

For bugs, open a [GitHub Issue](https://github.com/t-dhruv/Kuber/issues). For security vulnerabilities, see the reporting instructions in CONTRIBUTING.md — do not use public issues.

---

## License

[MIT](LICENSE) — Copyright (c) 2026 Kuber Contributors
