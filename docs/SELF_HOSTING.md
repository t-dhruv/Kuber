# Self-Hosting Kuber

This guide covers the production Docker Compose deployment. Run commands from the repository root because `docker-compose.prod.yml` mounts local `nginx/` and `observability/` directories.

## Requirements

- Docker Engine with Docker Compose v2
- A domain name and TLS-capable reverse proxy for internet exposure
- Backups for the Postgres volume before upgrades

## Required Environment

Copy `.env.example` to `.env` and replace every production secret before starting the stack.

```bash
cp .env.example .env
openssl rand -base64 64  # JWT_SECRET
openssl rand -base64 64  # JWT_REFRESH_SECRET
openssl rand -hex 32     # AI_ENCRYPTION_KEY
openssl rand -base64 48  # POSTGRES_PASSWORD
```

Required values:

| Variable | Purpose |
| --- | --- |
| `POSTGRES_PASSWORD` | Database password used by Postgres and the server connection string |
| `JWT_SECRET` | Access-token signing key |
| `JWT_REFRESH_SECRET` | Refresh-token signing key |
| `AI_ENCRYPTION_KEY` | 64-character hex key for AI keys, IMAP passwords, and webhook secrets |
| `CLIENT_URL` | Public origin for CORS and email links |

Optional profile values:

| Profile | Variables |
| --- | --- |
| `observability` | `GRAFANA_USER`, `GRAFANA_PASSWORD` |

## Start

```bash
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml exec server npx prisma migrate deploy
```

Open `http://localhost:9001` for direct container access, or route your domain through the included nginx service on ports `80` and `443`.

## Optional Profiles

Enable observability:

```bash
docker compose -f docker-compose.prod.yml --profile observability up -d
```

Set the profile credentials in `.env` before enabling observability. The compose file intentionally does not provide `admin` or `changeme` fallbacks.

## HTTPS

Do not expose Kuber over plain HTTP on the internet. Terminate TLS at your edge proxy or configure certificates for nginx. The how-to guide at `docs/02-how-to/https.md` covers the supported HTTPS path.

## Backup And Update

Back up Postgres before upgrading:

```bash
docker compose -f docker-compose.prod.yml exec postgres pg_dump -U kuber kuber_db > kuber-backup.sql
```

Update images:

```bash
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml exec server npx prisma migrate deploy
```

Also see `docs/02-how-to/backup.md` for restore and retention guidance.
