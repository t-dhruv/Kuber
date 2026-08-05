# Backing up and restoring your data

Everything Kuber knows lives in one Postgres volume. Back that up and you can
rebuild an Instance anywhere; lose it and there is no other copy — Kuber has no
cloud component to recover from.

The commands below were run against a real Instance, including the restore.

## Back up

`pg_dump` produces a single portable SQL file. Run it while the Instance is up:

```bash
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U kuber -d kuber_db > kuber-backup-$(date +%F).sql
```

`-T` matters: without it Compose allocates a TTY and corrupts the dump with
carriage returns.

Check the file is plausible rather than assuming it worked:

```bash
ls -lh kuber-backup-*.sql
grep -c 'CREATE TABLE' kuber-backup-*.sql
```

A dump of an Instance with real data is hundreds of kilobytes or more, and lists
dozens of tables. A dump measured in bytes means the command failed.

Compress and keep it somewhere that is not the Instance:

```bash
gzip kuber-backup-$(date +%F).sql
```

### On a schedule

A daily dump via cron, keeping 14 days:

```cron
0 3 * * * cd /path/to/kuber && docker compose -f docker-compose.prod.yml exec -T postgres pg_dump -U kuber -d kuber_db | gzip > backups/kuber-$(date +\%F).sql.gz && find backups -name 'kuber-*.sql.gz' -mtime +14 -delete
```

Note the escaped `\%` — cron treats a bare `%` as a newline.

## Restore

Restoring replaces the current contents of the database. On a running Instance,
stop the application services first so nothing writes underneath you:

```bash
docker compose -f docker-compose.prod.yml stop server client
```

If you are restoring onto a clean machine, bring up only Postgres:

```bash
docker compose -f docker-compose.prod.yml up -d postgres
```

Feed the dump back in:

```bash
docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U kuber -d kuber_db < kuber-backup-2026-08-05.sql
```

If the dump is compressed:

```bash
gunzip -c kuber-backup-2026-08-05.sql.gz | \
  docker compose -f docker-compose.prod.yml exec -T postgres psql -U kuber -d kuber_db
```

Start everything:

```bash
docker compose -f docker-compose.prod.yml up -d
```

The server applies any migrations the dump predates on its way up, so restoring
an older backup into a newer Instance is safe.

## Verify a restore

A backup you have never restored is a guess. Verify it somewhere disposable
rather than on the Instance you depend on.

```bash
mkdir /tmp/kuber-restore-test && cd /tmp/kuber-restore-test
cp /path/to/kuber/docker-compose.prod.yml .
cp /path/to/kuber/.env .
echo 'HTTP_PORT=8099' >> .env

docker compose -p kuber-verify -f docker-compose.prod.yml up -d postgres
docker compose -p kuber-verify -f docker-compose.prod.yml exec -T postgres \
  psql -U kuber -d kuber_db < /path/to/kuber-backup-2026-08-05.sql
docker compose -p kuber-verify -f docker-compose.prod.yml up -d
```

`-p kuber-verify` gives this a separate project name, so it gets its own volume
and cannot touch your real Instance.

Then confirm the data is actually there — log in at `http://localhost:8099` with
your normal credentials and check that your Accounts and recent Transactions
appear. Logging in is itself part of the test: it proves the Users, Household and
password hashes came back, not just the schema.

Tear the check down completely when you are satisfied:

```bash
docker compose -p kuber-verify -f docker-compose.prod.yml down -v
```

## Backing up the volume instead

`pg_dump` is preferred because its output survives a Postgres major version
change. If you would rather copy the raw volume, stop the Instance first — a
volume copied while Postgres is running is not guaranteed to be consistent:

```bash
docker compose -f docker-compose.prod.yml down
docker run --rm \
  -v kuber_postgres_data:/data:ro \
  -v "$PWD":/backup \
  alpine tar czf /backup/kuber-volume-$(date +%F).tar.gz -C /data .
docker compose -f docker-compose.prod.yml up -d
```

Confirm the volume's real name first with `docker volume ls`; Compose prefixes it
with the project directory name.
