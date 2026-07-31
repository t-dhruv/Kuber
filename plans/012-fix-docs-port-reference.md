# Plan 012: Fix reference docs PORT default to match code

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 28cf4a0..HEAD -- docs/03-reference.md` — if in-scope file changed, compare excerpts against live code before proceeding; on a mismatch, STOP.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: docs
- **Planned at**: commit `28cf4a0`, 2026-06-19

## Why this matters

The reference documentation at `docs/03-reference.md` states the server PORT environment variable defaults to `4000` and the server runs on internal port `4000`. The actual code defaults to `9002` (confirmed in `server/src/index.ts:133` and `client/vite.config.ts:66-69`). Self-hosters reading the docs will see incorrect configuration information at the first reference.

## Current state

- `docs/03-reference.md:17` — `| PORT | No | 4000 |` (env var reference table — says default is 4000)
- `docs/03-reference.md:42` — server listed on internal port 4000
- `server/src/index.ts:133` — `const PORT = process.env.PORT ?? 9002;`
- `.env.example:28` — `PORT=9002`
- `client/vite.config.ts:66-69` — proxy targets `localhost:9002`

## Scope

**In scope**:
- `docs/03-reference.md` — fix PORT default and internal port references

**Out of scope**:
- Any code changes
- Other doc inaccuracies (only PORT)

## Steps

### Step 1: Fix the env var reference table

In `docs/03-reference.md`, find the PORT row (around line 17). Change the default from `4000` to `9002`.

Before:
```
| PORT | No | 4000 |
```

After:
```
| PORT | No | 9002 |
```

### Step 2: Fix the internal port reference

In `docs/03-reference.md`, find the server internal port reference (around line 42). Change `4000` to `9002`.

**Verify**: Read the file to confirm both references are corrected.

## Test plan

- No tests — this is a documentation change only.

## Done criteria

- [ ] `grep "4000" docs/03-reference.md` returns no matches related to PORT or server port (there may be other port references that are correct — only verify PORT references)
- [ ] `plans/README.md` status updated

## STOP conditions

- If grep finds other `4000` references in the file, verify each one — some may be correct (e.g., example configs for other services). Only change the PORT default and server internal port.
