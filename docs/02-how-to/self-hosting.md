# Self-hosting and deployment

Kuber ships as two container images and runs as three services. This guide gets
you from a machine with Docker to a working Instance.

## What you are running

| Service    | Image                            | Role                                                          |
| ---------- | -------------------------------- | ------------------------------------------------------------- |
| `postgres` | `postgres:16-alpine`             | Your data. The only service with a persistent volume.          |
| `server`   | `ghcr.io/t-dhruv/kuber-server`   | The API. Applies database migrations on every start.           |
| `client`   | `ghcr.io/t-dhruv/kuber-client`   | The edge. Serves the app and proxies `/api/` to the server.    |

The client image contains the only nginx Kuber ships, and it is what you publish
a port from. Nothing else needs to sit in front of it. See
[ADR-0001](../adr/0001-three-service-deploy-with-optional-observability.md).

There is deliberately no TLS termination in this stack — see
[Serving Kuber over HTTPS](https.md).

## Requirements

- Docker Engine with the Compose plugin
- About 1 GB of RAM and 2 GB of disk to start
- A machine that stays on. Everything is local; nothing is stored elsewhere.

## Install

Fetch the Compose file and the example configuration:

```bash
mkdir kuber && cd kuber
curl -fsSLO https://raw.githubusercontent.com/t-dhruv/Kuber/master/docker-compose.prod.yml
curl -fsSL  https://raw.githubusercontent.com/t-dhruv/Kuber/master/.env.example -o .env
```

Generate the four secrets. Kuber refuses to start without them:

```bash
printf 'POSTGRES_PASSWORD=%s\n'   "$(openssl rand -base64 32 | tr -d '/+=')" >> .env
printf 'JWT_SECRET=%s\n'          "$(openssl rand -base64 48 | tr -d '/+=')" >> .env
printf 'JWT_REFRESH_SECRET=%s\n'  "$(openssl rand -base64 48 | tr -d '/+=')" >> .env
printf 'AI_ENCRYPTION_KEY=%s\n'   "$(openssl rand -hex 32)" >> .env
```

`AI_ENCRYPTION_KEY` must be exactly 64 hex characters — `openssl rand -hex 32`
produces that. The server checks the length at startup and exits if it is wrong.
It encrypts stored AI provider keys, and is required even if you never configure
an AI provider.

If a variable appears twice in `.env`, the later line wins — so the lines you
just appended override the empty ones in the example file.

Pick the port you want to reach Kuber on. The default is 80:

```bash
echo 'HTTP_PORT=8080' >> .env
```

Choose the version to run. The Compose file defaults to `latest`, which only
ever points at a stable release — pre-releases are published under their exact
version and nothing else, so while Kuber is in beta you must pin it:

```bash
echo 'IMAGE_TAG=1.0.0-beta' >> .env
```

Note there is no `v` in the image tag, even though the git tag is `v1.0.0-beta`.

Start it:

```bash
docker compose -f docker-compose.prod.yml up -d
```

The first start takes a minute: Postgres initialises its volume, then the server
applies all migrations before accepting traffic. You can watch it:

```bash
docker compose -f docker-compose.prod.yml logs -f server
```

You are ready when all three services report healthy:

```bash
docker compose -f docker-compose.prod.yml ps
```

## Claim your Instance

Open `http://<your-host>:8080` and create the first User and Household through
the web UI. You never need database access to use your own Instance.

Two things happen automatically at this point:

- **You are signed in immediately**, without an email server. Verification is
  skipped when no email provider is configured, because a message nobody can
  deliver would lock you out of your own Instance
  ([ADR-0003](../adr/0003-email-verification-is-skipped-when-no-provider-is-configured.md)).
  Configure email later and verification applies from then on.
- **Registration closes.** Once a Household exists, open signup is refused, so
  exposing the Instance does not let strangers register on it. To reopen it
  deliberately, set `ALLOW_SIGNUP=true`.

Follow the [tutorial](../01-tutorial.md) to record your first Transaction.

## Pin a version

`latest` moves. To keep an Instance stable across restarts, pin the tag:

```bash
echo 'IMAGE_TAG=1.0.0' >> .env
docker compose -f docker-compose.prod.yml up -d
```

The image tag carries no `v` prefix: the git tag `v1.0.0` publishes images
tagged `1.0.0`, `1.0` and `1`, plus `latest`. A pre-release tag such as
`v1.0.0-beta` publishes `1.0.0-beta` only — it never moves `latest`, and never
claims a major or minor line.

## Running on a LAN without HTTPS

Kuber's refresh cookie is marked `Secure` by default, and browsers discard
`Secure` cookies sent over plain HTTP. On a trusted LAN, over `http://`, that
silently logs you out when your access token expires.

If you are reaching Kuber at something like `http://192.168.1.50:8080` and not
putting a TLS proxy in front of it, set:

```bash
echo 'COOKIE_SECURE=false' >> .env
docker compose -f docker-compose.prod.yml up -d
```

The server logs a warning at startup when this is disabled, so the trade-off is
visible rather than forgotten. Do not do this on an Instance reachable from the
internet — see [ADR-0002](../adr/0002-cookie-secure-is-configurable.md).

Set `CLIENT_URL` to the same address while you are here. The example file ships
`http://localhost`, and every link Kuber emails — password reset, email
verification, Household invites — is built from it, so on a LAN Instance those
links point at the recipient's own machine unless you correct it:

```bash
echo 'CLIENT_URL=http://192.168.1.50:8080' >> .env
```

## Behind a reverse proxy

If a proxy sits in front of Kuber, set `TRUST_PROXY=1` so the server reads the
client address from `X-Forwarded-For`. Without it, rate limiting buckets every
request under the proxy's address and one busy client can lock out everyone.

## Health

The client answers `/health` itself rather than proxying it, so a monitor can
tell "the Instance is unreachable" apart from "the server is unhealthy":

```bash
curl -fsS http://localhost:8080/health
# ok
```

The server has its own, on the internal network:

```bash
docker compose -f docker-compose.prod.yml exec server \
  wget -qO- http://localhost:9002/health
# {"status":"ok","name":"Kuber API"}
```

## Stopping and removing

Stop the Instance, keeping your data:

```bash
docker compose -f docker-compose.prod.yml down
```

Stop it and **delete your financial data permanently**:

```bash
docker compose -f docker-compose.prod.yml down -v
```

`-v` removes the Postgres volume. Take a [backup](backup.md) first.
