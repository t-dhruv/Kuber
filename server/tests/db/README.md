# Database-backed tests (Seam B)

These tests boot the **real application** against a **real, migrated Postgres**.
They are the highest seam available below a browser.

Everywhere else in this suite, `src/test-setup.ts` mocks `@prisma/client`
globally and route tests mount a single router on a bare Express app with a
faked auth middleware. That seam cannot see a database constraint, cannot see
anything configured in the entry point, and — three times in this repository's
history — has asserted the buggy behaviour rather than catching it. When a claim
is about real database state or real middleware, prove it here.

## Running

```bash
npm run test:db --workspace=@kuber/server   # or: make test-db
```

You need a Postgres reachable at `DATABASE_URL`. The local Compose stack
(`make up`) is enough.

The suite **never uses your development database**. It resolves its own:

- `TEST_DATABASE_URL` if set (CI sets this), otherwise
- `DATABASE_URL` with `_test` appended to the database name.

The database name must end in `_test` or the run aborts — the suite truncates
every table it finds. Resolution is idempotent, so a `DATABASE_URL` that already
ends in `_test` is used as-is.

Before any test file runs, `globalSetup.ts` creates that database if needed,
drops the `public` schema, and runs `prisma migrate deploy`. Every run is
therefore a genuine first boot.

## Writing a test

```ts
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import { createHousehold, createTestApp, prisma, resetDatabase } from './harness';

beforeEach(async () => {
  await resetDatabase();
});

it('does not leak one Household into another', async () => {
  const app = createTestApp();
  const alice = await createHousehold();
  const bob = await createHousehold();
  // ...
});
```

### What the harness gives you

| Export             | What it does                                                                             |
| ------------------ | ---------------------------------------------------------------------------------------- |
| `createTestApp()`  | Boots the real app via `createApp()` — full middleware stack, security controls, every router. No listener, no cron jobs. A fresh app per call, so no per-app middleware state leaks between tests. |
| `prisma`           | A real client pointed at the test database. The app under test reads the same rows.       |
| `resetDatabase()`  | Truncates every application table, keeping the migration history. Call it in `beforeEach`. |
| `createHousehold()`| A Household with one User who belongs to it. Returns the plaintext `password` so the User can log in. Call it twice for an isolation test. |
| `accessTokenFor()`  | Logs a fixture in through the real login endpoint and returns its access token, for calling authenticated routes. A real login rather than a hand-signed JWT, so the token carries the claims the app actually issues. |
| `testDatabaseUrl`  | The resolved URL, for tests that shell out to the Prisma CLI.                              |

`createHousehold()` marks the User's email verified by default, because login
refuses unverified Users and most tests are not about verification. Pass
`{ emailVerified: false }` when that is the thing under test.

## Why a separate Vitest config

`vitest.db.config.ts` exists so this suite does **not** load
`src/test-setup.ts`. If these tests shared the default config, the global Prisma
mock would apply and "this test talked to a real database" would be a matter of
convention rather than construction.

That config also supplies the environment the app needs (`JWT_SECRET`,
`AI_ENCRYPTION_KEY`, `CLIENT_URL`, and `DATABASE_URL` pointed at the test
database), and disables file parallelism — one database is shared across files,
so a `resetDatabase()` in one must not empty a table another is reading.

## Extending it

Add a `*.test.ts` file in this directory; it is picked up automatically. Keep
assertions on externally observable behaviour — status codes, response bodies,
headers, `Set-Cookie` attributes, and database state after a request — not on
which function was called with which argument.

If a slice needs a richer fixture (an Account, a Transaction), add it to
`harness.ts` next to `createHousehold()` rather than building it inline, so the
next slice inherits it.

If a migration ever seeds reference data into a new table, add that table to
`MIGRATION_SEEDED_TABLES` in `harness.ts`. `resetDatabase()` would otherwise
empty it on the first `beforeEach` with nothing to put the rows back.

### Known gap: rate limiting

All three rate limiters in `src/app.ts` carry
`skip: () => process.env.NODE_ENV === 'test'`, and this suite runs with
`NODE_ENV=test`, so they do nothing here. A test asserting that the auth limiter
buckets per client address has to change that skip condition first — it is not
something the harness can paper over.

