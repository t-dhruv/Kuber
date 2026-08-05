# Serving Kuber over HTTPS

Kuber does not terminate TLS. The stack is three services — Postgres, the
server, and the client — and the client's nginx is the edge, serving plain HTTP
on the port you publish.

That is deliberate. Certificate issuance and renewal are better handled by a
tool built for it than by a bundled nginx that has to be reconfigured on every
upgrade. See
[ADR-0001](../adr/0001-three-service-deploy-with-optional-observability.md).

So: put a reverse proxy or a tunnel in front of Kuber, and point it at the
client service.

## What the proxy needs to do

Whatever you use, three things matter:

1. **Forward to the client's published port**, not the server's. The client
   proxies `/api/` to the server itself. Do not route the API separately — you
   will bypass the edge's streaming and caching behaviour.
2. **Pass the forwarding headers.** `X-Forwarded-For` and `X-Forwarded-Proto`.
3. **Do not buffer responses.** Kuber streams AI advisor replies over
   server-sent events. A proxy that buffers holds the whole response and the
   reply appears only when it finishes.

## Configure Kuber for it

Publish Kuber's port on the loopback interface only, so the app is reachable
solely through the proxy. In `.env`:

```bash
HTTP_PORT=127.0.0.1:8080
```

Then set:

```bash
CLIENT_URL=https://kuber.example.com
TRUST_PROXY=1
COOKIE_SECURE=true
```

- `CLIENT_URL` is the origin CORS accepts. It must be the public HTTPS URL, not
  the internal one.
- `TRUST_PROXY=1` makes the server read the client address from
  `X-Forwarded-For`. Without it, rate limiting buckets everyone under the
  proxy's address and one busy client locks out the household.
- `COOKIE_SECURE=true` is the default, and correct once TLS terminates in front.

Apply with `docker compose -f docker-compose.prod.yml up -d`.

## Caddy

Caddy obtains and renews certificates on its own. A complete `Caddyfile`:

```caddyfile
kuber.example.com {
    reverse_proxy 127.0.0.1:8080 {
        flush_interval -1
    }
}
```

`flush_interval -1` disables response buffering, which is what keeps the advisor
streaming.

## nginx

```nginx
server {
    listen 443 ssl http2;
    server_name kuber.example.com;

    ssl_certificate     /etc/letsencrypt/live/kuber.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/kuber.example.com/privkey.pem;

    client_max_body_size 20m;   # CSV imports and receipt uploads

    location / {
        proxy_pass         http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_set_header   Connection        "";
    }

    # Server-sent events. Matched before the block above, so streams are not
    # buffered.
    location ~* ^/api/v1/.*/stream$ {
        proxy_pass         http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_set_header   Connection        "";
        proxy_buffering    off;
        proxy_cache        off;
        proxy_read_timeout 180s;
    }
}

server {
    listen 80;
    server_name kuber.example.com;
    return 301 https://$host$request_uri;
}
```

Certificates come from certbot or your own tooling; nothing about them is
Kuber-specific.

## Tailscale or Cloudflare Tunnel

If you would rather not expose a port at all, a tunnel gives you HTTPS without
opening the firewall.

For Cloudflare Tunnel, point the ingress at the client:

```yaml
ingress:
  - hostname: kuber.example.com
    service: http://localhost:8080
  - service: http_status:404
```

For Tailscale Serve:

```bash
tailscale serve --bg 8080
```

Both terminate TLS for you, so keep `COOKIE_SECURE=true` and set `CLIENT_URL` to
the tunnel hostname.

## Verify

```bash
curl -fsS https://kuber.example.com/health
# ok
```

Then sign in and reload the page. If you stay signed in, the refresh cookie made
a round trip and your `COOKIE_SECURE` and `CLIENT_URL` settings agree with
reality. If you are bounced to the login screen, they do not — check that
`CLIENT_URL` matches the address in your browser exactly, scheme included.

## No TLS at all?

On a trusted LAN you can skip this entirely, but you must then set
`COOKIE_SECURE=false`, or browsers will discard the refresh cookie and log you
out roughly every fifteen minutes. See
[Self-hosting and deployment](self-hosting.md#running-on-a-lan-without-https).
