.PHONY: dev dev-client dev-server build build-client build-server test test-server test-client test-unit test-coverage test-e2e clean db-reset db-migrate db-generate db-seed db-studio lint start install up down logs prod-up prod-down prod-logs

dev: dev-server
	@echo "Run 'make dev-server' or 'make dev-client' separately"

dev-client:
	cd client && npm run dev

dev-server:
	cd server && npm run dev

build: build-server build-client

build-client:
	cd client && npm run build

build-server:
	cd server && npm run build

install:
	cd server && npm install
	cd client && npm install

db-reset:
	cd server && npm run db:migrate && npm run db:seed

db-migrate:
	cd server && npm run db:migrate

db-generate:
	cd server && npm run db:generate

db-seed:
	cd server && npm run db:seed

db-studio:
	cd server && npx prisma studio

logs:
	docker-compose logs -f

up:
	docker-compose up -d

down:
	docker-compose down

test: test-server test-client

test-server:
	cd server && npm run test

test-client:
	@echo "No client tests found (TODO: add tests)"

test-unit:
	cd server && npm run test

test-coverage:
	cd server && npm run test:coverage

test-e2e:
	cd server && npx playwright test tests/e2e/01-auth.spec.ts tests/e2e/02-accounts.spec.ts tests/e2e/03-transactions.spec.ts tests/e2e/04-import-export.spec.ts tests/e2e/05-budgets.spec.ts tests/e2e/06-goals.spec.ts tests/e2e/07-recurring.spec.ts tests/e2e/08-investments.spec.ts tests/e2e/09-rules.spec.ts tests/e2e/10-reports.spec.ts tests/e2e/11-settings.spec.ts tests/e2e/12-advisor.spec.ts tests/e2e/13-import.spec.ts

lint:
	cd server && npm run lint
	cd client && npm run lint

start:
	cd server && npm run start

clean:
	rm -rf client/dist server/dist node_modules client/node_modules server/node_modules shared/node_modules .turbo

prod-up:
	docker compose -f docker-compose.prod.yml --profile observability --profile automation up -d

prod-down:
	docker compose -f docker-compose.prod.yml --profile observability --profile automation down

prod-logs:
	docker compose -f docker-compose.prod.yml --profile observability --profile automation logs -f
