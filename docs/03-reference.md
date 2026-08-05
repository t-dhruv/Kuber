# Reference

## Environment variables

All configuration lives in a single `.env` file beside `docker-compose.prod.yml`.
Values exported in your shell override the file.

`.env.example` in the repository is the annotated starting point.

### Required

Kuber refuses to start without these. There are no defaults, deliberately — a
guessable secret is worse than a failure to boot.

| Variable             | Description                                                        |
| -------------------- | ------------------------------------------------------------------ |
| `POSTGRES_PASSWORD`  | Password for the `kuber` database role. Set before the first start. |
| `JWT_SECRET`         | Signs access tokens. Use at least 32 random characters.             |
| `JWT_REFRESH_SECRET` | Signs refresh tokens. Must differ from `JWT_SECRET`.                |

Generate them with `openssl rand -base64 48 | tr -d '/+='`.

Changing `JWT_SECRET` or `JWT_REFRESH_SECRET` signs everyone out. Changing
`POSTGRES_PASSWORD` after the first start does **not** change the role's password
— Postgres only reads it when initialising the volume.

### Deployment

| Variable      | Default    | Description                                                                    |
| ------------- | ---------- | ------------------------------------------------------------------------------ |
| `IMAGE_TAG`   | `latest`   | Image tag both services pull. Pin to a version to keep an Instance stable.      |
| `HTTP_PORT`   | `80`       | Host port the client publishes. Accepts `127.0.0.1:8080` to bind loopback only. |
| `PORT`        | `9002`     | Port the server listens on inside the network. Rarely changed.                  |
| `NODE_ENV`    | `production` | Leave as `production` for a deployed Instance.                                |
| `DATABASE_URL`| —          | Set by the Compose file. Only override for an external Postgres.                |
| `CLIENT_URL`  | `http://localhost` | Origin allowed by CORS. Must exactly match the address in the browser, scheme included. |
| `TRUST_PROXY` | `1`        | Read the client address from `X-Forwarded-For`. Required behind a proxy.        |

### Access and sessions

| Variable        | Default | Description                                                                 |
| --------------- | ------- | --------------------------------------------------------------------------- |
| `COOKIE_SECURE` | `true`  | Marks the refresh cookie `Secure`. Set `false` only for plain-HTTP LAN use.  |
| `ALLOW_SIGNUP`  | unset   | Open registration. Unset closes it once a Household exists.                  |

`COOKIE_SECURE=false` lets the refresh cookie travel over plain HTTP. Browsers
discard `Secure` cookies on `http://`, so on a LAN Instance without it you are
logged out when the access token expires. The server warns at startup when it is
disabled. See [ADR-0002](adr/0002-cookie-secure-is-configurable.md).

`ALLOW_SIGNUP` accepts `true`, `1`, `yes`, `on` — and their negatives. Left empty,
signup is open only until the first Household exists, which is exactly long
enough for you to claim your Instance. Invited signup is never gated by this.
Setting it to `false` closes signup even on an empty Instance, which is why
`.env.example` ships it empty rather than `false` — copying the example must not
produce an Instance nobody can claim.

### Rate limiting

Windows are in milliseconds; maximums are requests per window per client.

| Variable                    | Default  |
| --------------------------- | -------- |
| `API_RATE_LIMIT_WINDOW_MS`  | `60000`  |
| `API_RATE_LIMIT_MAX`        | `2000`   |
| `AUTH_RATE_LIMIT_WINDOW_MS` | `900000` |
| `AUTH_RATE_LIMIT_MAX`       | `50`     |
| `LOGO_RATE_LIMIT_WINDOW_MS` | `60000`  |
| `LOGO_RATE_LIMIT_MAX`       | `120`    |

These only bucket per client if `TRUST_PROXY` is correct for your topology.

### Email

Optional. See [Configuring email](02-how-to/email.md) for what changes when you
set them. Resend takes precedence if both are configured.

| Variable         | Description                                        |
| ---------------- | -------------------------------------------------- |
| `RESEND_API_KEY` | Resend API key.                                     |
| `RESEND_FROM`    | Sender, e.g. `Kuber <kuber@yourdomain.com>`.        |
| `SMTP_HOST`      | SMTP server hostname.                               |
| `SMTP_PORT`      | `587` for STARTTLS, `465` for implicit TLS.         |
| `SMTP_USER`      | SMTP username.                                      |
| `SMTP_PASS`      | SMTP password. An App Password for Gmail.           |
| `SMTP_FROM`      | Sender address.                                     |

### Features

| Variable            | Description                                                             |
| ------------------- | ----------------------------------------------------------------------- |
| `AI_ENCRYPTION_KEY` | 64 hex characters. Encrypts stored AI provider keys at rest.             |
| `TOTP_APP_NAME`     | Name shown in authenticator apps. Defaults to `Kuber`.                   |
| `VAPID_PUBLIC_KEY`  | Web push. Generate with `npx web-push generate-vapid-keys`.              |
| `VAPID_PRIVATE_KEY` | Web push private key.                                                    |
| `VAPID_SUBJECT`     | Contact URI for push, e.g. `mailto:you@example.com`.                     |
| `LOG_LEVEL`         | `error`, `warn`, `info`, `debug`. Defaults to `info`.                    |

### Observability overlay

Only read when the overlay is composed in.

| Variable           | Description              |
| ------------------ | ------------------------ |
| `GRAFANA_USER`     | Grafana admin username.  |
| `GRAFANA_PASSWORD` | Grafana admin password.  |

## Ports

| Port   | Service  | Exposure                                                    |
| ------ | -------- | ----------------------------------------------------------- |
| `80`   | client   | Published to the host as `HTTP_PORT`. The only entry point.  |
| `9002` | server   | Internal to the Compose network. Not published.              |
| `5432` | postgres | Internal to the Compose network. Not published.              |

Reaching the API means reaching the client, which proxies `/api/` onward.

## Health endpoints

| Endpoint            | Served by | Response                            |
| ------------------- | --------- | ----------------------------------- |
| `/health`           | client    | `ok`                                |
| `/health` on `:9002`| server    | `{"status":"ok","name":"Kuber API"}` |

The client answers its own rather than proxying, so a monitor can distinguish an
unreachable Instance from an unhealthy server.

## CSV import format

Kuber imports Transactions from CSV. The importer maps columns in the UI, so
headers need not match exactly — but the simplest file it accepts is three
columns:

```csv
Date,Description,Amount
2026-04-01,Grocery Store,-55.00
2026-04-02,Gas Station,-40.00
2026-04-03,Salary,3200.00
```

**Date** — one date per row. `YYYY-MM-DD` is unambiguous and always correct.
`MM/DD/YYYY` and `DD/MM/YYYY` are both supported, and you choose which during
the mapping step, because a file alone cannot tell them apart.

**Description** — the merchant or memo. Becomes the Transaction's description,
and is what the Rule engine matches against when categorising.

**Amount** — a single signed column. Negative is money out, positive is money in.
If your bank exports separate debit and credit columns, map both; the importer
combines them.

Anything else your bank includes can be left unmapped and is ignored.

Import runs in three steps: upload, map the columns, then confirm. Nothing is
written until the final step, so a wrong mapping costs nothing but a retry.

Transactions imported this way are not automatically marked as Transfers. A
movement between two of your own Accounts imports as two ordinary Transactions;
pair them afterwards so they are excluded from income and expense totals.
