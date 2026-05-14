.PHONY: help dev dev-client dev-server build build-client build-server \
        test test-server test-client test-unit test-coverage test-e2e \
        clean db-reset db-drop db-migrate db-generate db-seed db-studio \
        lint typecheck format start install up down logs \
        prod-up prod-down prod-logs

# ── Default ──────────────────────────────────────────────────────────────────

help:
	@echo "Usage: make <target>"
	@echo ""
	@echo "Dev"
	@echo "  dev            Start server + client concurrently"
	@echo "  dev-server     Start Express API (port 9002)"
	@echo "  dev-client     Start Vite dev server (port 9001)"
	@echo "  install        Install all npm deps"
	@echo ""
	@echo "Build / Quality"
	@echo "  build          Build server + client"
	@echo "  lint           ESLint across workspaces"
	@echo "  typecheck      tsc --noEmit across workspaces"
	@echo "  format         Prettier check across workspaces"
	@echo ""
	@echo "Test"
	@echo "  test           Run all unit tests"
	@echo "  test-coverage  Unit tests with coverage"
	@echo "  test-e2e       Playwright E2E tests"
	@echo ""
	@echo "Database"
	@echo "  db-migrate     Run pending Prisma migrations"
	@echo "  db-generate    Regenerate Prisma client"
	@echo "  db-seed        Seed database with test data"
	@echo "  db-reset       Drop + migrate + seed (full reset)"
	@echo "  db-studio      Open Prisma Studio on :5555"
	@echo ""
	@echo "Docker (dev)"
	@echo "  up             docker-compose up -d"
	@echo "  down           docker-compose down"
	@echo "  logs           Follow all container logs"
	@echo ""
	@echo "Docker (prod)"
	@echo "  prod-up        Start full prod stack (observability + automation)"
	@echo "  prod-down      Stop prod stack"
	@echo "  prod-logs      Follow prod logs"
	@echo ""
	@echo "Misc"
	@echo "  clean          Remove all dist + node_modules"
	@echo "  start          Start compiled server (production mode)"

# ── Dev ──────────────────────────────────────────────────────────────────────

dev:
	npx concurrently --kill-others-on-fail \
		"cd server && npm run dev" \
		"cd client && npm run dev"

dev-client:
	cd client && npm run dev

dev-server:
	cd server && npm run dev

# ── Install ───────────────────────────────────────────────────────────────────

install:
	npm install
	cd server && npm install
	cd client && npm install

# ── Build ─────────────────────────────────────────────────────────────────────

build: build-server build-client

build-client:
	cd client && npm run build

build-server:
	cd server && npm run build

# ── Quality ───────────────────────────────────────────────────────────────────

lint:
	cd server && npm run lint
	cd client && npm run lint

typecheck:
	cd server && npx tsc --noEmit
	cd client && npx tsc --noEmit
	cd shared && npx tsc --noEmit 2>/dev/null || true

format:
	cd server && npx prettier --check "src/**/*.{ts,json}"
	cd client && npx prettier --check "src/**/*.{ts,tsx,css}"

# ── Test ──────────────────────────────────────────────────────────────────────

test: test-server

test-server:
	cd server && npm run test

test-unit:
	cd server && npm run test

test-coverage:
	cd server && npm run test:coverage

test-e2e:
	npx playwright test

# ── Database ──────────────────────────────────────────────────────────────────

db-reset: db-drop db-migrate db-seed

db-drop:
	cd server && npx prisma migrate reset --force --skip-seed

db-migrate:
	cd server && npm run db:migrate

db-generate:
	cd server && npm run db:generate

db-seed:
	cd server && npm run db:seed

db-studio:
	cd server && npx prisma studio

# ── Docker (dev) ──────────────────────────────────────────────────────────────

up:
	docker-compose up -d

update:
	docker-compose down
	docker-compose pull
	docker-compose up -d

down:
	docker-compose down

logs:
	docker-compose logs -f

# ── Docker (prod) ─────────────────────────────────────────────────────────────

prod-up:
	docker compose -f docker-compose.prod.yml --profile observability --profile automation up -d

prod-down:
	docker compose -f docker-compose.prod.yml --profile observability --profile automation down

prod-update:
	docker compose -f docker-compose.prod.yml --profile observability --profile automation down
	docker compose -f docker-compose.prod.yml --profile observability --profile automation pull
	docker compose -f docker-compose.prod.yml --profile observability --profile automation up -d

prod-logs:
	docker compose -f docker-compose.prod.yml --profile observability --profile automation logs -f

# ── Misc ──────────────────────────────────────────────────────────────────────

start:
	cd server && npm run start

clean:
	rm -rf client/dist server/dist node_modules client/node_modules server/node_modules shared/node_modules .turbo
