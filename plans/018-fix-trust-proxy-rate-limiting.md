# Plan 018: Make rate limiting per-client by configuring Express `trust proxy`

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 66c013c..HEAD -- server/src/index.ts .env.example docs/03-reference.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `66c013c`, 2026-07-27

## Why this matters

Kuber's documented production deployment puts the API behind the bundled Nginx
reverse proxy (`docker-compose.prod.yml` → `nginx/prod.conf`). Express is never
told to trust that proxy, so `req.ip` resolves to the **Nginx container's IP for
every single request**. `express-rate-limit` keys its buckets on `req.ip`.

The consequences are concrete:

1. **Brute-force protection does not work.** The auth limiter (50 requests per
   15 minutes) is a single global bucket shared by every user, not a per-IP
   bucket. An attacker gets 50 password attempts per window regardless of how
   many source IPs they use — but so does everyone else combined.
2. **Trivial denial of service.** Any one client can spend the 50-request auth
   budget and lock every other user in the household out of logging in for the
   rest of the window.
3. The same applies to the general API limiter (2000/min), shared globally.

The fix is to tell Express how many reverse-proxy hops to trust. This must be a
**hop count, not `true`** — setting `trust proxy` to `true` makes Express accept
the left-most `X-Forwarded-For` entry, which any client can forge, converting
this bug into a rate-limit *bypass*. A hop count makes Express read the Nth
entry from the right, which a client cannot forge.

## Current state

Files involved:

- `server/src/index.ts` — Express app creation, rate limiters, and all
  middleware wiring. Contains the bug (the missing `trust proxy` setting).
- `nginx/prod.conf` — the bundled reverse proxy; already sets the forwarding
  headers correctly. **Read-only reference, do not modify.**
- `.env.example` — documents every environment variable for self-hosters.
- `docs/03-reference.md` — the environment-variable reference table.

`server/src/index.ts:126-129` — the app is created with no `trust proxy` call
anywhere in the file:

```ts
const app = express();
const PORT = process.env.PORT ?? 9002;

const clientUrl = process.env.CLIENT_URL ?? 'http://localhost:3000';
```

`server/src/index.ts:131-137` — an existing helper for reading positive integer
environment variables. **Reuse this helper; do not write a new one:**

```ts
// ── Rate limiters ─────────────────────────────────────────────────────────────
function positiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
```

Note: `positiveIntEnv` rejects `0` (it requires `> 0`), so it **cannot** be used
for the trust-proxy hop count, where `0` is a meaningful value meaning "no
proxy". Step 1 adds a separate small parser for this.

`server/src/index.ts:140-153` — the two limiters that depend on `req.ip`:

```ts
// Auth endpoints: strict limit to slow brute-force attacks
const authLimiter = rateLimit({
  windowMs: positiveIntEnv('AUTH_RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000),
  max: positiveIntEnv('AUTH_RATE_LIMIT_MAX', 50),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
  skip: () => process.env.NODE_ENV === 'test',
});
```

`nginx/prod.conf:20-23` — the proxy already forwards the client address
correctly, which is why a hop count of 1 is the right default:

```nginx
proxy_set_header   Host              $host;
proxy_set_header   X-Real-IP         $remote_addr;
proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
proxy_set_header   X-Forwarded-Proto $scheme;
```

### Repo conventions to follow

- Environment variables are read directly from `process.env` at module scope in
  `server/src/index.ts`, with a typed helper and an inline fallback. Match the
  style of `positiveIntEnv` above.
- Fatal misconfiguration in production exits the process. See the existing
  guard at `server/src/index.ts:122-125`:
  ```ts
  if (process.env.NODE_ENV === 'production' && !process.env.CLIENT_URL) {
    logger.fatal('CLIENT_URL must be set in production');
    process.exit(1);
  }
  ```
  Do **not** add a fatal guard for this variable — it has a safe default.
- Server tests live in `server/tests/`, use Vitest, and are named
  `<subject>.test.ts`. Route/middleware tests use `supertest`. Use
  `server/tests/routes/accounts.test.ts` as the structural pattern.
- Per `CLAUDE.md`: API error responses are always
  `res.status(n).json({ error: 'message' })`. This plan does not add new
  endpoints, so no response-shape changes are expected.

## Commands you will need

| Purpose         | Command                                                       | Expected on success        |
|-----------------|---------------------------------------------------------------|----------------------------|
| Typecheck       | `npm exec --workspace=server -- tsc --noEmit`                  | exit 0, no output errors   |
| Run one test    | `npm run test --workspace=server -- tests/middleware/trustProxy.test.ts` | all pass         |
| Server tests    | `npm run test --workspace=server`                              | 647+ passing, 0 failing    |
| Lint            | `npm run lint --workspace=server`                              | exit 0 (warnings OK)       |
| Build           | `npm run build --workspace=server`                             | exit 0                     |

Note: this repo's lint currently emits ~513 pre-existing warnings on the server
workspace. Warnings are acceptable; **errors are not**. Do not attempt to fix
unrelated warnings.

## Scope

**In scope** (the only files you should modify):

- `server/src/index.ts`
- `server/tests/middleware/trustProxy.test.ts` (create)
- `.env.example`
- `docs/03-reference.md`

**Out of scope** (do NOT touch, even though they look related):

- `nginx/prod.conf` and `nginx/*.conf` — already correct; changing the proxy
  headers would break the hop-count assumption this plan relies on.
- `docker-compose.yml`, `docker-compose.prod.yml` — no changes needed; the
  variable has a safe default.
- `server/src/middleware/auth.ts` — authentication is unrelated to this fix.
- The rate-limit `max`/`windowMs` **values**. Do not retune the limits. Once
  bucketing is per-client the existing numbers are appropriate, and changing
  them in the same commit makes the security fix unreviewable.
- Adding IP capture to the audit log. That is a separate tracked finding; doing
  it here expands the blast radius of a one-line security fix.

## Git workflow

- Branch: `fix/trust-proxy-rate-limiting`
- Commit style: Conventional Commits, as used throughout `git log`
  (e.g. `fix: restore client session on refresh`).
  Suggested message: `fix: bucket rate limits per client via trust proxy`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add a `TRUST_PROXY` setting to `server/src/index.ts`

Immediately after `const app = express();` (currently line 126), add a parser
and the `app.set` call. Insert it **before** the rate limiters so the setting is
active by the time they are constructed.

Target shape:

```ts
const app = express();

// ── Reverse proxy trust ───────────────────────────────────────────────────────
// Kuber's bundled deployment puts the API behind one Nginx hop
// (docker-compose.prod.yml → nginx/prod.conf), which sets X-Forwarded-For.
// Express must be told how many proxy hops to trust so that req.ip — and
// therefore express-rate-limit's bucket key — resolves to the real client
// rather than the proxy's container IP.
//
// This is deliberately a HOP COUNT, never `true`: with `true`, Express takes
// the left-most X-Forwarded-For entry, which any client can forge, turning
// rate limiting into a bypass. A hop count reads the Nth entry from the right,
// which a client cannot forge.
//
// TRUST_PROXY=0 disables it (use when the API is exposed directly).
function trustProxyHops(): number {
  const raw = process.env.TRUST_PROXY;
  if (raw === undefined || raw === '') return 1;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 1;
}

const trustProxy = trustProxyHops();
app.set('trust proxy', trustProxy);
logger.info({ trustProxy }, 'reverse proxy hops trusted');
```

Notes for the executor:

- `logger` is already imported in this file — confirm with
  `grep -n "^import.*logger" server/src/index.ts`. If it is not imported, omit
  the `logger.info` line rather than adding a new import.
- Default is `1`, matching the bundled Nginx stack, which is the documented
  deployment in `README.md` and `docs/SELF_HOSTING.md`.
- An invalid or negative value falls back to `1` rather than throwing, matching
  the lenient style of `positiveIntEnv`.

**Verify**: `npm exec --workspace=server -- tsc --noEmit` → exit 0, no errors.

**Verify**: `grep -n "trust proxy" server/src/index.ts` → returns exactly one
match, on the `app.set('trust proxy', trustProxy);` line.

### Step 2: Write a regression test proving per-client bucketing

Create `server/tests/middleware/trustProxy.test.ts`.

The test must not import `server/src/index.ts` (that starts a listening server
and connects to the database). Instead, build a minimal Express app that
reproduces the exact configuration and assert on `req.ip` resolution. This is
the behaviour that was broken, and it is what the fix restores.

Target shape:

```ts
import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';

function buildApp(hops: number) {
  const app = express();
  app.set('trust proxy', hops);
  app.get('/echo-ip', (req, res) => res.json({ ip: req.ip }));
  return app;
}

describe('trust proxy configuration', () => {
  it('resolves req.ip to the real client when one proxy hop is trusted', async () => {
    const res = await request(buildApp(1))
      .get('/echo-ip')
      .set('X-Forwarded-For', '203.0.113.7');

    expect(res.body.ip).toBe('203.0.113.7');
  });

  it('gives different clients different ips so rate-limit buckets differ', async () => {
    const app = buildApp(1);

    const a = await request(app).get('/echo-ip').set('X-Forwarded-For', '203.0.113.7');
    const b = await request(app).get('/echo-ip').set('X-Forwarded-For', '203.0.113.9');

    expect(a.body.ip).not.toBe(b.body.ip);
  });

  it('ignores forged left-most entries beyond the trusted hop count', async () => {
    // A client forging an extra hop must not be able to control the resolved ip.
    const res = await request(buildApp(1))
      .get('/echo-ip')
      .set('X-Forwarded-For', '1.2.3.4, 203.0.113.7');

    expect(res.body.ip).toBe('203.0.113.7');
    expect(res.body.ip).not.toBe('1.2.3.4');
  });

  it('does not trust forwarded headers when hops is 0', async () => {
    const res = await request(buildApp(0))
      .get('/echo-ip')
      .set('X-Forwarded-For', '203.0.113.7');

    expect(res.body.ip).not.toBe('203.0.113.7');
  });
});
```

If `server/tests/middleware/` does not exist, create the directory.

**Verify**: `npm run test --workspace=server -- tests/middleware/trustProxy.test.ts`
→ 4 tests pass, 0 fail.

**Verify (proves the test is meaningful)**: temporarily change `buildApp(1)` to
`buildApp(0)` in the first test only, re-run, and confirm that test **fails**.
Then change it back and confirm it passes again. Do not commit the temporary
change.

### Step 3: Document `TRUST_PROXY` in `.env.example`

Add an entry near the other rate-limit variables (find them with
`grep -n "RATE_LIMIT" .env.example`). Match the surrounding comment style
exactly — read the neighbouring entries before writing.

Target content:

```bash
# Number of reverse-proxy hops in front of the API. Determines which
# X-Forwarded-For entry is treated as the real client IP, which is what
# rate limiting buckets on.
#   1 = the bundled Nginx stack (default, correct for `make prod-up`)
#   0 = API exposed directly with no reverse proxy
# Set this to the actual number of proxies you run. Too high a value lets
# clients forge their IP and bypass rate limits.
TRUST_PROXY=1
```

**Verify**: `grep -n "TRUST_PROXY" .env.example` → returns the new entry.

### Step 4: Document `TRUST_PROXY` in `docs/03-reference.md`

Find the environment-variable table with
`grep -n "AUTH_RATE_LIMIT_MAX" docs/03-reference.md` and add a row for
`TRUST_PROXY` in the same table, matching the existing column layout exactly
(read two neighbouring rows first — do not guess the column count).

Row content: variable `TRUST_PROXY`, default `1`, description
"Reverse-proxy hops to trust when resolving the client IP for rate limiting.
`0` disables. Must match your actual proxy count."

**Verify**: `grep -n "TRUST_PROXY" docs/03-reference.md` → returns the new row.

### Step 5: Full verification

**Verify**: `npm run test --workspace=server` → all tests pass (647 baseline
plus the 4 new ones = 651+), 0 failing.

**Verify**: `npm run build --workspace=server` → exit 0.

**Verify**: `npm run lint --workspace=server` → exit 0 (pre-existing warnings
are fine; there must be no new **errors**).

## Test plan

- **New file**: `server/tests/middleware/trustProxy.test.ts`, four cases:
  1. Happy path — one trusted hop resolves `req.ip` to the forwarded client.
  2. The regression this plan fixes — two different clients produce two
     different `req.ip` values, so their rate-limit buckets are distinct.
  3. Spoofing edge case — a forged extra left-most `X-Forwarded-For` entry does
     not control the resolved IP.
  4. Opt-out edge case — `hops = 0` ignores forwarded headers entirely.
- **Structural pattern**: model the file layout, imports, and `describe`/`it`
  style on `server/tests/routes/accounts.test.ts`.
- Verification: `npm run test --workspace=server` → all pass, including the 4
  new tests.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm exec --workspace=server -- tsc --noEmit` exits 0
- [ ] `npm run test --workspace=server` exits 0 with 651 or more passing tests
- [ ] `npm run build --workspace=server` exits 0
- [ ] `npm run lint --workspace=server` exits 0 with no new errors
- [ ] `grep -c "trust proxy" server/src/index.ts` returns `1`
- [ ] `grep -q "app.set('trust proxy', true)" server/src/index.ts` returns
      non-zero (i.e. the unsafe `true` form is **absent**)
- [ ] `grep -q "TRUST_PROXY" .env.example` returns 0
- [ ] `grep -q "TRUST_PROXY" docs/03-reference.md` returns 0
- [ ] `git status --short` shows only the four in-scope files as modified/added
- [ ] `plans/README.md` status row for 018 updated

## STOP conditions

Stop and report back (do not improvise) if:

- `server/src/index.ts` already contains a `trust proxy` setting — the codebase
  has drifted and this plan's premise is void.
- The excerpt at `server/src/index.ts:126-129` does not match what you find.
- `nginx/prod.conf` no longer sets `X-Forwarded-For` — the hop-count default of
  `1` would then be wrong, and the correct value needs a human decision.
- Any test outside `tests/middleware/trustProxy.test.ts` starts failing after
  Step 1. That would mean something else depends on the broken `req.ip`
  behaviour, which needs investigation rather than a workaround.
- A verification fails twice after a reasonable fix attempt.

## Maintenance notes

- **For the reviewer**: confirm the setting is a *number*, not `true`. Passing
  `true` reintroduces the vulnerability in a form that looks like a fix. This
  is the single most important line to scrutinise in the diff.
- Anyone deploying Kuber behind an *additional* proxy (Cloudflare, a corporate
  load balancer, Traefik in front of the bundled Nginx) must raise
  `TRUST_PROXY` to match their real hop count. Too low and rate limiting keys
  on the wrong proxy; too high and clients can forge their IP. This is now
  documented in `.env.example` and `docs/03-reference.md`.
- **Deferred out of this plan**: the audit log (`AuditLog` model in
  `server/prisma/schema.prisma`) records no IP address or user agent. Once this
  plan lands, `req.ip` is finally trustworthy, so capturing it in the audit log
  becomes worthwhile — but it is a schema change and belongs in its own plan.
- If rate limiting later moves to a shared store (Redis) for multi-instance
  deployments, the bucket key still derives from `req.ip`, so this setting
  remains load-bearing.
