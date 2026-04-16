# Kuber n8n Workflow Templates

This folder contains ready-to-import n8n workflow templates for automating bank statement imports into Kuber.

## Prerequisites

1. Start Kuber with the automation profile:
   ```bash
   docker compose --profile automation up -d
   ```
2. Open n8n at `http://localhost:9006` and log in with the credentials from your `.env` file (`N8N_USER` / `N8N_PASSWORD`).

## Configuring the Kuber Webhook URL

All workflows that POST to Kuber use the environment variable `KUBER_WEBHOOK_URL`. Set this in n8n:

1. Go to **Settings → Environment Variables**
2. Add `KUBER_WEBHOOK_URL` = `http://kuber_server:4000` (if running in the same Docker network) or `http://localhost:4000` (if n8n is running outside Docker).

You will also need a Kuber API token. Generate one by logging into the Kuber API:
```
POST /api/v1/auth/login  →  copy the accessToken
```
Add it as an n8n credential (HTTP Header Auth, name: `Authorization`, value: `Bearer <token>`).

## Importing a Workflow

1. In n8n, click **Workflows → Import from File**
2. Select the `.json` file from this folder
3. Open the imported workflow and update any credentials or environment-specific values
4. Toggle the workflow to **Active**

---

## Workflow Reference

### `bank-email-to-kuber.json`
**Trigger:** IMAP email — monitors your inbox for bank notification emails that include a CSV or PDF attachment.

**What it does:**
- Watches for emails matching a configurable sender filter (e.g., `noreply@td.com`)
- Extracts the CSV/PDF attachment
- POSTs it to `POST /api/v1/import/webhook` on Kuber as multipart form-data

**Setup:**
- Configure the IMAP node with your email credentials
- Set the sender filter to your bank's notification address
- Set the `accountId` in the HTTP node body to the Kuber account ID you want to import into

---

### `folder-watch-csv.json`
**Trigger:** Local filesystem — watches the `/bank-drop/` folder inside the n8n container for new `.csv` files.

**What it does:**
- Detects new `.csv` files dropped into the watched folder
- Reads the file contents
- POSTs it to Kuber's webhook endpoint

**Setup:**
- Mount a host folder into the n8n container by adding to `docker-compose.yml`:
  ```yaml
  volumes:
    - /your/host/bank-drop:/bank-drop
  ```
- Set the `accountId` in the HTTP node to the target Kuber account

---

### `weekly-import-reminder.json`
**Trigger:** Cron — runs every Monday at 8:00 AM (America/Toronto timezone).

**What it does:**
- Sends an email reminder to manually export your bank CSV and import it into Kuber

**Setup:**
- Configure the Send Email node with your SMTP credentials
- Update the recipient address
