# Plan 011: Clean up shared/ workspace

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 28cf4a0..HEAD -- shared/ package.json turbo.json` — if any in-scope file changed, compare against live code before proceeding; on a mismatch, STOP.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `28cf4a0`, 2026-06-19

## Why this matters

The `shared/` npm workspace contains 4 files (66 lines `validators.ts` with zero callers, type definitions used in only 6 `import type` sites). It adds workspace overhead (install, resolution, turbo pipeline) for negligible value. The runtime validators at `shared/src/validators.ts` are exported but never used anywhere in the codebase — a misleading API surface.

## Current state

- `shared/package.json` — declares `@kuber/shared` workspace
- `shared/src/dtos.ts` — DTO type definitions (`UserDto`, `AccountDto`, etc.)
- `shared/src/types.ts` — type definitions
- `shared/src/validators.ts` — 66 lines, runtime type guards (`isUserDto`, `isAccountDto`, etc.) with zero callers
- `shared/src/index.ts` — re-exports

Import sites (6 total, all `import type`):
- `server/src/routeModules/auth.ts:15` — `import type { UserDto } from '@kuber/shared'`
- `server/src/routes/users.ts:4` — `import type { UserDto } from '@kuber/shared'`
- `client/src/lib/api.ts:3` — `import type { UserDto } from '@kuber/shared'`
- `client/src/hooks/useAuth.ts:5` — `import type { UserDto } from '@kuber/shared'`
- `client/src/stores/authStore.ts:3` — `import type { UserDto } from '@kuber/shared'`
- `client/src/pages/reports/components/OverviewSummary.tsx:4` — `import type { ReportOverviewDto } from "@kuber/shared"`

## Scope

**In scope**:
- `shared/src/validators.ts` — delete (zero callers)
- `shared/src/dtos.ts` or `shared/src/types.ts` — keep the `UserDto` and `ReportOverviewDto` type definitions (they are used)
- All 6 import sites — update to import from local paths instead
- Root `package.json` — remove `shared` from workspaces
- `turbo.json` — remove `shared` pipeline entry

**Out of scope**:
- Creating a new shared types package (the types are simple enough to duplicate or co-locate)
- Refactoring the types themselves (just moving them)

## Steps

### Step 1: Read shared/src/ to understand current exports

Identify exactly what `index.ts` re-exports to know what's publicly accessible.

### Step 2: Inline the needed types

For the 6 import sites, replace `import type { UserDto } from '@kuber/shared'` with a local type definition.

Create `server/src/types/userDto.ts`:
```ts
// UserDto type — migrated from shared package
export interface UserDto {
  id: string;
  email: string;
  // ... other fields from shared/src/dtos.ts UserDto
}
```

Or, even simpler: inline the type directly in the importing file, or import from the Prisma-generated types that already exist.

Actually, check if Prisma already generates a `User` type that can be used instead of `UserDto`. If so, the simplest fix is:
1. Delete `shared/`
2. In each importing file, define the type locally or use Prisma's generated type

For `ReportOverviewDto` — it's only used in one client file. Define it locally there.

### Step 3: Update all 6 import sites

For each of the 6 files, replace the `@kuber/shared` import with a local type import or definition.

### Step 4: Remove the shared workspace

Edit `shared/package.json` — keep the file but remove the workspace entry from root `package.json`:

In root `package.json`, change the workspaces list:
```json
"workspaces": ["client", "server"]
```

Remove `shared` from the list.

Also remove any `shared` pipeline entry in `turbo.json` if present.

### Step 5: Delete unused shared files

Delete `shared/src/validators.ts` and `shared/src/dtos.ts` (if types were inlined).

If the entire `shared/` directory becomes empty after removing these, delete `shared/` entirely. Otherwise leave `shared/` as a minimal package with just the re-exported types still in use.

### Step 6: Install, build, test

```bash
npm install
npm run build --workspace=server
npm run build --workspace=@kuber/client
npm run test --workspace=server
npm run test --workspace=@kuber/client
```

## Test plan

- All 648+ server tests and 59+ client tests must pass.
- No new tests needed — this is a pure refactoring.

## Done criteria

- [ ] `npm install` exits 0 with no workspace resolution errors
- [ ] `npm run build --workspace=server` exits 0
- [ ] `npm run build --workspace=@kuber/client` exits 0
- [ ] `npm run test --workspace=server` exits 0
- [ ] `npm run test --workspace=@kuber/client` exits 0
- [ ] No `import ... from '@kuber/shared'` remains in server or client source
- [ ] `validators.ts` deleted
- [ ] `shared/` workspace removed from root `package.json` workspaces list
- [ ] `plans/README.md` status updated

## STOP conditions

- If removing `shared` from monorepo workspaces breaks turbo or npm, keep the workspace but strip its content.
- If Prisma-generated types don't exactly match the DTO shapes used by the client, keep the local type definitions as-is (just move them).
