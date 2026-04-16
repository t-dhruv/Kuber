.PHONY: dev build test test-e2e test-unit clean db-reset

dev:
	npm run dev

build:
	npm run build

install:
	npm install

db-reset:
	cd server && npx prisma migrate reset --force && npm run db:seed

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

test:
	npm run test

test-unit:
	npm run test

test-e2e:
	npx playwright test tests/e2e/01-auth.spec.ts tests/e2e/02-accounts.spec.ts tests/e2e/03-transactions.spec.ts tests/e2e/04-import-export.spec.ts tests/e2e/05-budgets.spec.ts tests/e2e/06-goals.spec.ts tests/e2e/07-recurring.spec.ts tests/e2e/08-investments.spec.ts tests/e2e/09-rules.spec.ts tests/e2e/10-reports.spec.ts tests/e2e/11-settings.spec.ts tests/e2e/12-advisor.spec.ts tests/e2e/13-import.spec.ts

clean:
	rm -rf client/dist server/dist node_modules client/node_modules server/node_modules shared/node_modules .turbo

prod-up:
	docker compose -f docker-compose.prod.yml up -d

prod-down:
	docker compose -f docker-compose.prod.yml down

prod-logs:
	docker compose -f docker-compose.prod.yml logs -f
