# How-to: Configure SMTP Email

## Goal
Set up email notifications (password resets, notifications) using Gmail or any SMTP provider.

## Prerequisites
- An SMTP provider (Gmail, Outlook, your ISP, etc.)
- For Gmail: 2FA enabled + an App Password generated

## Steps

### 1. Get Your SMTP Credentials

**Gmail users:**
1. Go to [Google Account → Security](https://myaccount.google.com/security)
2. Enable **2-Step Verification** (required)
3. Go to **App passwords** (under "Signing in to Google")
4. Select "Mail" and generate a password — copy it (looks like `abcd efgh ijkl mnop`)

**Other providers:** Check your provider's help docs for SMTP server, port, and password.

### 2. Update Kuber's `.env` File

```bash
cd kuber
nano .env   # or use any text editor
```

Add or update these values:

```bash
SMTP_HOST=smtp.gmail.com        # For Gmail
SMTP_PORT=587                    # 587 for STARTTLS (recommended)
SMTP_USER=your-email@gmail.com
SMTP_PASS=abcd-efgh-ijkl-mnop   # Gmail App Password (no spaces)
SMTP_FROM=Kuber <noreply@yourdomain.com>
```

> **Note:** `SMTP_FROM` is the "From" address shown in emails. You can use your Gmail address or a custom domain.

### 3. Restart the Server

```bash
docker compose -f docker-compose.prod.yml restart server
```

### 4. Test the Configuration

1. Log in to Kuber
2. Go to **Settings → Notifications**
3. Trigger a test email (if available) or wait for a notification to be sent

## Confirmation

You should receive test emails at the configured address. If not, check the server logs:

```bash
docker compose -f docker-compose.prod.yml logs server --tail 50
```

Look for SMTP-related error messages.

## Troubleshooting

| Problem | Solution |
|----------|----------|
| **"Authentication failed" error** | Gmail users: Use an **App Password**, not your account password. 2FA must be on. |
| **Connection timeout** | Check firewall allows outbound port 587. Try port 465 (SSL) instead. |
| **Emails go to Spam** | Set up SPF/DKIM records for your domain, or use a reputable SMTP service like SendGrid or Mailgun. |
| **"SMTP_HOST not set" in logs** | Ensure `.env` is loaded by the Docker Compose file — check `env_file: .env` is present in `docker-compose.prod.yml`. |
