# Development Commands

This document covers all `make` commands for developing Kuber.

## Prerequisites

- Node.js 20+
- Docker & Docker Compose v2
- npm

## Quick Start

```bash
# Install dependencies
make install

# Start development
make up           # Start PostgreSQL
make db-migrate  # Run migrations
make db-seed     # Seed demo data
make dev-server  # Backend on localhost:4000
make dev-client  # Frontend on localhost:3000
```

## Development Commands

| Command | Description |
|---------|-------------|
| `make install` | Install dependencies for server and client |
| `make dev` | Show available dev commands |
| `make dev-server` | Start backend (localhost:4000) |
| `make dev-client` | Start frontend (localhost:3000) |
| `make build` | Build both server and client |
| `make build-server` | Build server only |
| `make build-client` | Build client only |

## Database Commands

| Command | Description |
|---------|-------------|
| `make up` | Start PostgreSQL container |
| `make down` | Stop PostgreSQL container |
| `make db-migrate` | Run Prisma migrations |
| `make db-generate` | Generate Prisma client |
| `make db-seed` | Seed database with demo data |
| `make db-studio` | Open Prisma Studio |
| `make db-reset` | Reset database (migrate + seed) |

## Testing Commands

| Command | Description |
|---------|-------------|
| `make test` | Run all unit tests |
| `make test-server` | Run server tests |
| `make test-client` | Run client tests (TODO) |
| `make test-coverage` | Run tests with coverage |
| `make test-e2e` | Run E2E tests with Playwright |

## Code Quality

| Command | Description |
|---------|-------------|
| `make lint` | Lint server and client |
| `make clean` | Remove build artifacts |

## Production (Docker)

| Command | Description |
|---------|-------------|
| `make prod-up` | Start production stack |
| `make prod-down` | Stop production stack |
| `make prod-logs` | View production logs |
| `make logs` | View development logs |

## Demo Credentials

After running `make db-seed`:
- Email: `demo@kuber.app`
- Password: `password123`

## Ports

| Service | Port |
|--------|------|
| Frontend | 3000 |
| Backend API | 4000 |
| Prisma Studio | 5555 |
| PostgreSQL | 5432 |
| MailHog | 8025 |