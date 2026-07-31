# Plan 007: Add granular rate limiting for file upload routes

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 28cf4a0..HEAD -- server/src/index.ts server/src/routes/ server/src/routeModules/import.ts` — if any in-scope file changed, compare against live code before proceeding; on a mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `28cf4a0`, 2026-06-19

## Why this matters

The general API rate limiter allows 2000 requests per 60 seconds across all routes. Upload routes accept up to 20MB per file. An authenticated user could upload ~40GB/hour before hitting the general rate limit, potentially exhausting server disk space and causing denial of service.

## Current state

`server/src/index.ts:156-163`:
```ts
const apiLimiter = rateLimit({
  windowMs: positiveIntEnv('API_RATE_LIMIT_WINDOW_MS', 60 * 1000),
  max: positiveIntEnv('API_RATE_LIMIT_MAX', 2000),
  ...
});
```

`server/src/routes/attachments.ts:18` — multer limit: 20MB
`server/src/routeModules/import.ts:32` — multer limit: 20MB

Both use the shared `apiLimiter`, no separate upload limiter.

## Scope

**In scope**:
- `server/src/index.ts` — define `uploadLimiter`, apply to upload routes

**Out of scope**:
- Multer file size limits (these are reasonable per-file)
- Separate limiters for other route categories

## Steps

### Step 1: Add upload rate limiter

In `server/src/index.ts`, after the `apiLimiter` definition (around line 163), add:

```ts
// Upload routes: stricter limit to prevent disk exhaustion
const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many upload requests, please try again later.' },
  skip: () => process.env.NODE_ENV === 'test',
});
```

### Step 2: Apply to upload routes

Find where routes are registered in `server/src/index.ts`. Look for lines like:
```ts
app.use('/api/v1/attachments', attachmentRoutes);
app.use('/api/v1/import', importRoutes);
```

Change them to apply the upload limiter:
```ts
app.use('/api/v1/attachments', uploadLimiter, attachmentRoutes);
app.use('/api/v1/import', uploadLimiter, importRoutes);
```

Note: the general `apiLimiter` still applies (through the `/api/` prefix) — upload routes get both.

### Step 3: Build and test

```bash
npm run build --workspace=server
npm run test --workspace=server
npm run lint --workspace=server
```

## Test plan

- Existing tests should pass because `NODE_ENV === 'test'` skips rate limiting.
- No new tests needed — rate limit behavior is tested by the existing rate limiter pattern.

## Done criteria

- [ ] `npm run build --workspace=server` exits 0
- [ ] `npm run test --workspace=server` exits 0
- [ ] `npm run lint --workspace=server` exits 0
- [ ] `uploadLimiter` defined with max 10 per 60 seconds
- [ ] Upload routes use `uploadLimiter`
- [ ] `plans/README.md` status updated

## STOP conditions

- If route registration pattern differs from expected, follow the actual pattern in `index.ts`.
- If a rate limiter test fails, check that `skip: test` is working.

## Maintenance notes

- The 10/60s limit is generous for typical users (CSV uploads are occasional, not bursty).
- If file attachments become a core workflow, the limit can be adjusted via env vars or per-endpoint tuning.
