# Reference: Kuber Technical Specifications

This document is a technical reference — concise, factual, and comprehensive. Use it to look up specific configuration values, API endpoints, or file formats.

---

## Environment Variables

All variables live in a single `.env` file at the repository root. The production Docker Compose file loads it automatically.

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | — | Full PostgreSQL connection string. Must use the same password as `POSTGRES_PASSWORD`. Format: `postgresql://kuber:PASSWORD@postgres:5432/kuber_db` |
| `POSTGRES_PASSWORD` | Yes | — | Password for the `kuber` database user. Used by both the `postgres` service and `DATABASE_URL`. |
| `JWT_SECRET` | Yes | — | Secret for signing access tokens (15-minute lifetime). Generate with `openssl rand -base64 64`. Minimum 64 characters. |
| `JWT_REFRESH_SECRET` | Yes | — | Secret for signing refresh tokens (7-day lifetime). Must be different from `JWT_SECRET`. |
| `PORT` | No | `4000` | Port the Express server listens on inside its container. The nginx proxy routes to this internally. |
| `NODE_ENV` | No | `production` | Set to `production` for deployments. Controls error verbosity and security headers. |
| `CLIENT_URL` | Yes | `http://localhost` | Public-facing URL of your Kuber instance (no trailing slash). Used for CORS and email links. |
| `API_RATE_LIMIT_WINDOW_MS` | No | `60000` | General API rate-limit window in milliseconds. |
| `API_RATE_LIMIT_MAX` | No | `2000` | General API requests allowed per window per client IP. |
| `AUTH_RATE_LIMIT_WINDOW_MS` | No | `900000` | Auth endpoint rate-limit window in milliseconds. |
| `AUTH_RATE_LIMIT_MAX` | No | `50` | Auth requests allowed per window per client IP. |
| `SMTP_HOST` | No | — | SMTP server hostname. Leave blank to disable email. Example: `smtp.gmail.com`. |
| `SMTP_PORT` | No | `587` | SMTP port. `587` for STARTTLS (recommended), `465` for SSL. |
| `SMTP_USER` | No | — | SMTP username / login email. |
| `SMTP_PASS` | No | — | SMTP password or app-specific password. |
| `SMTP_FROM` | No | — | The "From" address in outgoing emails. Example: `Kuber <noreply@yourdomain.com>`. |
| `TOTP_APP_NAME` | No | `Kuber` | Name shown in authenticator apps when users enable 2FA. |

> **Warning:** `JWT_SECRET` and `JWT_REFRESH_SECRET` must remain stable after users exist. Changing them invalidates all active sessions.

---

## Docker Compose Services

File: `docker-compose.prod.yml`

| Service | Image | Internal Port | External Port | Purpose |
|---------|-------|---------------|----------------|---------|
| `postgres` | `postgres:16-alpine` | 5432 | *none* | PostgreSQL database (not exposed externally) |
| `server` | built locally | 4000 | *none* | Express API server |
| `client` | built locally | 3000 | *none* | React frontend (served via nginx) |
| `nginx` | `nginx:alpine` | 80, 443 | 80, 443 | Reverse proxy, SSL termination |

### Volumes

| Volume | Purpose |
|--------|---------|
| `postgres_data` | Persistent PostgreSQL data (survives restarts and rebuilds) |
| `/etc/letsencrypt/live/...` | SSL certificates (mounted read-only into nginx) |

### Networks

All services share the `kuber_network` bridge network. Only nginx exposes ports to the host.

---

## Directory Structure

```
kuber/
├── client/              # React + Vite frontend
│   └── src/
│       ├── components/  # Shared UI components (buttons, modals, forms)
│       ├── pages/       # Route-level page components (transactions, budgets, etc.)
│       ├── hooks/       # Custom React hooks (auth, data fetching)
│       ├── stores/      # Zustand state stores (auth, UI state)
│       └── lib/         # Axios client, utilities, constants
├── server/              # Node.js + Express backend
│   └── src/
│       ├── routes/      # API route handlers (auth, transactions, etc.)
│       ├── middleware/  # Auth, error handling, rate limiting
│       └── lib/         # Prisma client, AI, email, encryption
│   └── prisma/
│       ├── schema.prisma  # Database schema
│       ├── migrations/   # Schema migration history
│       └── seed.ts        # Seed data for testing
├── shared/              # Shared TypeScript types and enums
├── docs/                # Documentation (this file and others)
├── nginx/               # Nginx configuration files
└── docker-compose.prod.yml  # Production deployment config
```

---

## API Endpoints Quick Reference

Base URL: `http://your-server/api/v1/`

### Authentication

| Endpoint | Method | Auth Required | Description |
|----------|--------|---------------|-------------|
| `/auth/login` | POST | No | Log in with email + password |
| `/auth/logout` | POST | Yes | Sign out (clears refresh cookie) |
| `/auth/refresh` | POST | No* | Refresh access token (uses httpOnly cookie) |
| `/users/me` | GET/PUT | Yes | Get or update current user profile |

*Uses httpOnly refresh cookie, not Bearer token.

### Accounts

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/accounts` | GET | List accounts grouped by type |
| `/accounts/:id` | GET/PUT/DELETE | Get, update, or delete an account |
| `/accounts/:id/history` | GET | Balance history for an account |

### Transactions

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/transactions` | GET | List transactions (paginated) |
| `/transactions/:id` | GET/PUT/DELETE | Get, update, or delete a transaction |
| `/transactions/duplicates` | GET | Find potential duplicate transactions |
| `/transactions/export/csv` | GET | Export transactions as CSV |
| `/transactions/bulk` | POST | Bulk actions (recategorize, delete, etc.) |

### Budgets, Goals, Recurring

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/budgets` | GET/POST | List or create budgets |
| `/budgets/:id` | PUT/DELETE | Update or delete a budget |
| `/goals` | GET/POST | List or create savings goals |
| `/recurring` | GET/POST | List or create recurring transactions |

### Reports & Wealth

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/reports/spending` | GET | Spending breakdown by category |
| `/reports/budget-variance` | GET | Actual vs. planned budget |
| `/cashflow` | GET | Monthly income vs. expenses |
| `/networth/history` | GET | Net worth over time |
| `/wealth/income` | GET | Monthly income calculation |
| `/wealth/analysis` | GET/POST | Income/spending analysis + AI insights |
| `/wealth/category-buckets` | GET/PUT | 50/30/20 bucket assignments |

### Investments

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/investments/holdings` | GET | Investment holdings with current values |
| `/investments/allocation` | GET | Allocation breakdown (by ticker/sector) |
| `/investments/performance` | GET | Portfolio performance over time |
| `/investments/pending` | GET | Transactions pending categorization |

### Other

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/categories` | GET | List all categories |
| `/rules` | GET/POST | List or create auto-categorization rules |
| `/rules/apply-all` | POST | Apply all rules to existing transactions |
| `/advisor/conversations` | GET | List AI chat conversations |
| `/advisor/chat` | POST | Send a message to the AI advisor |
| `/advice/topics` | GET | Available advice topics |
| `/audit` | GET | Audit log of sensitive actions |

---

## Supported AI Providers

| Provider | Model Recommendation | API Base URL |
|----------|----------------------|---------------|
| **Anthropic (Claude)** | `claude-sonnet-4-6` | (configured via API key) |
| **OpenAI** | `gpt-4o` | (configured via API key) |
| **Google Gemini** | `gemini-1.5-pro` | (configured via API key) |
| **OpenRouter** | (varies) | (configured via API key) |
| **Ollama** | (any local model) | `http://your-server:11434` |

---

## CSV Import Format

Expected columns in your CSV file:

| Column Name (variations accepted) | Required | Description |
|----------------------------------|----------|-------------|
| `Date`, `Transaction Date`, `Date Posted` | Yes | Transaction date (any common date format) |
| `Description`, `Merchant`, `Payee`, `Name` | Yes | Where the money went or came from |
| `Amount`, `Transaction Amount`, `Debit/Credit` | Yes | Positive for income, negative for expenses |
| `Type`, `Transaction Type` | No | "income" or "expense" (auto-detected if missing) |
| `Category`, `Category Name` | No | Will be auto-assigned or can be set later |

> **Tip:** Kuber's import parser is flexible — it detects columns by name similarity, so don't worry about exact column names.

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Esc` | Close modal / drawer / cancel edit |
| `Enter` | Save / confirm (when in a form) |
| `Tab` | Move to next field in a form |

> **Note:** Kuber is primarily a mouse/touch-friendly web app. More keyboard shortcuts may be added in future releases.

---

## File Locations for Common Customizations

| What You Want to Change | Where to Look |
|------------------------|---------------|
| Change the site title / branding | `client/index.html` and `client/src/components/layout/Sidebar.tsx` |
| Change color scheme | `client/src/app.css` (CSS custom properties) |
| Add a new page | `client/src/pages/` (create new folder + component) |
| Add a new API endpoint | `server/src/routes/` (create new route file) |
| Change database schema | `server/prisma/schema.prisma` then run `npx prisma migrate dev` |
