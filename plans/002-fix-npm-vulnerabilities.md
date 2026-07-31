# Plan 002: Fix npm audit vulnerabilities

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 28cf4a0..HEAD -- package.json client/package.json server/package.json package-lock.json` — if any in-scope file changed, compare excerpts before proceeding; on a mismatch, STOP.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `28cf4a0`, 2026-06-19

## Why this matters

`npm audit` reports 12 vulnerabilities (7 moderate, 5 high) across runtime dependencies. Key threats:
- **nodemailer** (high): CRLF injection, TLS certificate bypass in OAuth2, file-read SSRF via `raw` option, file-access bypass via `jsonTransport`. Nodemailer handles password resets and notifications.
- **multer** (high): DoS via nested field names, resource leak on aborted uploads. Multer handles receipt/CSV file uploads.
- **react-router** (high): open redirect via protocol-relative URL reinterpretation (`//` prefix). Affects all client users.
- **tmp** (high): path traversal via unsanitized prefix/postfix.
- **axios** (moderate): prototype pollution in proxy merge, header injection, various DoS vectors.

The root `package.json` already has 10 dependency overrides showing awareness but incomplete coverage.

## Current state

- Root `package.json:39-49` — has `overrides` for `path-to-regexp`, `semver`, `serialize-javascript`, `follow-redirects`, `postcss`, `esbuild`, `uuid`, `workbox-build`, `@babel/core`, `@rollup/plugin-terser` — these patch transitive vulns.
- Still unfixed: `nodemailer`, `multer`, `react-router`, `tmp`, `axios` (some).
- `npm audit fix --production` applied but cannot fix vulns requiring semver-major bumps.

## Scope

**In scope**:
- `server/package.json` — update `nodemailer`, `multer` versions
- `client/package.json` — update `react-router-dom`, `tmp` (via `uuid`/`exceljs` — caution)
- `package.json` (root) — update `overrides` if needed

**Out of scope**:
- Any source code changes
- Dependency functionality tests beyond build + tests

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Check git status | `git status --short` | clean |
| Check current vulns | `cd server && npm audit --omit=dev 2>&1 \| grep -E "^(#|✚|Severity|fix)"` | baseline |
| Install | `npm install` | exit 0 |
| Build server | `npm run build --workspace=server` | exit 0 |
| Build client | `npm run build --workspace=@kuber/client` | exit 0 |
| Test server | `npm run test --workspace=server` | all pass |
| Test client | `npm run test --workspace=@kuber/client` | all pass |

## Steps

### Step 1: Baseline current state

```bash
npm audit --omit=dev 2>&1 | grep -E "^(#|✚|Severity|fix|vulnerabilit)"
```

Save the count for comparison later.

### Step 2: Update nodemailer (4 high vulns)

Edit `server/package.json`:
- Change `"nodemailer": "^8.0.5"` to `"nodemailer": "^9.0.0"` (latest 9.x series which fixes CRLF injection and TLS bypass).

Run: `npm install` → verify the new version is resolved.

### Step 3: Update multer (2 high vulns)

Edit `server/package.json`:
- Change `"multer": "^2.1.1"` to `"multer": "^2.1.7"` (or latest 2.x patch with DoS fixes).

Run: `npm install` → verify.

### Step 4: Update react-router-dom (open redirect)

Edit `client/package.json`:
- Change `"react-router-dom": "^6.23.0"` to `"react-router-dom": "^6.30.4"` (latest 6.x patch that fixes the `//` open redirect; audit shows fixed in 6.30.4+).

Note: Do NOT bump to v7 — that's a semver-major with breaking changes. Stay on v6.

Run: `npm install` → verify.

### Step 5: Fix tmp path traversal via override

`tmp` is a transitive dependency (used by exceljs or similar). Add it to the root `package.json` overrides:

```json
"overrides": {
  ...
  "tmp": "^0.2.7"
}
```

Run: `npm install` → verify.

### Step 6: Build and test

```bash
npm run build --workspace=server && npm run build --workspace=@kuber/client && npm run test --workspace=server
```

All pass.

### Step 7: Verify improvement

```bash
npm audit --omit=dev 2>&1 | grep -E "vulnerabilit"
```

Count should be lower. Remaining (if any) should be moderate-only with no reasonable fix path.

## Test plan

- No new tests needed. Existing test suite covers nodemailer (email sending), multer (file upload), and react-router (navigation).
- Watch for subtle behavioral changes if API surface changed (unlikely for patch bumps).

## Done criteria

- [ ] `npm install` exits 0 with no peer dep errors
- [ ] `npm run build --workspace=server` exits 0
- [ ] `npm run build --workspace=@kuber/client` exits 0
- [ ] `npm run test --workspace=server` exits 0, all existing tests pass
- [ ] `npm run test --workspace=@kuber/client` exits 0, all existing tests pass
- [ ] `npm audit --omit=dev` shows fewer high-severity findings (target: 0 high, or at most 1-2 moderate that have no fix)
- [ ] `plans/README.md` status updated

## STOP conditions

- A build breaks after updating a dependency. Report the specific error — some deps require API changes.
- Tests fail after updating a dependency. Investigate whether the test was relying on behavior that changed.

## Maintenance notes

- Run `npm audit --omit=dev` before each release. The `overrides` block in root `package.json` is the place to patch transitive vulns that upstream packages haven't fixed.
- Pin major versions explicitly for security-sensitive deps (nodemailer, multer, axios) and update deliberately — don't blind `npm audit fix`.
