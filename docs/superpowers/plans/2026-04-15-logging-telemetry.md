# Logging & Telemetry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add production-grade structured logging (Pino), Prometheus metrics, and a Grafana observability stack to Kuber so production issues can be diagnosed without guesswork.

**Architecture:** Pino replaces all 248 `console.*` calls with structured JSON logs. `prom-client` exposes a `/metrics` endpoint Prometheus scrapes every 15s. Promtail ships container stdout to Loki. Grafana provides pre-provisioned dashboards for HTTP metrics, job health, and log exploration — all running as Docker Compose services.

**Tech Stack:** `pino`, `pino-http`, `pino-pretty` (dev), `prom-client`, Prometheus, Grafana Loki, Promtail, Grafana

**Spec:** `docs/superpowers/specs/2026-04-15-logging-telemetry-design.md`

---

## File Map

### New Files
| File | Purpose |
|---|---|
| `server/src/lib/logger.ts` | Pino instance + `createModuleLogger()` factory |
| `server/src/lib/logger.test.ts` | Unit tests for logger |
| `server/src/lib/metrics.ts` | All `prom-client` metric objects + HTTP middleware |
| `server/src/lib/metrics.test.ts` | Tests for `/metrics` endpoint and metric registration |
| `observability/prometheus/prometheus.yml` | Prometheus scrape config |
| `observability/loki/loki.yml` | Loki storage config |
| `observability/promtail/promtail.yml` | Promtail Docker service discovery |
| `observability/grafana/provisioning/datasources/prometheus.yml` | Auto-provision Prometheus datasource |
| `observability/grafana/provisioning/datasources/loki.yml` | Auto-provision Loki datasource |
| `observability/grafana/provisioning/dashboards/dashboard.yml` | Grafana dashboard provider |
| `observability/grafana/provisioning/dashboards/kuber-overview.json` | HTTP metrics dashboard |
| `observability/grafana/provisioning/dashboards/kuber-jobs.json` | Background jobs dashboard |
| `observability/grafana/provisioning/dashboards/kuber-logs.json` | Log explorer dashboard |

### Modified Files
| File | Change |
|---|---|
| `server/package.json` | Add `pino`, `pino-http`, `prom-client`; add `pino-pretty` to devDependencies |
| `server/src/index.ts` | Add pino-http middleware, `/metrics` endpoint, migrate 14 console.* calls, instrument 5 background jobs |
| `server/src/middleware/auth.ts` | Bind `householdId` to `req.log` after auth succeeds |
| `server/src/lib/priceCache.ts` | Migrate 2 console.warn calls |
| `server/src/lib/imapWatcher.ts` | Migrate 1 console.error call |
| `server/src/lib/webhookFire.ts` | Migrate 2 console.* calls |
| `server/src/lib/webPush.ts` | Migrate 3 console.* calls |
| `server/src/lib/email.ts` | Migrate 1 console.* call |
| `server/src/lib/audit.ts` | Migrate 1 console.* call |
| `server/src/routes/*.ts` (35 files) | Migrate all console.* to `req.log.*` |
| `docker-compose.yml` | Add prometheus, loki, promtail, grafana services + volumes |
| `nginx/prod.conf` | Block external access to `/metrics` |

---

## Task 1: Install Dependencies

**Files:**
- Modify: `server/package.json`

- [ ] **Step 1: Install runtime dependencies**

```bash
cd server
npm install pino pino-http prom-client
```

- [ ] **Step 2: Install dev dependency**

```bash
npm install --save-dev pino-pretty
```

- [ ] **Step 3: Verify installation**

```bash
node -e "require('pino'); require('pino-http'); require('prom-client'); console.log('ok')"
```

Expected output: `ok`

- [ ] **Step 4: Commit**

```bash
cd ..
git add server/package.json server/package-lock.json
git commit -m "chore: add pino, pino-http, prom-client dependencies"
```

---

## Task 2: Create Logger Module

**Files:**
- Create: `server/src/lib/logger.ts`
- Create: `server/src/lib/logger.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `server/src/lib/logger.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('logger', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('createModuleLogger returns a child logger with module field', async () => {
    const { createModuleLogger } = await import('./logger.js');
    const log = createModuleLogger('test-module');
    expect(log.bindings()).toMatchObject({ module: 'test-module' });
  });

  it('createModuleLogger applies LOG_LEVEL_<MODULE> override', async () => {
    process.env.LOG_LEVEL_MYMOD = 'debug';
    const { createModuleLogger } = await import('./logger.js');
    const log = createModuleLogger('mymod');
    expect(log.level).toBe('debug');
  });

  it('createModuleLogger falls back to global level when no override', async () => {
    delete process.env.LOG_LEVEL_IMPORT;
    process.env.LOG_LEVEL = 'warn';
    const { createModuleLogger } = await import('./logger.js');
    const log = createModuleLogger('import');
    expect(log.level).toBe('warn');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd server
npx vitest run src/lib/logger.test.ts
```

Expected: FAIL — `Cannot find module './logger.js'`

- [ ] **Step 3: Create the logger module**

Create `server/src/lib/logger.ts`:

```typescript
import pino from 'pino';

const isDev = process.env.NODE_ENV !== 'production';
const globalLevel = process.env.LOG_LEVEL ?? (isDev ? 'debug' : 'info');

export const logger = pino({
  level: globalLevel,
  ...(isDev && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:HH:MM:ss',
        ignore: 'pid,hostname',
      },
    },
  }),
  serializers: {
    err: pino.stdSerializers.err,
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
  },
});

/**
 * Creates a module-scoped child logger.
 * Respects LOG_LEVEL_<MODULE_UPPERCASE> env var for per-module level override.
 *
 * Usage:
 *   const log = createModuleLogger('import');
 *   log.info({ filename }, 'Processing file');
 *   log.error({ err }, 'Import failed');
 */
export function createModuleLogger(module: string): pino.Logger {
  const override = process.env[`LOG_LEVEL_${module.toUpperCase()}`];
  const child = logger.child({ module });
  if (override) {
    child.level = override;
  }
  return child;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/lib/logger.test.ts
```

Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
cd ..
git add server/src/lib/logger.ts server/src/lib/logger.test.ts
git commit -m "feat: add pino logger module with per-module level support"
```

---

## Task 3: Create Metrics Module

**Files:**
- Create: `server/src/lib/metrics.ts`
- Create: `server/src/lib/metrics.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `server/src/lib/metrics.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

describe('metrics', () => {
  it('exports all required metric objects', async () => {
    const metrics = await import('./metrics.js');
    expect(metrics.httpRequestsTotal).toBeDefined();
    expect(metrics.httpRequestDurationSeconds).toBeDefined();
    expect(metrics.jobRunsTotal).toBeDefined();
    expect(metrics.jobDurationSeconds).toBeDefined();
    expect(metrics.jobLastRunTimestamp).toBeDefined();
    expect(metrics.transactionsImportedTotal).toBeDefined();
    expect(metrics.aiAdvisorRequestsTotal).toBeDefined();
    expect(metrics.rulesAppliedTotal).toBeDefined();
    expect(metrics.emailsSentTotal).toBeDefined();
  });

  it('/metrics endpoint returns prometheus format', async () => {
    const { metricsHandler } = await import('./metrics.js');
    const app = express();
    app.get('/metrics', metricsHandler);

    const res = await request(app).get('/metrics');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/plain/);
    expect(res.text).toContain('# HELP');
    expect(res.text).toContain('nodejs_version_info');
  });
});
```

Note: `supertest` is not yet installed. Install it:

```bash
cd server
npm install --save-dev supertest @types/supertest
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/lib/metrics.test.ts
```

Expected: FAIL — `Cannot find module './metrics.js'`

- [ ] **Step 3: Create the metrics module**

Create `server/src/lib/metrics.ts`:

```typescript
import { register, collectDefaultMetrics, Counter, Histogram, Gauge } from 'prom-client';
import type { Request, Response } from 'express';

// Collect Node.js default metrics (heap, event loop lag, GC, etc.)
collectDefaultMetrics({ register });

// ── HTTP Metrics ─────────────────────────────────────────────────────────────

export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

export const httpRequestDurationSeconds = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

// ── Background Job Metrics ────────────────────────────────────────────────────

export const jobRunsTotal = new Counter({
  name: 'job_runs_total',
  help: 'Total background job executions',
  labelNames: ['job', 'status'],
  registers: [register],
});

export const jobDurationSeconds = new Histogram({
  name: 'job_duration_seconds',
  help: 'Background job duration in seconds',
  labelNames: ['job'],
  buckets: [0.1, 0.5, 1, 5, 10, 30, 60, 120],
  registers: [register],
});

export const jobLastRunTimestamp = new Gauge({
  name: 'job_last_run_timestamp',
  help: 'Unix timestamp of the last job run (seconds)',
  labelNames: ['job'],
  registers: [register],
});

// ── Business Metrics ──────────────────────────────────────────────────────────

export const transactionsImportedTotal = new Counter({
  name: 'transactions_imported_total',
  help: 'Total transactions imported',
  labelNames: ['household_id', 'source'],
  registers: [register],
});

export const aiAdvisorRequestsTotal = new Counter({
  name: 'ai_advisor_requests_total',
  help: 'Total AI advisor requests',
  labelNames: ['provider', 'status'],
  registers: [register],
});

export const rulesAppliedTotal = new Counter({
  name: 'rules_applied_total',
  help: 'Total categorization rules applied',
  labelNames: ['household_id'],
  registers: [register],
});

export const emailsSentTotal = new Counter({
  name: 'emails_sent_total',
  help: 'Total emails sent',
  labelNames: ['type', 'status'],
  registers: [register],
});

// ── /metrics endpoint handler ─────────────────────────────────────────────────

export async function metricsHandler(_req: Request, res: Response): Promise<void> {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/lib/metrics.test.ts
```

Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
cd ..
git add server/src/lib/metrics.ts server/src/lib/metrics.test.ts server/package.json server/package-lock.json
git commit -m "feat: add prom-client metrics module"
```

---

## Task 4: Wire Middleware in index.ts

Add `pino-http` request logging and the `/metrics` endpoint to the Express app.

**Files:**
- Modify: `server/src/index.ts`

- [ ] **Step 1: Add imports at the top of index.ts**

In `server/src/index.ts`, add these imports after the existing imports block (before `// ── Startup env validation`):

```typescript
import pinoHttp from 'pino-http';
import { randomUUID } from 'crypto';
import { logger } from './lib/logger.js';
import { metricsHandler, httpRequestsTotal, httpRequestDurationSeconds } from './lib/metrics.js';
```

- [ ] **Step 2: Add pino-http middleware**

After the line `app.use(cookieParser());` and before the rate limiter `app.use('/api/v1/auth', authLimiter);`, add:

```typescript
// ── Request logging (pino-http) ───────────────────────────────────────────────
app.use(pinoHttp({
  logger,
  genReqId: () => randomUUID(),
  customReceivedMessage: (req) => `→ ${req.method} ${req.url}`,
  customSuccessMessage: (req, res) => `← ${req.method} ${req.url} ${res.statusCode}`,
  customErrorMessage: (req, res, err) => `← ${req.method} ${req.url} ${res.statusCode} ${err.message}`,
  // Don't log health checks — too noisy
  autoLogging: {
    ignore: (req) => req.url === '/health',
  },
  // Expose requestId to clients for support/debugging
  customResponseHeaders: (req) => ({
    'X-Request-Id': (req as any).id,
  }),
}));

// ── HTTP metrics middleware ───────────────────────────────────────────────────
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const route = (req.route?.path as string) ?? req.path;
    const labels = { method: req.method, route, status_code: String(res.statusCode) };
    httpRequestsTotal.inc(labels);
    httpRequestDurationSeconds.observe(labels, (Date.now() - start) / 1000);
  });
  next();
});
```

- [ ] **Step 3: Add the /metrics endpoint**

After the health check line `app.get('/health', ...)`, add:

```typescript
// Prometheus metrics — internal only (Nginx blocks external access)
app.get('/metrics', metricsHandler);
```

- [ ] **Step 4: Replace startup console.* calls**

Replace these lines in index.ts:

```typescript
// Before — in REQUIRED_ENV validation block:
console.error(`[startup] Missing required environment variable: ${key}`);

// Replace with:
logger.fatal({ key }, 'Missing required environment variable');
```

```typescript
// Before:
console.error('[startup] CLIENT_URL must be set in production');

// Replace with:
logger.fatal('CLIENT_URL must be set in production');
```

```typescript
// Before — in the server.listen callback:
console.log(`Kuber server running on :${PORT}`);

// Replace with:
logger.info({ port: PORT }, 'Kuber server started');
```

```typescript
// Before — in shutdown():
console.log(`[shutdown] ${signal} received — shutting down gracefully`);
console.log('[shutdown] Database disconnected. Bye.');
console.error('[shutdown] Error disconnecting database:', err);
console.error('[shutdown] Forced exit after timeout');

// Replace with:
logger.info({ signal }, 'Shutdown signal received');
logger.info('Database disconnected');
logger.error({ err }, 'Error disconnecting database');
logger.error('Forced exit after timeout');
```

- [ ] **Step 5: Verify server starts**

```bash
cd server
npx tsx src/index.ts &
sleep 2
curl -s http://localhost:9002/health
curl -s http://localhost:9002/metrics | head -5
kill %1
```

Expected: `{"status":"ok","name":"Kuber API"}` then Prometheus text output starting with `# HELP`

- [ ] **Step 6: Commit**

```bash
cd ..
git add server/src/index.ts
git commit -m "feat: wire pino-http request logging and /metrics endpoint"
```

---

## Task 5: Update Auth Middleware

Bind `householdId` to `req.log` after authentication so all route logs carry the tenant context automatically.

**Files:**
- Modify: `server/src/middleware/auth.ts`

- [ ] **Step 1: Update the requireAuth function**

Replace the entire `auth.ts` file content:

```typescript
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { prisma } from '../lib/prisma.js';

export interface AuthRequest extends Request {
  userId?: string;
  householdId?: string;
}

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });

  const token = auth.slice(7);

  // Try JWT first
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string; householdId: string };
    req.userId = decoded.userId;
    req.householdId = decoded.householdId;
    // Bind householdId to the request logger so all route logs carry it automatically
    if (req.log) {
      req.log = req.log.child({ householdId: decoded.householdId });
    }
    return next();
  } catch {
    // JWT failed — fall through to API token check
  }

  // Try API token
  try {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const apiToken = await prisma.apiToken.findUnique({ where: { tokenHash } });

    if (!apiToken) return res.status(401).json({ error: 'Invalid token' });
    if (apiToken.expiresAt && apiToken.expiresAt <= new Date()) {
      return res.status(401).json({ error: 'Token expired' });
    }

    // Fire-and-forget lastUsedAt update
    prisma.apiToken.update({ where: { id: apiToken.id }, data: { lastUsedAt: new Date() } }).catch(() => {});

    req.userId = apiToken.userId;
    req.householdId = apiToken.householdId;
    if (req.log) {
      req.log = req.log.child({ householdId: apiToken.householdId });
    }
    return next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add server/src/middleware/auth.ts
git commit -m "feat: bind householdId to req.log in auth middleware"
```

---

## Task 6: Migrate Library Files

Replace all `console.*` calls in `server/src/lib/` files. These files use module-scoped child loggers (not `req.log`).

**Files:**
- Modify: `server/src/lib/priceCache.ts`, `server/src/lib/imapWatcher.ts`, `server/src/lib/webhookFire.ts`, `server/src/lib/webPush.ts`, `server/src/lib/email.ts`, `server/src/lib/audit.ts`

**Pattern for every lib file** — add at the top after imports:
```typescript
import { createModuleLogger } from './logger.js';
const log = createModuleLogger('<module-name>');
```

Then replace each `console.*` call:
- `console.log('[module] message', data)` → `log.info({ data }, 'message')`
- `console.warn('[module] message', err.message)` → `log.warn({ err }, 'message')`
- `console.error('[module] message', err)` → `log.error({ err }, 'message')`

**Important:** Put the error/data object first (`{ err }`), the message string second. Never interpolate variables into the message string.

- [ ] **Step 1: Migrate priceCache.ts**

Add after last import in `server/src/lib/priceCache.ts`:
```typescript
import { createModuleLogger } from './logger.js';
const log = createModuleLogger('priceCache');
```

Replace:
```typescript
// Before:
console.warn(`[priceCache] Failed to fetch ${upper}:`, (err as Error).message);
// After:
log.warn({ err, ticker: upper }, 'Failed to fetch price');
```

```typescript
// Before:
console.warn('[priceCache] getLiveBenchmarks failed, using fallback:', (err as Error).message);
// After:
log.warn({ err }, 'getLiveBenchmarks failed, using fallback');
```

- [ ] **Step 2: Migrate imapWatcher.ts**

Add after last import in `server/src/lib/imapWatcher.ts`:
```typescript
import { createModuleLogger } from './logger.js';
const log = createModuleLogger('imap');
```

Find the `console.error` call(s) and replace with `log.error({ err }, 'message')`.

- [ ] **Step 3: Migrate webhookFire.ts**

Add after last import in `server/src/lib/webhookFire.ts`:
```typescript
import { createModuleLogger } from './logger.js';
const log = createModuleLogger('webhook');
```

Replace all `console.*` calls with `log.*({ err, ...context }, 'message')` equivalents.

- [ ] **Step 4: Migrate webPush.ts**

Add after last import in `server/src/lib/webPush.ts`:
```typescript
import { createModuleLogger } from './logger.js';
const log = createModuleLogger('webPush');
```

Replace all `console.*` calls with `log.*` equivalents.

- [ ] **Step 5: Migrate email.ts**

Add after last import in `server/src/lib/email.ts`:
```typescript
import { createModuleLogger } from './logger.js';
const log = createModuleLogger('email');
```

Replace all `console.*` calls with `log.*` equivalents. Also instrument sent emails counter:

```typescript
import { emailsSentTotal } from './metrics.js';

// After a successful send:
emailsSentTotal.inc({ type: emailType, status: 'success' });

// After a failed send:
emailsSentTotal.inc({ type: emailType, status: 'failure' });
log.error({ err }, 'Failed to send email');
```

- [ ] **Step 6: Migrate audit.ts**

Add after last import in `server/src/lib/audit.ts`:
```typescript
import { createModuleLogger } from './logger.js';
const log = createModuleLogger('audit');
```

Replace all `console.*` calls with `log.*` equivalents.

- [ ] **Step 7: Verify no console.* remain in lib/**

```bash
cd server
grep -r "console\." src/lib/ --include="*.ts" | grep -v ".test.ts"
```

Expected: only `src/lib/logger.test.ts` and `src/lib/metrics.test.ts` references (if any). No production lib files.

- [ ] **Step 8: Commit**

```bash
cd ..
git add server/src/lib/
git commit -m "feat: migrate lib/ service files to structured pino logging"
```

---

## Task 7: Migrate Route Files

Replace all `console.*` calls in `server/src/routes/` files. Route handlers have access to `req.log` (pino-http bound, with `requestId` and after auth: `householdId`). Use `req.log` inside route handlers.

**Files:**
All 35 files in `server/src/routes/`

**Pattern for every route file** — routes do NOT need a module-level `createModuleLogger` call because `req.log` is already bound. The only change is replacing `console.*` with `req.log.*`:

```typescript
// Before (typical error handler at end of route):
console.error('[investments/holdings GET]', err);
res.status(500).json({ error: 'Failed to fetch holdings' });

// After:
req.log.error({ err }, 'Get holdings failed');
res.status(500).json({ error: 'Failed to fetch holdings' });
```

```typescript
// Before (info/debug logging):
console.log('[settings] Email connector configured for', req.householdId);

// After:
req.log.info('Email connector configured');
// Note: householdId is already on req.log — don't repeat it in the data object
```

Work through each file systematically:

- [ ] **Step 1: Migrate high-count route files first**

Files with most console.* calls (address these first to validate the pattern):

**`server/src/routes/settings.ts`** (27 calls) — The most complex. Every `console.log`/`console.error` inside a route handler becomes `req.log.info`/`req.log.error`. Any that log `householdId` can drop it (already on `req.log`).

**`server/src/routes/investments.ts`** (17 calls) — All are `console.error('[investments/X]', err)`. Replace with `req.log.error({ err }, 'descriptive message')`.

**`server/src/routes/transactions.ts`** (15 calls) — Same pattern.

**`server/src/routes/reports.ts`** (15 calls) — Same pattern.

**`server/src/routes/auth.ts`** (12 calls) — Auth routes don't have `req.householdId` yet (no requireAuth). These should use a module-level logger instead:

```typescript
// Add at top of auth.ts, after imports:
import { createModuleLogger } from '../lib/logger.js';
const log = createModuleLogger('auth');

// Then use log.* instead of req.log.*
log.warn({ email }, 'Login failed: invalid credentials');
log.error({ err }, 'Login error');
```

**`server/src/routes/accounts.ts`** (12 calls) — `req.log.*` pattern.

- [ ] **Step 2: Migrate remaining route files**

Apply the same `req.log.*` pattern (or `log.*` for auth.ts) to all remaining route files:

- `routes/advisor.ts` (8) → `req.log.*`
- `routes/recurring.ts` (7) → `req.log.*`
- `routes/rules.ts` (7) → `req.log.*`
- `routes/wealth.ts` (7) → `req.log.*`
- `routes/goals.ts` (6) → `req.log.*`
- `routes/import.ts` (6) — also add `transactionsImportedTotal.inc({ household_id, source })` after successful import confirmation
- `routes/taxAccounts.ts` (5) → `req.log.*`
- `routes/assets.ts` (5) → `req.log.*`
- `routes/budgets.ts` (5) → `req.log.*`
- `routes/liabilities.ts` (7) → `req.log.*`
- `routes/cashflow.ts` (4) → `req.log.*`
- `routes/webhooks.ts` (4) → `req.log.*`
- `routes/categories.ts` (3) → `req.log.*`
- `routes/duplicates.ts` (3) → `req.log.*`
- `routes/autoCategorize.ts` (2) — also add `rulesAppliedTotal.inc({ household_id })` after rules run
- `routes/advice.ts` (2) → `req.log.*`
- `routes/exports.ts` (2) → `req.log.*`
- `routes/investmentIntel.ts` (2) → `req.log.*`
- `routes/networth.ts` (2) → `req.log.*`
- `routes/notifications.ts` (2) → `req.log.*`
- `routes/push.ts` (2) → `req.log.*`
- `routes/schedules.ts` (2) → `req.log.*`
- `routes/splits.ts` (2) → `req.log.*`
- `routes/users.ts` (2) → `req.log.*`
- `routes/apiTokens.ts` (1) → `req.log.*`
- `routes/audit.ts` (1) → `req.log.*`
- `routes/checkpoints.ts` (1) → `req.log.*`
- `routes/receipts.ts` (1) → `req.log.*`

For `routes/advisor.ts` — add AI metrics instrumentation:
```typescript
import { aiAdvisorRequestsTotal } from '../lib/metrics.js';
// After successful AI response:
aiAdvisorRequestsTotal.inc({ provider: selectedProvider, status: 'success' });
// After AI error:
aiAdvisorRequestsTotal.inc({ provider: selectedProvider, status: 'failure' });
```

- [ ] **Step 3: Verify no console.* remain in routes/**

```bash
cd server
grep -r "console\." src/routes/ --include="*.ts"
```

Expected: zero results

- [ ] **Step 4: Run unit tests to check for regressions**

```bash
npx vitest run
```

Expected: all existing tests pass

- [ ] **Step 5: Commit**

```bash
cd ..
git add server/src/routes/
git commit -m "feat: migrate routes/ to structured req.log logging + business metrics"
```

---

## Task 8: Instrument Background Jobs

Add metrics timing and structured logging to the 5 background jobs defined in `server/src/index.ts`.

**Files:**
- Modify: `server/src/index.ts`

- [ ] **Step 1: Add metrics imports at top of index.ts**

The metrics import added in Task 4 already includes `httpRequestsTotal` and `httpRequestDurationSeconds`. Extend it to include job metrics:

```typescript
import { metricsHandler, httpRequestsTotal, httpRequestDurationSeconds,
         jobRunsTotal, jobDurationSeconds, jobLastRunTimestamp } from './lib/metrics.js';
```

- [ ] **Step 2: Add module logger for jobs**

Add after the logger import:
```typescript
const jobLog = logger.child({ module: 'jobs' });
```

- [ ] **Step 3: Instrument the digest email job**

Replace the `setInterval` for digest email (the `checkIfDigestDue` one):

```typescript
setInterval(async () => {
  const end = jobDurationSeconds.startTimer({ job: 'digest-email' });
  try {
    const now = new Date();
    const schedules = await prisma.reportSchedule.findMany({ where: { enabled: true } });
    for (const schedule of schedules) {
      const isDue = checkIfDigestDue(schedule, now);
      if (isDue) {
        jobLog.info({ householdId: schedule.householdId }, 'Sending digest email');
        await sendDigestEmail(schedule.householdId);
        await prisma.reportSchedule.update({
          where: { id: schedule.id },
          data: { lastSentAt: now },
        });
      }
    }
    jobRunsTotal.inc({ job: 'digest-email', status: 'success' });
    jobLastRunTimestamp.set({ job: 'digest-email' }, Date.now() / 1000);
  } catch (err) {
    jobRunsTotal.inc({ job: 'digest-email', status: 'failure' });
    jobLog.error({ err }, 'Digest email job failed');
  } finally {
    end();
  }
}, 60 * 60 * 1000);
```

- [ ] **Step 4: Instrument the proactive AI job**

Replace the proactive AI `setInterval`:

```typescript
setInterval(async () => {
  const end = jobDurationSeconds.startTimer({ job: 'proactive-ai' });
  try {
    const households = await prisma.household.findMany({ select: { id: true } });
    for (const h of households) {
      await runProactiveChecks(prisma, h.id).catch((err) => {
        jobLog.error({ err, householdId: h.id }, 'Proactive AI check failed for household');
      });
    }
    jobRunsTotal.inc({ job: 'proactive-ai', status: 'success' });
    jobLastRunTimestamp.set({ job: 'proactive-ai' }, Date.now() / 1000);
  } catch (err) {
    jobRunsTotal.inc({ job: 'proactive-ai', status: 'failure' });
    jobLog.error({ err }, 'Proactive AI job failed');
  } finally {
    end();
  }
}, 24 * 60 * 60 * 1000);
```

- [ ] **Step 5: Instrument the IMAP watcher job**

Replace the IMAP `setInterval`:

```typescript
setInterval(async () => {
  const end = jobDurationSeconds.startTimer({ job: 'imap-watcher' });
  try {
    await runImapCheckForAllHouseholds(prisma);
    jobRunsTotal.inc({ job: 'imap-watcher', status: 'success' });
    jobLastRunTimestamp.set({ job: 'imap-watcher' }, Date.now() / 1000);
  } catch (err) {
    jobRunsTotal.inc({ job: 'imap-watcher', status: 'failure' });
    jobLog.error({ err }, 'IMAP watcher job failed');
  } finally {
    end();
  }
}, 60 * 60 * 1000);
```

- [ ] **Step 6: Instrument startup jobs**

Replace the startup job calls in `server.listen()`:

```typescript
const server = app.listen(PORT, () => {
  logger.info({ port: PORT }, 'Kuber server started');

  const netWorthEnd = jobDurationSeconds.startTimer({ job: 'networth' });
  takeNetWorthSnapshot()
    .then(() => {
      jobRunsTotal.inc({ job: 'networth', status: 'success' });
      jobLastRunTimestamp.set({ job: 'networth' }, Date.now() / 1000);
    })
    .catch((err) => {
      jobRunsTotal.inc({ job: 'networth', status: 'failure' });
      jobLog.error({ err }, 'Startup net worth snapshot failed');
    })
    .finally(() => netWorthEnd());

  const balanceEnd = jobDurationSeconds.startTimer({ job: 'account-balance' });
  runAccountBalanceSnapshot()
    .then(() => {
      jobRunsTotal.inc({ job: 'account-balance', status: 'success' });
      jobLastRunTimestamp.set({ job: 'account-balance' }, Date.now() / 1000);
    })
    .catch((err) => {
      jobRunsTotal.inc({ job: 'account-balance', status: 'failure' });
      jobLog.error({ err }, 'Startup account balance snapshot failed');
    })
    .finally(() => balanceEnd());
});
```

- [ ] **Step 7: Commit**

```bash
git add server/src/index.ts
git commit -m "feat: instrument background jobs with metrics and structured logging"
```

---

## Task 9: Create Observability Config Files

Create all configuration files for Prometheus, Loki, Promtail, and Grafana provisioning.

**Files:** All new files in `observability/`

- [ ] **Step 1: Create directory structure**

```bash
mkdir -p observability/prometheus
mkdir -p observability/loki
mkdir -p observability/promtail
mkdir -p observability/grafana/provisioning/datasources
mkdir -p observability/grafana/provisioning/dashboards
```

- [ ] **Step 2: Create prometheus.yml**

Create `observability/prometheus/prometheus.yml`:

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: kuber-server
    static_configs:
      - targets: ['server:9002']
    metrics_path: /metrics
    scrape_interval: 15s
```

- [ ] **Step 3: Create loki.yml**

Create `observability/loki/loki.yml`:

```yaml
auth_enabled: false

server:
  http_listen_port: 3100
  grpc_listen_port: 9096

common:
  instance_addr: 127.0.0.1
  path_prefix: /loki
  storage:
    filesystem:
      chunks_directory: /loki/chunks
      rules_directory: /loki/rules
  replication_factor: 1
  ring:
    kvstore:
      store: inmemory

query_range:
  results_cache:
    cache:
      embedded_cache:
        enabled: true
        max_size_mb: 100

schema_config:
  configs:
    - from: 2020-10-24
      store: tsdb
      object_store: filesystem
      schema: v13
      index:
        prefix: index_
        period: 24h

ruler:
  alertmanager_url: http://localhost:9093

limits_config:
  reject_old_samples: true
  reject_old_samples_max_age: 168h

analytics:
  reporting_enabled: false
```

- [ ] **Step 4: Create promtail.yml**

Create `observability/promtail/promtail.yml`:

```yaml
server:
  http_listen_port: 9080
  grpc_listen_port: 0

positions:
  filename: /tmp/positions.yaml

clients:
  - url: http://loki:3100/loki/api/v1/push

scrape_configs:
  - job_name: docker
    docker_sd_configs:
      - host: unix:///var/run/docker.sock
        refresh_interval: 5s
    relabel_configs:
      - source_labels: ['__meta_docker_container_name']
        regex: '/(.*)'
        target_label: 'container_name'
      - source_labels: ['__meta_docker_compose_service']
        target_label: 'compose_service'
      - source_labels: ['__meta_docker_container_log_stream']
        target_label: 'logstream'
    pipeline_stages:
      - json:
          expressions:
            level: level
            module: module
            requestId: requestId
            householdId: householdId
      - labels:
          level:
          module:
      - timestamp:
          source: time
          format: UnixMs
```

- [ ] **Step 5: Create Grafana datasource provisioning**

Create `observability/grafana/provisioning/datasources/prometheus.yml`:

```yaml
apiVersion: 1

datasources:
  - name: Prometheus
    type: prometheus
    uid: prometheus
    url: http://prometheus:9090
    access: proxy
    isDefault: true
    editable: false
```

Create `observability/grafana/provisioning/datasources/loki.yml`:

```yaml
apiVersion: 1

datasources:
  - name: Loki
    type: loki
    uid: loki
    url: http://loki:3100
    access: proxy
    editable: false
```

- [ ] **Step 6: Create Grafana dashboard provider**

Create `observability/grafana/provisioning/dashboards/dashboard.yml`:

```yaml
apiVersion: 1

providers:
  - name: Kuber
    orgId: 1
    folder: Kuber
    type: file
    disableDeletion: false
    updateIntervalSeconds: 30
    options:
      path: /etc/grafana/provisioning/dashboards
```

- [ ] **Step 7: Create kuber-overview dashboard**

Create `observability/grafana/provisioning/dashboards/kuber-overview.json`:

```json
{
  "title": "Kuber — HTTP Overview",
  "uid": "kuber-overview",
  "schemaVersion": 39,
  "version": 1,
  "refresh": "30s",
  "time": { "from": "now-1h", "to": "now" },
  "timezone": "browser",
  "tags": ["kuber"],
  "panels": [
    {
      "id": 1,
      "type": "timeseries",
      "title": "Request Rate (req/s)",
      "gridPos": { "h": 8, "w": 12, "x": 0, "y": 0 },
      "datasource": { "type": "prometheus", "uid": "prometheus" },
      "targets": [
        {
          "expr": "sum(rate(http_requests_total[5m])) by (route)",
          "legendFormat": "{{route}}",
          "refId": "A"
        }
      ],
      "fieldConfig": {
        "defaults": { "unit": "reqps", "min": 0 },
        "overrides": []
      },
      "options": {
        "tooltip": { "mode": "multi", "sort": "desc" },
        "legend": { "displayMode": "table", "placement": "bottom", "calcs": ["mean", "max"] }
      }
    },
    {
      "id": 2,
      "type": "timeseries",
      "title": "Error Rate (5xx/s)",
      "gridPos": { "h": 8, "w": 12, "x": 12, "y": 0 },
      "datasource": { "type": "prometheus", "uid": "prometheus" },
      "targets": [
        {
          "expr": "sum(rate(http_requests_total{status_code=~\"5..\"}[5m])) by (route)",
          "legendFormat": "{{route}}",
          "refId": "A"
        }
      ],
      "fieldConfig": {
        "defaults": { "unit": "reqps", "min": 0, "color": { "mode": "fixed", "fixedColor": "red" } },
        "overrides": []
      },
      "options": {
        "tooltip": { "mode": "multi", "sort": "desc" },
        "legend": { "displayMode": "table", "placement": "bottom", "calcs": ["mean", "max"] }
      }
    },
    {
      "id": 3,
      "type": "timeseries",
      "title": "p95 Latency by Route (s)",
      "gridPos": { "h": 8, "w": 12, "x": 0, "y": 8 },
      "datasource": { "type": "prometheus", "uid": "prometheus" },
      "targets": [
        {
          "expr": "histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le, route))",
          "legendFormat": "p95 {{route}}",
          "refId": "A"
        }
      ],
      "fieldConfig": {
        "defaults": { "unit": "s", "min": 0 },
        "overrides": []
      },
      "options": {
        "tooltip": { "mode": "multi", "sort": "desc" },
        "legend": { "displayMode": "table", "placement": "bottom", "calcs": ["mean", "max"] }
      }
    },
    {
      "id": 4,
      "type": "timeseries",
      "title": "4xx Errors by Route",
      "gridPos": { "h": 8, "w": 12, "x": 12, "y": 8 },
      "datasource": { "type": "prometheus", "uid": "prometheus" },
      "targets": [
        {
          "expr": "sum(rate(http_requests_total{status_code=~\"4..\"}[5m])) by (route, status_code)",
          "legendFormat": "{{status_code}} {{route}}",
          "refId": "A"
        }
      ],
      "fieldConfig": {
        "defaults": { "unit": "reqps", "min": 0, "color": { "mode": "fixed", "fixedColor": "orange" } },
        "overrides": []
      },
      "options": {
        "tooltip": { "mode": "multi", "sort": "desc" },
        "legend": { "displayMode": "table", "placement": "bottom", "calcs": ["mean", "max"] }
      }
    },
    {
      "id": 5,
      "type": "stat",
      "title": "Node.js Heap Used",
      "gridPos": { "h": 4, "w": 6, "x": 0, "y": 16 },
      "datasource": { "type": "prometheus", "uid": "prometheus" },
      "targets": [
        {
          "expr": "nodejs_heap_size_used_bytes",
          "refId": "A"
        }
      ],
      "fieldConfig": {
        "defaults": { "unit": "bytes", "thresholds": { "mode": "absolute", "steps": [{ "color": "green", "value": null }, { "color": "orange", "value": 200000000 }, { "color": "red", "value": 400000000 }] } },
        "overrides": []
      },
      "options": { "reduceOptions": { "calcs": ["lastNotNull"] }, "orientation": "auto", "textMode": "auto", "colorMode": "background" }
    },
    {
      "id": 6,
      "type": "stat",
      "title": "Event Loop Lag (p99)",
      "gridPos": { "h": 4, "w": 6, "x": 6, "y": 16 },
      "datasource": { "type": "prometheus", "uid": "prometheus" },
      "targets": [
        {
          "expr": "nodejs_eventloop_lag_p99_seconds * 1000",
          "refId": "A"
        }
      ],
      "fieldConfig": {
        "defaults": { "unit": "ms", "thresholds": { "mode": "absolute", "steps": [{ "color": "green", "value": null }, { "color": "orange", "value": 10 }, { "color": "red", "value": 50 }] } },
        "overrides": []
      },
      "options": { "reduceOptions": { "calcs": ["lastNotNull"] }, "orientation": "auto", "textMode": "auto", "colorMode": "background" }
    }
  ]
}
```

- [ ] **Step 8: Create kuber-jobs dashboard**

Create `observability/grafana/provisioning/dashboards/kuber-jobs.json`:

```json
{
  "title": "Kuber — Background Jobs",
  "uid": "kuber-jobs",
  "schemaVersion": 39,
  "version": 1,
  "refresh": "1m",
  "time": { "from": "now-6h", "to": "now" },
  "timezone": "browser",
  "tags": ["kuber"],
  "panels": [
    {
      "id": 1,
      "type": "timeseries",
      "title": "Job Success Rate",
      "gridPos": { "h": 8, "w": 12, "x": 0, "y": 0 },
      "datasource": { "type": "prometheus", "uid": "prometheus" },
      "targets": [
        {
          "expr": "sum(rate(job_runs_total{status=\"success\"}[30m])) by (job)",
          "legendFormat": "{{job}}",
          "refId": "A"
        }
      ],
      "fieldConfig": { "defaults": { "unit": "short", "min": 0 }, "overrides": [] },
      "options": { "tooltip": { "mode": "multi" }, "legend": { "displayMode": "table", "placement": "bottom", "calcs": ["sum"] } }
    },
    {
      "id": 2,
      "type": "timeseries",
      "title": "Job Failures",
      "gridPos": { "h": 8, "w": 12, "x": 12, "y": 0 },
      "datasource": { "type": "prometheus", "uid": "prometheus" },
      "targets": [
        {
          "expr": "sum(rate(job_runs_total{status=\"failure\"}[30m])) by (job)",
          "legendFormat": "{{job}}",
          "refId": "A"
        }
      ],
      "fieldConfig": { "defaults": { "unit": "short", "min": 0, "color": { "mode": "fixed", "fixedColor": "red" } }, "overrides": [] },
      "options": { "tooltip": { "mode": "multi" }, "legend": { "displayMode": "table", "placement": "bottom", "calcs": ["sum"] } }
    },
    {
      "id": 3,
      "type": "timeseries",
      "title": "Job Duration (p95)",
      "gridPos": { "h": 8, "w": 12, "x": 0, "y": 8 },
      "datasource": { "type": "prometheus", "uid": "prometheus" },
      "targets": [
        {
          "expr": "histogram_quantile(0.95, sum(rate(job_duration_seconds_bucket[30m])) by (le, job))",
          "legendFormat": "p95 {{job}}",
          "refId": "A"
        }
      ],
      "fieldConfig": { "defaults": { "unit": "s", "min": 0 }, "overrides": [] },
      "options": { "tooltip": { "mode": "multi" }, "legend": { "displayMode": "table", "placement": "bottom", "calcs": ["mean", "max"] } }
    },
    {
      "id": 4,
      "type": "table",
      "title": "Last Run Timestamp",
      "gridPos": { "h": 8, "w": 12, "x": 12, "y": 8 },
      "datasource": { "type": "prometheus", "uid": "prometheus" },
      "targets": [
        {
          "expr": "job_last_run_timestamp",
          "legendFormat": "{{job}}",
          "refId": "A",
          "instant": true
        }
      ],
      "fieldConfig": {
        "defaults": { "unit": "dateTimeAsLocal" },
        "overrides": []
      },
      "options": { "sortBy": [{ "displayName": "job" }] }
    }
  ]
}
```

- [ ] **Step 9: Create kuber-logs dashboard**

Create `observability/grafana/provisioning/dashboards/kuber-logs.json`:

```json
{
  "title": "Kuber — Logs",
  "uid": "kuber-logs",
  "schemaVersion": 39,
  "version": 1,
  "refresh": "30s",
  "time": { "from": "now-1h", "to": "now" },
  "timezone": "browser",
  "tags": ["kuber"],
  "templating": {
    "list": [
      {
        "name": "level",
        "type": "custom",
        "label": "Level",
        "current": { "text": "All", "value": "" },
        "options": [
          { "text": "All", "value": "" },
          { "text": "error", "value": "error" },
          { "text": "warn", "value": "warn" },
          { "text": "info", "value": "info" },
          { "text": "debug", "value": "debug" }
        ]
      },
      {
        "name": "module",
        "type": "custom",
        "label": "Module",
        "current": { "text": "All", "value": "" },
        "options": [
          { "text": "All", "value": "" },
          { "text": "import", "value": "import" },
          { "text": "ai", "value": "ai" },
          { "text": "auth", "value": "auth" },
          { "text": "jobs", "value": "jobs" },
          { "text": "email", "value": "email" },
          { "text": "webhook", "value": "webhook" },
          { "text": "imap", "value": "imap" }
        ]
      }
    ]
  },
  "panels": [
    {
      "id": 1,
      "type": "logs",
      "title": "Log Stream (use label filters in query bar to filter by level/module)",
      "gridPos": { "h": 20, "w": 24, "x": 0, "y": 0 },
      "datasource": { "type": "loki", "uid": "loki" },
      "targets": [
        {
          "expr": "{container_name=\"kuber_server\"}",
          "refId": "A",
          "legendFormat": ""
        }
      ],
      "options": {
        "dedupStrategy": "none",
        "showLabels": false,
        "showTime": true,
        "wrapLogMessage": true,
        "prettifyLogMessage": true,
        "enableLogDetails": true,
        "sortOrder": "Descending"
      }
    },
    {
      "id": 2,
      "type": "logs",
      "title": "Errors Only",
      "gridPos": { "h": 10, "w": 24, "x": 0, "y": 20 },
      "datasource": { "type": "loki", "uid": "loki" },
      "targets": [
        {
          "expr": "{container_name=\"kuber_server\", level=\"error\"}",
          "refId": "A"
        }
      ],
      "options": {
        "dedupStrategy": "none",
        "showLabels": true,
        "showTime": true,
        "wrapLogMessage": true,
        "prettifyLogMessage": true,
        "enableLogDetails": true,
        "sortOrder": "Descending"
      }
    }
  ]
}
```

- [ ] **Step 10: Commit all observability config files**

```bash
git add observability/
git commit -m "feat: add observability config files (Prometheus, Loki, Promtail, Grafana)"
```

---

## Task 10: Update docker-compose.yml

Add the four observability services and their volumes.

**Files:**
- Modify: `docker-compose.yml`

- [ ] **Step 1: Add observability services**

In `docker-compose.yml`, add the following services before the `volumes:` section:

```yaml
  prometheus:
    image: prom/prometheus:v2.51.0
    container_name: kuber_prometheus
    restart: unless-stopped
    ports:
      - "9090:9090"
    volumes:
      - ./observability/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - prometheus_data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--storage.tsdb.retention.time=15d'
      - '--web.console.libraries=/etc/prometheus/console_libraries'
      - '--web.console.templates=/etc/prometheus/consoles'
    networks:
      - kuber_net
    depends_on:
      - server

  loki:
    image: grafana/loki:3.0.0
    container_name: kuber_loki
    restart: unless-stopped
    volumes:
      - ./observability/loki/loki.yml:/etc/loki/loki.yml:ro
      - loki_data:/loki
    command: -config.file=/etc/loki/loki.yml
    networks:
      - kuber_net

  promtail:
    image: grafana/promtail:3.0.0
    container_name: kuber_promtail
    restart: unless-stopped
    volumes:
      - ./observability/promtail/promtail.yml:/etc/promtail/promtail.yml:ro
      - /var/run/docker.sock:/var/run/docker.sock:ro
    command: -config.file=/etc/promtail/promtail.yml
    networks:
      - kuber_net
    depends_on:
      - loki

  grafana:
    image: grafana/grafana:10.4.0
    container_name: kuber_grafana
    restart: unless-stopped
    ports:
      - "3001:3000"
    volumes:
      - ./observability/grafana/provisioning:/etc/grafana/provisioning:ro
      - grafana_data:/var/lib/grafana
    environment:
      - GF_SECURITY_ADMIN_USER=admin
      - GF_SECURITY_ADMIN_PASSWORD=admin
      - GF_USERS_ALLOW_SIGN_UP=false
      - GF_ANALYTICS_REPORTING_ENABLED=false
      - GF_ANALYTICS_CHECK_FOR_UPDATES=false
    networks:
      - kuber_net
    depends_on:
      - prometheus
      - loki
```

- [ ] **Step 2: Add volumes**

In the `volumes:` section, add:

```yaml
  prometheus_data:
  loki_data:
  grafana_data:
```

- [ ] **Step 3: Verify the compose file is valid**

```bash
docker compose config --quiet
```

Expected: exits 0 with no errors

- [ ] **Step 4: Commit**

```bash
git add docker-compose.yml
git commit -m "feat: add prometheus, loki, promtail, grafana to docker-compose"
```

---

## Task 11: Block /metrics in Nginx

Prevent the Prometheus metrics endpoint from being accessible externally through the Nginx reverse proxy.

**Files:**
- Modify: `nginx/prod.conf`

- [ ] **Step 1: Add the deny block**

In `nginx/prod.conf`, add this location block inside the HTTP server block, before the `location /api/` block:

```nginx
    # Block external access to Prometheus metrics endpoint
    # Only the internal Prometheus container scrapes this directly
    location = /metrics {
        deny all;
        return 404;
    }
```

- [ ] **Step 2: Commit**

```bash
git add nginx/prod.conf
git commit -m "fix: block external access to /metrics endpoint in nginx"
```

---

## Task 12: Smoke Test the Full Stack

Verify everything works end-to-end.

- [ ] **Step 1: Start the full stack**

```bash
docker compose up -d
```

- [ ] **Step 2: Verify server logs are structured JSON**

```bash
docker logs kuber_server --tail 20
```

Expected: JSON lines with `level`, `time`, `msg` fields. No plain `console.log` text.

- [ ] **Step 3: Verify /metrics endpoint**

```bash
curl -s http://localhost:9002/metrics | grep "http_requests_total"
```

Expected: output containing `# HELP http_requests_total Total number of HTTP requests`

- [ ] **Step 4: Generate some traffic and check Prometheus**

```bash
# Generate a few requests
curl -s http://localhost:9002/health
curl -s http://localhost:9002/api/v1/auth/login -X POST \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"wrong"}'

# Check Prometheus has scraped the metrics
curl -s "http://localhost:9090/api/v1/query?query=http_requests_total" | python3 -m json.tool | grep '"status"'
```

Expected: `"status": "success"` with non-empty `result` array

- [ ] **Step 5: Open Grafana and verify dashboards**

Open `http://localhost:3001` in browser (admin / admin).

Check:
- Datasources page: Prometheus and Loki show green "Data source connected" status
- Dashboards → Kuber folder: 3 dashboards visible (HTTP Overview, Background Jobs, Logs)
- HTTP Overview dashboard: shows request rate data
- Logs dashboard: shows log entries from kuber_server container

- [ ] **Step 6: Verify /metrics is blocked externally**

```bash
# Should be blocked by nginx (port 80 is the external-facing port)
curl -s http://localhost:80/metrics
```

Expected: 404 response (not Prometheus text)

- [ ] **Step 7: Final commit — update AUDITOR.md**

Update `AUDITOR.md` to record this sprint, then commit:

```bash
git add AUDITOR.md
git commit -m "chore: update AUDITOR.md — logging and telemetry sprint complete"
```

---

## Summary

| Task | Commits | What ships |
|---|---|---|
| 1 | 1 | Dependencies installed |
| 2 | 1 | `logger.ts` — Pino with per-module levels |
| 3 | 1 | `metrics.ts` — prom-client metric objects |
| 4 | 1 | pino-http middleware + `/metrics` endpoint |
| 5 | 1 | Auth middleware binds `householdId` to `req.log` |
| 6 | 1 | All `lib/` files migrated to structured logging |
| 7 | 1 | All `routes/` files migrated + business metrics |
| 8 | 1 | Background jobs instrumented with metrics |
| 9 | 1 | All observability config files created |
| 10 | 1 | `docker-compose.yml` updated |
| 11 | 1 | Nginx blocks `/metrics` externally |
| 12 | 1 | AUDITOR.md updated |

**Total: 12 commits. After completion: zero `console.*` in production code, Grafana available at `:3001`.**
