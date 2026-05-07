# Development Setup

## Requirements

- Node.js 20+
- npm
- Docker and Docker Compose v2 for local Postgres

## Install

```bash
npm install
cp .env.example .env
```

For local development, set `DATABASE_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `AI_ENCRYPTION_KEY`, and `CLIENT_URL=http://localhost:9001` in `.env`.

## Run

Start the local database:

```bash
docker compose up -d postgres
```

Apply migrations and seed sample data:

```bash
npm --workspace server run db:migrate
npm --workspace server run db:seed
```

Start both apps:

```bash
npm run dev
```

Or run them separately:

```bash
make dev-server
make dev-client
```

| URL | Service |
| --- | --- |
| `http://localhost:9001` | Vite client |
| `http://localhost:9002` | Express API |
| `http://localhost:5555` | Prisma Studio (`npm --workspace server run db:studio`) |

Demo seed credentials: `demo@kuber.app` / `password123`.

## Quality Commands

```bash
npm --workspace server test
npm --workspace server run build
npm --workspace client run build
npm --workspace server run lint
npm --workspace client run lint
```

Run Playwright E2E tests from the repo root:

```bash
npm run test:e2e
```
