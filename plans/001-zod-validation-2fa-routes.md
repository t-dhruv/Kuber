# Plan 001: Add Zod validation and requireAuth to 2FA routes

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 28cf4a0..HEAD -- server/src/routeModules/auth.ts server/src/middleware/auth.ts server/tests/routes/auth2fa.test.ts` — if any in-scope file changed, compare "Current state" excerpts against live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: MED
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `28cf4a0`, 2026-06-19

## Why this matters

Five sensitive auth endpoints (`/2fa/setup`, `/2fa/enable`, `/2fa/disable`, `/2fa/validate`, `/2fa/use-backup`) bypass the standard `requireAuth` middleware and validate request bodies with `as` type casts instead of Zod schemas. This means:
1. A malformed request (array or object where string expected) can crash the handler or bypass checks.
2. Any auth hardening added to `requireAuth` (token revocation, audit logging) automatically misses these routes.
3. Input validation is inconsistent with the rest of the codebase.

Fixing this brings the 2FA routes inline with the rest of the API: Zod at the boundary, `requireAuth` for auth enforcement.

## Current state

- `server/src/routeModules/auth.ts` — contains all auth routes including 2FA handlers. Already imports `requireAuth` (line 12) and `z` (line 5) and uses them in other routes.
- Five 2FA routes duplicate JWT verification and use `as` casts for body validation:

```ts
// Line 433 — /2fa/setup: manual JWT verify, no body validation needed (just auth)
router.post('/2fa/setup', async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  const payload = jwt.verify(authHeader.slice(7), process.env.JWT_SECRET!) as { userId: string };

// Line 462 — /2fa/enable: manual JWT verify + `as` cast
router.post('/2fa/enable', async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  ...
  const { code } = req.body as { code: string };
  if (!code) return res.status(400).json({ error: 'TOTP code is required' });

// Line 502 — /2fa/disable: manual JWT verify + `as` cast
router.post('/2fa/disable', async (req: Request, res: Response) => {
  ...
  const { password } = req.body as { password: string };
  if (!password) return res.status(400).json({ error: 'Password is required to disable 2FA' });

// Line 631 — /2fa/validate: no auth at all (public, uses tempToken)
router.post('/2fa/validate', async (req: Request, res: Response) => {
  const { tempToken, code } = req.body as { tempToken: string; code: string };
  if (!tempToken || !code) ...

// Line 667 — /2fa/use-backup: no auth (public, uses tempToken)
router.post('/2fa/use-backup', async (req: Request, res: Response) => {
  const { tempToken, backupCode } = req.body as { tempToken: string; backupCode: string };
  if (!tempToken || !backupCode) ...
```

- `server/src/middleware/auth.ts` — `requireAuth` middleware already handles JWT verify + API token fallback, sets `req.userId` and `req.householdId`.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Build server | `npm run build --workspace=server` | exit 0 |
| Test server | `npm run test --workspace=server -- tests/routes/auth2fa.test.ts` | all pass |
| Lint server | `npm run lint --workspace=server` | exit 0, no new warnings |

## Scope

**In scope** (the only files you should modify):
- `server/src/routeModules/auth.ts` — 5 route handlers
- `server/tests/routes/auth2fa.test.ts` — update tests if needed

**Out of scope** (do NOT touch):
- Any other route or middleware file
- The `requireAuth` middleware itself
- Login, refresh, logout, or MFA email routes

## Git workflow

- Branch: `advisor/001-zod-2fa-routes`
- Commit message style: `fix: add Zod validation and requireAuth to 2FA routes`

## Steps

### Step 1: Update `/2fa/setup` to use requireAuth

Replace the manual JWT verify block with `requireAuth` middleware. Change the handler signature from `req: Request` to `req: AuthRequest`.

The route currently at line 433:
```ts
router.post('/2fa/setup', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
    const payload = jwt.verify(authHeader.slice(7), process.env.JWT_SECRET!) as { userId: string };
    // ... rest uses payload.userId
```

Change to:
```ts
router.post('/2fa/setup', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    if (!user) return res.status(404).json({ error: 'User not found' });
    // ... rest is the same, just use userId instead of payload.userId
```

**Verify**: `npm run build --workspace=server` → exit 0

### Step 2: Update `/2fa/enable` to use requireAuth + Zod

Replace both the JWT verify and the `as` cast:

```ts
const enableSchema = z.object({ code: z.string().min(1) });

router.post('/2fa/enable', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const parsed = enableSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Valid TOTP code is required' });
    const { code } = parsed.data;
    const userId = req.userId!;
    // ... rest replaces payload.userId with userId
```

Remove the old manual JWT verify lines (lines 464-466).

**Verify**: `npm run build --workspace=server` → exit 0

### Step 3: Update `/2fa/disable` to use requireAuth + Zod

Same pattern:

```ts
const disableSchema = z.object({ password: z.string().min(1) });

router.post('/2fa/disable', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const parsed = disableSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Password is required to disable 2FA' });
    const { password } = parsed.data;
    const userId = req.userId!;
    // ... rest replaces payload.userId with userId
```

Remove lines 504-506.

### Step 4: Update `/2fa/validate` to use Zod (no auth change — this is public)

This route uses `tempToken` (not a Bearer token), so no `requireAuth` change. Just add Zod validation:

```ts
const validateSchema = z.object({
  tempToken: z.string().min(1),
  code: z.string().min(1),
});

router.post('/2fa/validate', async (req: Request, res: Response) => {
  try {
    const parsed = validateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'tempToken and code are required' });
    const { tempToken, code } = parsed.data;
    // ... rest unchanged
```

Remove lines 633-634.

### Step 5: Update `/2fa/use-backup` to use Zod (no auth change)

Same pattern:

```ts
const backupSchema = z.object({
  tempToken: z.string().min(1),
  backupCode: z.string().min(1),
});

router.post('/2fa/use-backup', async (req: Request, res: Response) => {
  try {
    const parsed = backupSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'tempToken and backupCode are required' });
    const { tempToken, backupCode } = parsed.data;
    // ... rest unchanged
```

Remove lines 669-670.

**Final verify**: `npm run build --workspace=server` → exit 0

### Step 6: Run tests

```bash
npm run test --workspace=server -- tests/routes/auth2fa.test.ts
```

All existing tests must pass. If any fail, read the test to understand what request shape it sends and ensure your schema allows it.

**Verify**: all tests pass

### Step 7: Lint check

```bash
npm run lint --workspace=server
```

Exit 0, no new warnings.

## Test plan

- No new tests needed — existing `auth2fa.test.ts` tests cover these routes. The change is internal (same behavior, validated differently).
- If a test fails in step 6, update the test to expect the same error messages. The existing messages should match (the Zod schema returns 400 with `{ error: "..." }` — same shape as before).

## Done criteria

- [ ] `npm run build --workspace=server` exits 0
- [ ] `npm run test --workspace=server -- tests/routes/auth2fa.test.ts` exits 0
- [ ] `npm run lint --workspace=server` exits 0 with no new warnings
- [ ] No `jwt.verify(authHeader.slice(7), ...)` calls remain in 2fa/setup, enable, disable handlers
- [ ] All five routes use `safeParse` with a Zod schema for body validation
- [ ] `plans/README.md` status updated

## STOP conditions

Stop and report back if:
- The live code at `server/src/routeModules/auth.ts` doesn't match the line numbers and excerpts above (the file may have changed since this plan was written).
- Any test fails in a way that can't be fixed by aligning the error message format.
- The fix requires touching a file outside the in-scope list.

## Maintenance notes

- If new 2FA or MFA routes are added, they should follow the same pattern: `requireAuth` + Zod body validation.
- The `jwt.verify` calls removed here only existed for 2FA — the rest of the auth module uses `requireAuth` or temp tokens correctly.
