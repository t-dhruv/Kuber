.PHONY: help dev dev-client dev-server build build-client build-server \
        test test-server test-client test-unit test-coverage test-e2e \
        clean db-reset db-env-check db-drop db-migrate db-generate db-seed db-studio \
        lint typecheck format start install up down logs \
        prod-up prod-down prod-logs

WITH_ROOT_ENV = node scripts/run-with-root-env.mjs

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
	@echo "  test           Run server + client unit tests"
	@echo "  test-server    Run server unit tests"
	@echo "  test-client    Run client unit tests"
	@echo "  test-coverage  Server + client unit tests with coverage"
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
	@echo "  prod-up        Start full prod stack (with observability)"
	@echo "  prod-down      Stop prod stack"
	@echo "  prod-logs      Follow prod logs"
	@echo ""
	@echo "Misc"
	@echo "  clean          Remove all dist + node_modules"
	@echo "  start          Start compiled server (production mode)"

# ── Dev ──────────────────────────────────────────────────────────────────────

dev:
	$(WITH_ROOT_ENV) npx concurrently --kill-others-on-fail \
		"cd server && npm run dev" \
		"cd client && npm run dev"

dev-client:
	$(WITH_ROOT_ENV) sh -c 'cd client && npm run dev'

dev-server:
	$(WITH_ROOT_ENV) sh -c 'cd server && npm run dev'

# ── Install ───────────────────────────────────────────────────────────────────

install:
	npm install
	cd server && npm install
	cd client && npm install

# ── Build ─────────────────────────────────────────────────────────────────────

build: build-server build-client

build-client:
	$(WITH_ROOT_ENV) sh -c 'cd client && npm run build'

build-server:
	$(WITH_ROOT_ENV) sh -c 'cd server && npm run build'

# ── Quality ───────────────────────────────────────────────────────────────────

lint:
	$(WITH_ROOT_ENV) sh -c 'cd server && npm run lint'
	$(WITH_ROOT_ENV) sh -c 'cd client && npm run lint'

typecheck:
	$(WITH_ROOT_ENV) sh -c 'cd server && npx tsc --noEmit'
	$(WITH_ROOT_ENV) sh -c 'cd client && npx tsc --noEmit'
	$(WITH_ROOT_ENV) sh -c 'cd shared && npx tsc --noEmit 2>/dev/null || true'

format:
	$(WITH_ROOT_ENV) sh -c 'cd server && npx prettier --check "src/**/*.{ts,json}"'
	$(WITH_ROOT_ENV) sh -c 'cd client && npx prettier --check "src/**/*.{ts,tsx,css}"'

# ── Test ──────────────────────────────────────────────────────────────────────

test:
	$(WITH_ROOT_ENV) npm run test

test-server:
	$(WITH_ROOT_ENV) sh -c 'cd server && npm run test'

test-client:
	$(WITH_ROOT_ENV) sh -c 'cd client && npm run test'

test-unit:
	$(WITH_ROOT_ENV) npm run test

test-coverage:
	$(WITH_ROOT_ENV) npm run test:coverage

test-e2e:
	$(WITH_ROOT_ENV) npx playwright test

# ── Database ──────────────────────────────────────────────────────────────────

db-reset: db-env-check db-drop db-migrate db-seed

db-env-check:
	@$(WITH_ROOT_ENV) sh -c 'if [ -z "$$DATABASE_URL" ]; then \
		echo "DATABASE_URL is not set. Create .env from .env.example or export DATABASE_URL."; \
		exit 1; \
	fi'

db-drop: db-env-check
	$(WITH_ROOT_ENV) sh -c 'cd server && npx prisma migrate reset --force --skip-seed'

db-migrate: db-env-check
	$(WITH_ROOT_ENV) sh -c 'cd server && npm run db:migrate'

db-generate:
	$(WITH_ROOT_ENV) sh -c 'cd server && npm run db:generate'

db-seed: db-env-check
	$(WITH_ROOT_ENV) sh -c 'cd server && npm run db:seed'

db-studio: db-env-check
	$(WITH_ROOT_ENV) sh -c 'cd server && npx prisma studio'

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
	docker compose -f docker-compose.prod.yml --profile observability up -d

prod-down:
	docker compose -f docker-compose.prod.yml --profile observability down

prod-update:
	docker compose -f docker-compose.prod.yml --profile observability down
	docker compose -f docker-compose.prod.yml --profile observability pull
	docker compose -f docker-compose.prod.yml --profile observability up -d

prod-logs:
	docker compose -f docker-compose.prod.yml --profile observability logs -f

# ── Misc ──────────────────────────────────────────────────────────────────────

start:
	$(WITH_ROOT_ENV) sh -c 'cd server && npm run start'

clean:
	rm -rf client/dist server/dist node_modules client/node_modules server/node_modules shared/node_modules .turbo
