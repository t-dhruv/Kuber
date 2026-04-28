# How-to: Set Up HTTPS with Let's Encrypt

## Goal
Secure your Kuber instance with free HTTPS certificates from Let's Encrypt, so browsers trust your site and your httpOnly cookies work correctly.

## Prerequisites
- A domain name pointing to your server IP (e.g., `finance.example.com`)
- Kuber running via Docker Compose (with the included Nginx container)
- Certbot installed on the host

## Steps

### 1. Point Your Domain to Your Server

In your DNS provider (e.g., Namecheap, Cloudflare), create an **A record**:

| Type | Name | Value |
|------|------|-------|
| A | finance.example.com | your-server-ip-address |

Wait for DNS to propagate (usually a few minutes, up to an hour).

### 2. Install Certbot on the Host

```bash
# Debian/Ubuntu
sudo apt install certbot

# Or via snap
sudo snap install --classic certbot
```

### 3. Stop Nginx Temporarily and Get the Certificate

```bash
docker compose -f docker-compose.prod.yml stop nginx

sudo certbot certonly --standalone \
  -d finance.example.com \
  --email you@example.com \
  --agree-tos --non-interactive
```

Certificates are saved to `/etc/letsencrypt/live/finance.example.com/`.

### 4. Update Nginx Configuration

Edit `nginx/prod.conf` to add an SSL server block:

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

### 5. Mount Certificates and Restart

Uncomment the cert volume in `docker-compose.prod.yml`:

```yaml
  nginx:
    volumes:
      - ./nginx/prod.conf:/etc/nginx/conf.d/default.conf:ro
      - /etc/letsencrypt/live/finance.example.com:/etc/nginx/certs:ro
```

Then restart:

```bash
docker compose -f docker-compose.prod.yml up -d nginx
```

### 6. Set Up Auto-Renewal

Add a cron job to renew certificates monthly:

```bash
# Edit crontab
sudo crontab -e

# Add this line (renews at 3 AM on the 1st of each month)
0 3 1 * * certbot renew --quiet && docker compose -f /path/to/kuber/docker-compose.prod.yml exec nginx nginx -s reload
```

## Confirmation

1. Visit `https://finance.example.com` in your browser
2. You should see the Kuber login page with a **padlock icon** in the address bar
3. Login works without being immediately logged out (HTTPS fixes httpOnly cookie issues)

## Troubleshooting

| Problem | Solution |
|----------|----------|
| **Certbot says "Failed to obtain certificate"** | DNS may not have propagated yet. Wait and retry. Also check port 80 isn't blocked by a firewall. |
| **Site loads but "Not Secure" warning** | Check that `ssl_certificate` and `ssl_certificate_key` paths in nginx config point to the correct files. |
| **Login loop on HTTPS** | Ensure `CLIENT_URL` in `.env` is set to `https://finance.example.com` (no trailing slash). |
