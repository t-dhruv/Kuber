# Kuber

A full-stack personal finance web application inspired by Monarch Money.

## Tech Stack

**Frontend:** React 18 + TypeScript + Vite + Tailwind CSS v4 + Recharts + TanStack Query + Zustand
**Backend:** Node.js + Express + TypeScript + Prisma ORM
**Database:** PostgreSQL 16
**Auth:** JWT (15min access token) + httpOnly refresh cookie (7 days)
**Infrastructure:** Docker Compose, Turborepo monorepo

## Features

- **Dashboard** — Net worth, budget overview, spending charts, goals, recurring bills
- **Accounts** — Multi-account tracking (checking, savings, credit cards, investments, loans)
- **Transactions** — Full CRUD with search, filters, bulk edit, category management
- **Cash Flow** — Monthly/yearly income vs expenses with interactive charts
- **Budget** — Category-based budgeting with inline editing and progress tracking
- **Reports** — Spending/income analysis with donut charts and date range filters
- **Recurring** — Bill tracking with paid/upcoming status
- **Goals** — Savings goal tracking with progress rings
- **Investments** — Holdings tracking with simulated prices and allocation breakdown
- **Settings** — Profile, notifications, household management, category CRUD
- **AI Advisor** — Mock AI financial assistant with contextual responses

## Quick Start

### Prerequisites
- Node.js 18+
- Docker + Docker Compose

### Setup

```bash
# Clone and install
npm install

# Copy environment file
cp .env.example .env

# Start database
docker-compose up -d postgres

# Run migrations + seed
cd server && npm run db:migrate && npm run db:seed

# Start development
npm run dev
```

### Demo Credentials
- Email: `demo@kuber.app`
- Password: `password123`

### Development URLs
- Frontend: http://localhost:3000
- Backend API: http://localhost:4000
- API Health: http://localhost:4000/health

## Project Structure

```
kuber/
├── client/          # React + Vite frontend
│   ├── src/
│   │   ├── components/  # Reusable UI components
│   │   ├── pages/       # Route-level page components
│   │   ├── hooks/       # Custom React hooks
│   │   ├── stores/      # Zustand state stores
│   │   └── lib/         # API client, utilities
├── server/          # Node.js + Express backend
│   ├── src/
│   │   ├── routes/      # API route handlers
│   │   ├── middleware/  # Auth, error handling
│   │   └── lib/         # Prisma client, utilities
│   └── prisma/          # Schema + migrations + seed
└── shared/          # Shared TypeScript types
```

## API Endpoints

All endpoints prefixed with `/api/v1/` and require Bearer token auth (except `/auth/*`).

| Resource | Endpoints |
|----------|-----------|
| Auth | POST /auth/signup, /login, /refresh, /logout, /forgot-password, /reset-password |
| Users | GET/PUT /users/me |
| Dashboard | GET /dashboard/summary, /spending-chart, /budget-summary, /recent-transactions, /recurring-summary, /net-worth-chart, /goals-summary |
| Accounts | GET/POST /accounts, GET/PUT/DELETE /accounts/:id |
| Transactions | GET/POST /transactions, GET/PUT/DELETE /transactions/:id, bulk operations |
| Budgets | GET/POST/DELETE /budgets |
| Cash Flow | GET /cashflow, /cashflow/month, /cashflow/sankey |
| Reports | GET /reports/spending, /income, /cashflow, /trends |
| Recurring | GET/POST /recurring, GET/PUT/DELETE /recurring/:id, /monthly-summary |
| Goals | GET/POST /goals, GET/PUT/DELETE /goals/:id, POST /goals/:id/contribute |
| Investments | GET /investments/holdings, /allocation, /performance, POST/PUT/DELETE /holdings |
| Settings | GET/PUT /settings/profile, /household, /categories, /notifications, /password |
| Notifications | GET/PUT/DELETE /notifications |
| Advisor | POST /advisor/chat |
