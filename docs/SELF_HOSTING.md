# Self-Hosting Kuber

Kuber is designed to be self-hosted. This guide covers everything you need to deploy it on your own server using Docker Compose — from a five-minute quick start to HTTPS, backups, and troubleshooting.

---

## Prerequisites

- **Docker 24+** and **Docker Compose v2** (`docker compose`, not `docker-compose`)
- A server or VPS with at least **1 GB RAM** (2 GB recommended)
- A domain name — optional, but required for HTTPS
- About **10 minutes**

---

## Quick Start (5 minutes)

### 1. Clone the repository

```bash
git clone https://github.com/yourusername/kuber.git
cd kuber
```

### 2. Configure environment

```bash
cp .env.example .env
```

Open `.env` and set the following required values before proceeding:

```bash
# Generate two strong secrets (run each command separately):
openssl rand -base64 64   # paste output into JWT_SECRET
openssl rand -base64 64   # paste output into JWT_REFRESH_SECRET

# Set a strong database password — must match in both DATABASE_URL and POSTGRES_PASSWORD
POSTGRES_PASSWORD=a-strong-password-here
DATABASE_URL=postgresql://kuber:a-strong-password-here@postgres:5432/kuber_db

# Set to the public URL of your instance (no trailing slash)
CLIENT_URL=http://your-server-ip
```

Everything else in `.env` is optional for a basic deployment. See the [full reference](#environment-variables-reference) below.

### 3. Start the stack

```bash
docker compose -f docker-compose.prod.yml up -d
```

This starts four containers: `postgres`, `server`, `client`, and `nginx`. The first run will build the images, which takes 2–3 minutes.

### 4. Run database migrations

```bash
docker compose -f docker-compose.prod.yml exec server npx prisma migrate deploy
```

This applies all schema migrations to the database. Run this after every update as well.

### 5. Create your account

Navigate to **http://your-server-ip** (or http://localhost if running locally) and click **Create Account**. The first registered user becomes the household owner.

---

## Environment Variables Reference

All variables live in a single `.env` file at the repository root. The production compose file (`docker-compose.prod.yml`) loads it automatically via `env_file: .env`.

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | Yes | — | Full PostgreSQL connection string. In production this points to the internal `postgres` service. Must use the same password as `POSTGRES_PASSWORD`. |
| `POSTGRES_PASSWORD` | Yes | — | Password for the `kuber` database user. Used by both the `postgres` service and `DATABASE_URL`. |
| `JWT_SECRET` | Yes | — | Secret used to sign access tokens (15-minute lifetime). Generate with `openssl rand -base64 64`. Minimum 64 characters. |
| `JWT_REFRESH_SECRET` | Yes | — | Secret used to sign refresh tokens (7-day lifetime). Must be different from `JWT_SECRET`. Generate the same way. |
| `PORT` | No | `4000` | Port the Express server listens on inside its container. The nginx proxy routes to this internally — you do not need to expose it. |
| `NODE_ENV` | No | `production` | Set to `production` for all deployments. Controls error verbosity and security headers. |
| `CLIENT_URL` | Yes | `http://localhost` | The public-facing URL of your Kuber instance (no trailing slash). Used for CORS policy and links included in emails. Example: `https://finance.example.com`. |
| `SMTP_HOST` | No | — | SMTP server hostname. Leave blank to disable email features. Example: `smtp.gmail.com`. |
| `SMTP_PORT` | No | `587` | SMTP port. `587` for STARTTLS (recommended), `465` for SSL, `25` for unencrypted. |
| `SMTP_USER` | No | — | SMTP username / login email address. |
| `SMTP_PASS` | No | — | SMTP password or app-specific password. For Gmail, generate an App Password under Google Account → Security → 2-Step Verification → App passwords. |
| `SMTP_FROM` | No | — | The "From" address shown in outgoing emails. Example: `Kuber <noreply@yourdomain.com>`. |
| `TOTP_APP_NAME` | No | `Kuber` | The name shown in authenticator apps (Google Authenticator, Authy, etc.) when users enable 2FA. |

> **Tip:** `JWT_SECRET` and `JWT_REFRESH_SECRET` must remain stable after users exist. Changing them invalidates all active sessions and logged-in users will be signed out immediately.

---

## Updating Kuber

```bash
# Pull the latest code
git pull

# Rebuild and restart containers
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml up -d --build

# Apply any new database migrations
docker compose -f docker-compose.prod.yml exec server npx prisma migrate deploy
```

Data in the `postgres_data` Docker volume is preserved across restarts and rebuilds.

---

## Using Pre-built Docker Images (GitHub Container Registry)

If you prefer not to build from source, pre-built images are published to the GitHub Container Registry on every release tag:

- `ghcr.io/yourusername/kuber-server:latest`
- `ghcr.io/yourusername/kuber-client:latest`

Create a `docker-compose.ghcr.yml` (or modify `docker-compose.prod.yml`) to use pre-built images:

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: kuber
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: kuber_db
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - kuber_network
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U kuber -d kuber_db"]
      interval: 10s
      timeout: 5s
      retries: 5

  server:
    image: ghcr.io/yourusername/kuber-server:latest
    restart: unless-stopped
    env_file: .env
    environment:
      NODE_ENV: production
      DATABASE_URL: postgresql://kuber:${POSTGRES_PASSWORD}@postgres:5432/kuber_db
    depends_on:
      postgres:
        condition: service_healthy
    networks:
      - kuber_network

  client:
    image: ghcr.io/yourusername/kuber-client:latest
    restart: unless-stopped
    networks:
      - kuber_network

  nginx:
    image: nginx:alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/prod.conf:/etc/nginx/conf.d/default.conf:ro
    depends_on:
      - server
      - client
    networks:
      - kuber_network

volumes:
  postgres_data:

networks:
  kuber_network:
    driver: bridge
```

To update to the latest release with pre-built images:

```bash
docker compose -f docker-compose.ghcr.yml pull
docker compose -f docker-compose.ghcr.yml up -d
docker compose -f docker-compose.ghcr.yml exec server npx prisma migrate deploy
```

---

## Configuring AI Advisor (Optional)

The AI Advisor lets you chat with an AI financial assistant that has read access to your accounts, transactions, budgets, and goals. No provider is required — you can disable it entirely.

**Setup:**

1. Log in and go to **Settings → Integrations → AI Advisor**
2. Select your provider from the dropdown
3. Paste your API key and click **Save & Test**

**Supported providers:**

| Provider | Model recommendation | Notes |
|---|---|---|
| **Anthropic (Claude)** | `claude-sonnet-4-6` | Best quality responses; strong financial reasoning |
| **OpenAI** | `gpt-4o` | Fast, widely supported |
| **Google Gemini** | `gemini-1.5-pro` | Has a generous free tier |
| **OpenRouter** | Any | One API key gives access to dozens of models |
| **Ollama** | Any local model | Fully local — no API key, no data leaves your server |

API keys are stored **encrypted in the database** and are only ever sent to the provider you select. They are never logged or transmitted anywhere else.

---

## Reverse Proxy and HTTPS

### Using the included Nginx

The production stack includes an Nginx container that listens on ports 80 and 443 and proxies requests to the `server` and `client` services. The database port is not exposed externally.

To enable HTTPS with a free Let's Encrypt certificate:

**1. Point your domain DNS to your server IP.**

Wait for DNS to propagate (usually a few minutes, up to an hour).

**2. Install Certbot on the host.**

```bash
# Debian/Ubuntu
sudo apt install certbot

# Or via snap
sudo snap install --classic certbot
```

**3. Stop Nginx temporarily and obtain the certificate.**

```bash
docker compose -f docker-compose.prod.yml stop nginx

sudo certbot certonly --standalone \
  -d finance.example.com \
  --email you@example.com \
  --agree-tos --non-interactive
```

Certificates are saved to `/etc/letsencrypt/live/finance.example.com/`.

**4. Update `nginx/prod.conf` to add an SSL server block.**

```nginx
server {
    listen 80;
    server_name finance.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name finance.example.com;

    ssl_certificate     /etc/nginx/certs/fullchain.pem;
    ssl_certificate_key /etc/nginx/certs/privkey.pem;

    location /api/ {
        proxy_pass http://server:4000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location / {
        proxy_pass http://client:3000;
        proxy_set_header Host $host;
    }
}
```

**5. Mount the certificates and restart.**

Uncomment the cert volume in `docker-compose.prod.yml`:

```yaml
  nginx:
    volumes:
      - ./nginx/prod.conf:/etc/nginx/conf.d/default.conf:ro
      - /etc/letsencrypt/live/finance.example.com:/etc/nginx/certs:ro
```

```bash
docker compose -f docker-compose.prod.yml up -d nginx
```

**6. Auto-renew.** Add a cron job on the host to renew and reload:

```bash
# Renew and reload nginx monthly
0 3 1 * * certbot renew --quiet && docker compose -f /path/to/kuber/docker-compose.prod.yml exec nginx nginx -s reload
```

### Behind an existing reverse proxy (Traefik, Caddy, NPM)

If you already run a reverse proxy, expose the Nginx port to a non-standard local port and proxy to it, or remove the Nginx service entirely and expose the server and client directly.

**Exposing on a custom port** (simplest approach):

```yaml
  nginx:
    ports:
      - "8080:80"   # Proxy http://your-server:8080 from your upstream proxy
```

Then configure your upstream proxy (e.g., Caddy):

```
finance.example.com {
    reverse_proxy localhost:8080
}
```

---

## Backup and Data

### Database backup

```bash
docker compose -f docker-compose.prod.yml exec postgres \
  pg_dump -U kuber kuber_db > backup_$(date +%Y%m%d).sql
```

Store the resulting `.sql` file off-server (S3, Backblaze B2, a local NAS, etc.). Consider scheduling this daily via cron.

### Restore from backup

```bash
cat backup_20260324.sql | docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U kuber kuber_db
```

> Warning: restoring overwrites all existing data. Stop the server container first if you are restoring to a clean state.

### Export your data from the app

Go to **Settings → Data → Export** to download a CSV export of your transactions and accounts. This is useful for migrating to another tool or keeping a local spreadsheet copy.

---

## Troubleshooting

| Issue | Solution |
|---|---|
| **Cannot connect to the database** | Confirm `DATABASE_URL` and `POSTGRES_PASSWORD` match. Run `docker compose -f docker-compose.prod.yml ps` to verify the `postgres` container is healthy. |
| **Stuck on login / constantly logged out** | `JWT_SECRET` or `JWT_REFRESH_SECRET` is missing or was changed after accounts were created. Set stable values and restart the `server` container. |
| **Emails not sending** | Check `SMTP_HOST`, `SMTP_USER`, and `SMTP_PASS` are set. View server logs: `docker compose -f docker-compose.prod.yml logs server`. Gmail users must use an App Password, not their account password. |
| **AI Advisor not responding** | Go to **Settings → Integrations → AI Advisor**, verify the provider is selected and the API key is saved. Use the **Test Connection** button to check connectivity. |
| **Port 80 already in use** | Edit `docker-compose.prod.yml` and change the nginx port mapping to an available port, e.g., `"8080:80"`. |
| **`docker compose` command not found** | You may have Docker Compose v1 installed (`docker-compose`). Upgrade to Docker Compose v2, which ships with Docker Desktop and recent Docker Engine installs. |
| **Migrations fail on update** | Check server logs for Prisma migration errors. If a migration was partially applied, you may need to resolve conflicts manually — open an issue on GitHub for help. |

---

## Security Recommendations

- **Generate strong secrets.** Use `openssl rand -base64 64` for both `JWT_SECRET` and `JWT_REFRESH_SECRET`. Never reuse secrets across instances.
- **Use HTTPS in production.** Browsers will block the httpOnly refresh cookie on HTTP origins in some configurations. HTTPS also protects your financial data in transit.
- **Enable 2FA.** Go to **Settings → Security → Two-Factor Authentication** and enable TOTP for every member of your household. Works with Google Authenticator, Authy, Bitwarden, and any TOTP-compatible app.
- **Keep Docker and the host OS updated.** Subscribe to Docker security announcements and run OS updates regularly.
- **Restrict database access.** In the production compose file, the `postgres` service has no external port binding — the database is only reachable inside the `kuber_network`. Do not add external port mappings for Postgres.
- **Back up regularly.** Financial data is irreplaceable. Automate daily database backups to off-server storage.
- **Review server logs occasionally.** `docker compose -f docker-compose.prod.yml logs server --tail 100` shows recent API activity and any errors.

---

## Community and Support

- **Bug reports:** [GitHub Issues](https://github.com/yourusername/kuber/issues)
- **Questions and ideas:** [GitHub Discussions](https://github.com/yourusername/kuber/discussions)
- **Security vulnerabilities:** Do not open a public issue — see the reporting instructions in [CONTRIBUTING.md](../CONTRIBUTING.md)
