# How-to: Back Up Your Data

## Goal
Create regular backups of your Kuber database and export your financial data, so you never lose your financial history.

## Two Backup Methods

Kuber supports two backup approaches:
1. **Database backup** (full, for disaster recovery)
2. **CSV export** (selective, for spreadsheets or migration)

---

## Method 1: Database Backup (Full)

### Create a Backup

```bash
docker compose -f docker-compose.prod.yml exec postgres \
  pg_dump -U kuber kuber_db > backup_$(date +%Y%m%d).sql
```

This creates a file like `backup_20260428.sql` containing your entire database.

### Store the Backup Off-Site

Copy the `.sql` file to:
- **Cloud storage:** S3, Backblaze B2, Google Drive
- **Local NAS** or external hard drive
- **Another server** via `scp`

Example with S3:
```bash
aws s3 cp backup_20260428.sql s3://my-kuber-backups/
```

### Automate Daily Backups

Add a cron job on your server:

```bash
# Edit crontab
crontab -e

# Add: daily backup at 2 AM
0 2 * * * cd /path/to/kuber && docker compose -f docker-compose.prod.yml exec -T postgres pg_dump -U kuber kuber_db > /backups/kuber_$(date +\%Y\%m\%d).sql
```

### Restore from Backup

> **Warning:** This overwrites all existing data. Stop the server first.

```bash
# Stop the server
docker compose -f docker-compose.prod.yml stop server

# Restore
cat backup_20260428.sql | docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U kuber kuber_db

# Restart
docker compose -f docker-compose.prod.yml up -d server
```

---

## Method 2: CSV Export (Selective)

Use this for spreadsheets or migrating to another tool.

### From the Kuber UI

1. Log in to Kuber
2. Go to **Settings → Data → Export**
3. Select what to export (Transactions, Accounts)
4. Click **Download CSV**

### From the API

```bash
# Get your auth token first (login via browser, check DevTools → Network → Authorization header)
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://your-server/api/v1/transactions/export/csv
```

---

## Backup Best Practices

- **Automate it:** Manual backups get forgotten. Use cron or a scheduled task.
- **Test restores:** Once a month, try restoring a backup to a test instance.
- **3-2-1 rule:** 3 copies of data, 2 different media, 1 off-site.
- **Encrypt backups:** If storing in the cloud, encrypt `.sql` files with GPG.

## Troubleshooting

| Problem | Solution |
|----------|----------|
| **pg_dump: command not found** | The command runs *inside* the postgres container — ensure Docker is running and the container name is correct. |
| **Permission denied writing backup** | Write to a directory you own, or use `sudo`. |
| **Restore fails with errors** | The backup may be from a newer schema version. Run migrations after restore: `docker compose exec server npx prisma migrate deploy`. |
