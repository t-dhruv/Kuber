# Logging & Telemetry Design

**Date:** 2026-04-15
**Status:** Approved
**Scope:** Server-side structured logging, metrics collection, and Grafana-based observability for Kuber

---

## Problem

Production issues (unexpected errors, silent failures, slow requests, data correctness bugs) are
undiagnosable because the application has no structured logging or telemetry. 248 raw `console.*`
calls across 43 server files produce unstructured, unsearchable output with no context.

---

## Goals

- Replace all `console.*` calls with structured, levelled, JSON logging
- Expose Prometheus metrics for HTTP routes and background jobs
- Ship logs to Loki for Grafana-based log exploration
- Provide pre-built Grafana dashboards for metrics and logs — zero manual setup
- Support configurable log levels globally and per-module via environment variables
- Keep infrastructure lightweight and self-contained in Docker Compose

## Non-Goals

- Frontend/client telemetry (separate concern)
- Distributed tracing / per-request spans
- Full-text search (Loki label-based filtering is sufficient)
- Cloud log shipping (everything stays local)

---

## Tech Stack

| Component | Library / Tool | Purpose |
|---|---|---|
| Structured logging | `pino` + `pino-http` | Fast JSON logger, request middleware |
| Dev pretty-print | `pino-pretty` | Human-readable logs in development |
| Metrics | `prom-client` | Prometheus metrics exposition |
| Metrics store | Prometheus | Scrapes `/metrics` every 15s |
| Log storage | Grafana Loki | Stores indexed log streams |
| Log shipper | Promtail | Ships Docker container stdout to Loki |
| Observability UI | Grafana | Dashboards for metrics + log explorer |

---

## Architecture

### Logger (`server/src/lib/logger.ts`)

A single Pino instance created once and exported. All modules import from this file.

**Configuration:**
- `level`: controlled by `LOG_LEVEL` env var (default: `info` in production, `debug` in development)
- `transport`: `pino-pretty` when `NODE_ENV=development`, JSON stdout in production
- Per-module override: `LOG_LEVEL_<MODULE>` env var (e.g. `LOG_LEVEL_IMPORT=debug`)

**Child logger pattern** — every file creates a module-scoped child at the top:
```typescript
const log = logger.child({ module: 'import' });
```

### Standard Log Fields

Every log entry includes:

| Field | Type | Example | Purpose |
|---|---|---|---|
| `level` | string | `"info"` | Log level |
| `time` | number | `1713200000000` | Unix ms timestamp |
| `module` | string | `"import"` | Subsystem name |
| `requestId` | string | `"req_abc123"` | Request correlation ID |
| `householdId` | string | `"clx..."` | Tenant scope |
| `msg` | string | `"Import completed"` | Human-readable message |
| `err` | object | `{ message, stack, type }` | Serialized error via Pino |
| `durationMs` | number | `142` | Elapsed time for timed operations |

**Rule:** data goes in the object argument, message goes in the string — never interpolate variables
into the message string. This preserves queryability in Grafana.

```typescript
// Correct
log.info({ filename, householdId }, 'Processing file');
log.error({ err, householdId }, 'Import failed');

// Wrong — kills queryability
log.info(`Processing file ${filename}`);
```

### Request Middleware (`pino-http`)

Mounted in `server/src/index.ts` before all routes:

- Assigns a `requestId` (UUID v4) to each incoming request
- Logs request receipt: `method`, `url`, `userAgent`
- Logs request completion: `statusCode`, `durationMs`
- Binds `{ requestId }` to `req.log` at the middleware layer (before auth)
- After `requireAuth` runs and `req.householdId` is populated, routes bind it via
  `req.log = req.log.child({ householdId: req.householdId })` — or routes pass it explicitly per call
- Public routes (e.g. `/health`, `/api/v1/auth/*`) will not have `householdId` on their log entries — expected

### Log Levels

In order of severity: `trace` → `debug` → `info` → `warn` → `error` → `fatal`

| Level | When to use |
|---|---|
| `trace` | Very detailed internal steps (loop iterations, intermediate values) |
| `debug` | Diagnostic info useful during development or targeted debugging |
| `info` | Normal operational events (job started, import completed, email sent) |
| `warn` | Recoverable unexpected conditions (retry attempted, fallback used) |
| `error` | Operation failed, requires attention |
| `fatal` | Process-level failure, server cannot continue |

---

## Metrics

### Library: `prom-client`

All metrics defined in `server/src/lib/metrics.ts`, exported as named objects used across the codebase.

**Endpoint:** `GET /metrics` — Prometheus exposition format, plain text. Not behind `requireAuth`.
Protected at network level (Nginx denies external access; only Prometheus container reaches it internally).

### HTTP Metrics (auto via Express middleware)

| Metric | Type | Labels |
|---|---|---|
| `http_requests_total` | Counter | `method`, `route`, `status_code` |
| `http_request_duration_seconds` | Histogram | `method`, `route`, `status_code` |
| `http_request_errors_total` | Counter | `method`, `route`, `error_type` |

### Background Job Metrics (manual instrumentation)

| Metric | Type | Labels |
|---|---|---|
| `job_runs_total` | Counter | `job`, `status` (`success`/`failure`) |
| `job_duration_seconds` | Histogram | `job` |
| `job_last_run_timestamp` | Gauge | `job` |

Jobs instrumented: `networth`, `account-balance`, `digest-email`, `proactive-ai`, `imap-watcher`

### Business Metrics

| Metric | Type | Labels |
|---|---|---|
| `transactions_imported_total` | Counter | `household_id`, `source` |
| `ai_advisor_requests_total` | Counter | `provider`, `status` |
| `rules_applied_total` | Counter | `household_id` |
| `emails_sent_total` | Counter | `type`, `status` |

### Runtime Metrics

Auto-collected via `collectDefaultMetrics()`: Node.js heap, event loop lag, GC pause, active handles/requests.

### Background Job Instrumentation Pattern

```typescript
const end = jobDurationSeconds.startTimer({ job: 'networth' });
try {
  await takeNetWorthSnapshot();
  jobRunsTotal.inc({ job: 'networth', status: 'success' });
  jobLastRunTimestamp.set({ job: 'networth' }, Date.now() / 1000);
  log.info({ durationMs: end() * 1000 }, 'Net worth snapshot complete');
} catch (err) {
  jobRunsTotal.inc({ job: 'networth', status: 'failure' });
  log.error({ err }, 'Net worth snapshot failed');
} finally {
  end();
}
```

---

## Infrastructure

### New Docker Compose Services

```yaml
services:
  prometheus:
    image: prom/prometheus:latest
    ports: ["9090:9090"]
    volumes:
      - ./observability/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus_data:/prometheus

  loki:
    image: grafana/loki:latest
    volumes:
      - ./observability/loki/loki.yml:/etc/loki/loki.yml
      - loki_data:/loki

  promtail:
    image: grafana/promtail:latest
    volumes:
      - ./observability/promtail/promtail.yml:/etc/promtail/promtail.yml
      - /var/run/docker.sock:/var/run/docker.sock:ro

  grafana:
    image: grafana/grafana:latest
    ports: ["3001:3000"]
    volumes:
      - ./observability/grafana/provisioning:/etc/grafana/provisioning
      - grafana_data:/var/lib/grafana
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
      - GF_USERS_ALLOW_SIGN_UP=false
```

### Directory Structure

```
observability/
  prometheus/
    prometheus.yml          # Scrape config: server:4000/metrics every 15s
  loki/
    loki.yml                # Loki storage config
  promtail/
    promtail.yml            # Docker service discovery, ships to Loki
  grafana/
    provisioning/
      datasources/
        prometheus.yml      # Auto-provision Prometheus datasource
        loki.yml            # Auto-provision Loki datasource
      dashboards/
        dashboard.yml       # Dashboard provider config
        kuber-overview.json # HTTP metrics, error rates, latency
        kuber-jobs.json     # Background job health
        kuber-logs.json     # Log explorer panel
```

### Log Flow

```
server stdout (JSON)
  → Docker logs
    → Promtail (Docker socket, auto-discovers containers)
      → Loki (indexed by container_name, compose_service, level)
        → Grafana (LogQL queries)
```

### Prometheus Scrape Config

```yaml
scrape_configs:
  - job_name: kuber-server
    static_configs:
      - targets: ['server:4000']
    scrape_interval: 15s
    metrics_path: /metrics
```

### Nginx Change

```nginx
location /metrics {
  deny all;
}
```

### Port Map (updated)

| Service    | Internal | Exposed (dev) |
|------------|----------|---------------|
| Postgres   | 5432     | 5433          |
| Server     | 4000     | 4000          |
| Client     | 3000     | 3000          |
| Nginx      | 80       | 80            |
| Grafana    | 3000     | 3001          |
| Prometheus | 9090     | 9090          |
| Loki       | 3100     | —             |
| Promtail   | —        | —             |

---

## Migration Strategy

### Scope

- **248** `console.*` calls across **43** server files → replace with structured Pino calls
- **4** client `console.*` calls → out of scope

### File Categories

| Category | Files | Logger source |
|---|---|---|
| Route files (`routes/*.ts`) | ~30 | `req.log` (request-scoped, `requestId` + `householdId` bound) |
| Lib/service files (`lib/*.ts`) | ~13 | `logger.child({ module: '...' })` at top of file |
| Background jobs (`index.ts` intervals) | 1 | `logger.child({ module: 'jobs' })` |
| Startup/shutdown | `index.ts` | Direct `logger.info/error` |

### Error Serialization Rule

Always pass errors as `{ err }` — never stringify manually:
```typescript
// Correct — preserves stack trace
log.error({ err, householdId }, 'Import failed');

// Wrong — loses stack trace
log.error(`Import failed: ${err.message}`);
```

### Environment Variables

```bash
LOG_LEVEL=info                  # Global default (trace/debug/info/warn/error/fatal)
LOG_LEVEL_IMPORT=debug          # Override for import module
LOG_LEVEL_AI=warn               # Override for AI module
LOG_LEVEL_RECURRING=debug       # Override for recurring module
# Pattern: LOG_LEVEL_<MODULE_UPPERCASE>=<level>
```

---

## New Dependencies

```bash
# Server
pino
pino-http
pino-pretty          # devDependency

# Metrics
prom-client
```

No new client dependencies.

---

## Grafana Dashboards (pre-built)

### kuber-overview
- Request rate (req/s) by route
- HTTP error rate (4xx, 5xx) over time
- p50 / p95 / p99 request latency by route
- Top slowest routes

### kuber-jobs
- Job run success/failure rate per job
- Job duration over time
- Last run timestamp per job (detect stalled jobs)

### kuber-logs
- Log stream explorer (filter by `module`, `level`, `householdId`, `requestId`)
- Error log panel (auto-filtered to `level=error`)
- Warning log panel

---

## Testing

- Unit test the logger module: verify child loggers inherit module field, level overrides work
- Integration: verify `/metrics` endpoint returns valid Prometheus format
- Integration: verify `pino-http` attaches `requestId` to response header `X-Request-Id` (useful for client-side debugging)
