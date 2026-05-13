# How-to: Update Kuber

## Goal
Update your Kuber instance to the latest version safely, without losing data.

## Steps

### 1. Back Up First

> **Never skip this step.** If something goes wrong, you'll need that backup.

```bash
docker compose -f docker-compose.prod.yml exec postgres \
  pg_dump -U kuber kuber_db > backup_before_update_$(date +%Y%m%d).sql
```

### 2. Pull the Latest Code

```bash
cd kuber
git pull
```

### 3. Rebuild and Restart Containers

```bash
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml up -d --build
```

> **Note:** `--build` rebuilds the Docker images with any code changes. This takes 2–3 minutes.

### 4. Apply Database Migrations

```bash
docker compose -f docker-compose.prod.yml exec server npx prisma migrate deploy
```

### 5. Verify Everything Works

1. Open `http://your-server-ip` in your browser
2. Log in successfully
3. Check that transactions, accounts, and budgets are all visible
4. Test one transaction edit to confirm the API is working

## Using Pre-Built Docker Images (Alternative)

If you prefer not to build from source:

```bash
# Pull latest pre-built images
docker compose -f docker-compose.ghcr.yml pull

# Restart with new images
docker compose -f docker-compose.ghcr.yml up -d

# Apply migrations
docker compose -f docker-compose.ghcr.yml exec server npx prisma migrate deploy
```

## Confirmation

- Dashboard loads without errors
- You can create/edit a transaction
- No new errors in logs: `docker compose -f docker-compose.prod.yml logs --tail 50`

## Troubleshooting

| Problem | Solution |
|----------|----------|
| **Migrations fail** | Check server logs: `docker compose logs server`. You may need to fix a schema conflict manually. |
| **Site returns 502/503** | Containers may still be building. Wait 2–3 minutes, then check `docker compose ps`. |
| **Can't log in after update** | Ensure `JWT_SECRET` and `JWT_REFRESH_SECRET` in `.env` weren't changed. |
| **Data missing after update** | Your data is in the `postgres_data` Docker volume. It persists across updates. If truly missing, restore from your backup. |
