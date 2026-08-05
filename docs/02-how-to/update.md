# Upgrading to a new version

An upgrade is: take a backup, pull the new images, restart. Migrations apply
themselves.

## Before you start

Take a backup. This is the one step you cannot add afterwards:

```bash
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U kuber -d kuber_db > kuber-before-upgrade-$(date +%F).sql
```

See [Backing up and restoring your data](backup.md) for how to check it is good.

Read the [release notes](https://github.com/t-dhruv/Kuber/releases) for every
version between yours and the one you are moving to, not just the newest.

## Upgrade

If you pin a version, edit it in `.env`:

```bash
sed -i 's/^IMAGE_TAG=.*/IMAGE_TAG=v1.1.0/' .env
```

Then pull and restart:

```bash
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

Compose recreates only the containers whose image changed. Postgres and your
volume are left alone.

## Migrations

You do not run a migration command. The server image applies every pending
migration before it begins serving, on every start, so a version bump is a
single command. In the logs you will see the migration state before the API
comes up:

```bash
docker compose -f docker-compose.prod.yml logs server | grep -i migration
# 79 migrations found in prisma/migrations
# No pending migrations to apply.
```

If a migration fails, the server exits rather than serving against a
half-migrated database, and its container will restart in a loop. The logs name
the migration that failed. Restore your backup before trying anything else.

## Confirm the upgrade

```bash
docker compose -f docker-compose.prod.yml ps
curl -fsS http://localhost:8080/health
```

All three services should report healthy. Then open the app and confirm your
Accounts and recent Transactions are present.

## Rolling back

Kuber's migrations are not reversible. Rolling back means restoring the backup
you took before upgrading, into the version you were on before:

```bash
sed -i 's/^IMAGE_TAG=.*/IMAGE_TAG=v1.0.0/' .env
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml up -d postgres
docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U kuber -d kuber_db < kuber-before-upgrade-2026-08-05.sql
docker compose -f docker-compose.prod.yml up -d
```

This is why the backup is not optional. A newer schema left in place under an
older image will fail in ways that are harder to diagnose than a restore.
