.PHONY: dev build test clean db-reset

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

clean:
	rm -rf client/dist server/dist node_modules client/node_modules server/node_modules shared/node_modules .turbo
