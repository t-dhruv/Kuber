# Plan 022: Soft-delete manual assets and liabilities

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 66c013c..HEAD -- server/prisma/schema.prisma server/src/routes/assets.ts server/src/routes/liabilities.ts server/src/services/settingsService.ts server/src/routeModules/wealth.ts server/src/lib/reporting/standard.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: `plans/021-fix-stale-decimal-shadow-column-reads.md` (both
  plans edit `server/src/lib/reporting/standard.ts:1089-1090`; run 021 first to
  avoid a conflict)
- **Category**: bug
- **Planned at**: commit `66c013c`, 2026-07-27

## Why this matters

`CLAUDE.md` states the rule plainly:

> Financial records must use soft delete (`isDeleted` boolean) — never
> hard-delete them.

`ManualAsset` and `ManualLiability` violate it. Both models lack an
`isDeleted` column entirely, and both delete endpoints call
`prisma.<model>.delete()`, permanently destroying the row.

These are not incidental records. A manual asset is a user's house, car, or
collectible; a manual liability is their mortgage, car loan, or student debt —
records a self-hosting user typed in by hand and cannot recover from a bank
feed. One misclick permanently destroys the entry, its purchase history, and
its contribution to every historical net-worth figure. There is no undo, no
audit trail of what was removed, and no way to answer "why did my net worth
drop last March".

Deleting a `ManualAsset` also cascades to its `ManualAssetSnapshot` rows,
destroying the asset's entire valuation history at the same time.

This plan brings both models in line with the pattern `Account`,
`TransactionJournal`, `Category`, and `RecurringItem` already follow.

**Note on plan 004**: `plans/004-investment-soft-delete.md` is recorded as DONE
but was never implemented — `InvestmentHolding` and `HoldingLot` still have no
`isDeleted` column and still hard-delete. That work is **not** part of this
plan; it touches 59 query sites and needs re-planning at its real size. This
plan covers only manual assets and liabilities, which is 23 query sites and
completable in one pass.

## Current state

Files involved:

- `server/prisma/schema.prisma` — the two models, neither with `isDeleted`.
- `server/src/routes/assets.ts` — manual asset CRUD (8 query sites).
- `server/src/routes/liabilities.ts` — manual liability CRUD (9 query sites).
- `server/src/services/settingsService.ts` — data export (2 query sites).
- `server/src/routeModules/wealth.ts` — wealth analysis (2 query sites).
- `server/src/lib/reporting/standard.ts` — net-worth report (2 query sites).
- `server/src/lib/softDeleteWhere.ts` — the existing helper. **Use it.**

`server/src/lib/softDeleteWhere.ts` — the convention to follow, in full:

```ts
/**
 * Helper to add isDeleted = false filter to where clauses
 * Financial records must not be hard-deleted, only soft-deleted
 */

export const NOT_DELETED = { isDeleted: false };
```

`server/src/routes/assets.ts:155-169` — the hard delete:

```ts
// DELETE /api/v1/assets/:id
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const existing = await prisma.manualAsset.findFirst({
      where: { id: req.params.id, householdId: req.householdId! },
    });
    if (!existing) return res.status(404).json({ error: 'Asset not found' });

    await prisma.manualAsset.delete({ where: { id: req.params.id } });
    res.json({ message: 'Deleted' });
  } catch (err) {
    req.log.error({ err }, 'error');
    res.status(500).json({ error: 'Failed to delete asset' });
  }
});
```

`server/src/routes/liabilities.ts:260-274` — the same pattern:

```ts
// DELETE /api/v1/liabilities/:id
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const existing = await prisma.manualLiability.findFirst({
      where: { id: req.params.id, householdId: req.householdId! },
    });
    if (!existing) return res.status(404).json({ error: 'Liability not found' });

    await prisma.manualLiability.delete({ where: { id: req.params.id } });
    return res.json({ message: 'Deleted' });
  } catch (err) {
    req.log.error({ err }, 'liabilities/DELETE /:id');
    return res.status(500).json({ error: 'Failed to delete liability' });
  }
});
```

### The complete list of query sites you must update

This is exhaustive — it was produced by
`grep -rn "manualAsset\.\|manualLiability\." server/src --include=*.ts | grep -v scripts/`.
Re-run that grep yourself in Step 1 and confirm you get the same 23 lines.

**`server/src/routes/assets.ts`**
| Line | Call | Action |
|---|---|---|
| 24  | `manualAsset.findMany`  | add `NOT_DELETED` |
| 67  | `manualAsset.aggregate` | add `NOT_DELETED` |
| 73  | `manualLiability.aggregate` | add `NOT_DELETED` |
| 103 | `manualAsset.create`    | no change |
| 128 | `manualAsset.findFirst` | add `NOT_DELETED` |
| 137 | `manualAsset.update`    | no change (guarded by 128) |
| 158 | `manualAsset.findFirst` | add `NOT_DELETED` |
| 163 | `manualAsset.delete`    | **convert to soft delete** |

**`server/src/routes/liabilities.ts`**
| Line | Call | Action |
|---|---|---|
| 65  | `manualLiability.findMany`  | add `NOT_DELETED` |
| 84  | `manualLiability.create`    | no change |
| 108 | `manualLiability.findMany`  | add `NOT_DELETED` |
| 238 | `manualLiability.findFirst` | add `NOT_DELETED` |
| 244 | `manualLiability.update`    | no change (guarded by 238) |
| 263 | `manualLiability.findFirst` | add `NOT_DELETED` |
| 268 | `manualLiability.delete`    | **convert to soft delete** |
| 281 | `manualLiability.findFirst` | add `NOT_DELETED` |
| 350 | `manualLiability.findFirst` | add `NOT_DELETED` |

**`server/src/services/settingsService.ts`**
| Line | Call | Action |
|---|---|---|
| 1057 | `manualAsset.findMany`     | add `NOT_DELETED` |
| 1077 | `manualLiability.findMany` | add `NOT_DELETED` |

**`server/src/routeModules/wealth.ts`**
| Line | Call | Action |
|---|---|---|
| 542 | `manualAsset.findMany`     | add `NOT_DELETED` |
| 546 | `manualLiability.findMany` | add `NOT_DELETED` |

**`server/src/lib/reporting/standard.ts`**
| Line | Call | Action |
|---|---|---|
| 1089 | `manualAsset.findMany`     | add `NOT_DELETED` |
| 1090 | `manualLiability.findMany` | add `NOT_DELETED` |

### Repo conventions to follow

- Soft-delete filters use the shared `NOT_DELETED` constant spread into the
  `where` clause, e.g.
  `where: { householdId, ...NOT_DELETED }`. See
  `server/src/services/investmentService.ts:476-479` for an existing example.
  Do not write `isDeleted: false` inline.
- Migration naming: `YYYYMMDDHHMMSS_descriptive_name` (per `CLAUDE.md`).
- Every model has `id`, `createdAt`, `updatedAt` — both models already do.
- Household-scoped queries filter on `householdId` from the authenticated
  request context, never the request body. Preserve every existing
  `householdId` filter exactly as-is.
- API responses: `res.json(data)` on success, `res.status(n).json({ error })`
  on failure. Deletion currently returns `{ message: 'Deleted' }` — **keep that
  response shape unchanged** so the client needs no update.
- Run `npx prisma format` after schema changes.

## Commands you will need

| Purpose            | Command                                                                       | Expected on success |
|--------------------|-------------------------------------------------------------------------------|---------------------|
| Format schema      | `npm exec --workspace=server -- prisma format --schema server/prisma/schema.prisma` | exit 0        |
| Validate schema    | `npm exec --workspace=server -- prisma validate --schema server/prisma/schema.prisma` | schema is valid |
| Generate client    | `npm run db:generate --workspace=server`                                       | exit 0              |
| Create migration   | `npm run db:migrate --workspace=server`                                        | migration applied   |
| Typecheck          | `npm exec --workspace=server -- tsc --noEmit`                                  | exit 0              |
| Asset tests        | `npm run test --workspace=server -- tests/routes/assets.test.ts`               | all pass            |
| Server tests       | `npm run test --workspace=server`                                              | all pass            |
| Build              | `npm run build --workspace=server`                                             | exit 0              |
| Lint               | `npm run lint --workspace=server`                                              | exit 0 (warnings OK)|

`npm run db:migrate` requires a running Postgres. Start it with `make db-up`
if needed. If no database is available, **STOP** — this plan cannot be
completed without one.

## Scope

**In scope** (the only files you should modify):

- `server/prisma/schema.prisma`
- `server/prisma/migrations/<timestamp>_add_soft_delete_to_manual_assets_liabilities/migration.sql` (generated)
- `server/src/routes/assets.ts`
- `server/src/routes/liabilities.ts`
- `server/src/services/settingsService.ts`
- `server/src/routeModules/wealth.ts`
- `server/src/lib/reporting/standard.ts`
- `server/tests/routes/manualSoftDelete.test.ts` (create)

**Out of scope** (do NOT touch, even though they look related):

- `InvestmentHolding`, `HoldingLot`, `DividendRecord`, `RecurringInvestment` —
  these also hard-delete and it is tempting to fix them here. Do not. They have
  59 query sites across many files; bundling them makes this change
  unreviewable and is why the previous attempt (plan 004) was recorded as done
  without being done.
- `ManualAssetSnapshot` — it has no `householdId` and cascades from its parent
  asset. Once the parent is soft-deleted the snapshots are no longer reachable
  through any query in scope, so it needs no column of its own here.
- The client. No API contract changes: the delete endpoints keep returning
  `{ message: 'Deleted' }` and list endpoints keep returning the same shape.
- Adding a "restore" or "trash" endpoint. Soft delete is the storage change;
  exposing recovery in the UI is a product decision and a separate plan.
- Any change to `server/src/lib/softDeleteWhere.ts` — it is already correct.
- The `currentValue` / `currentValueDecimal` column choice at
  `standard.ts:1089-1090`. Plan 021 owns that line; here you only add the
  `NOT_DELETED` filter to its `where` clause.

## Git workflow

- Branch: `fix/soft-delete-manual-assets-liabilities`
- Commit style: Conventional Commits. Suggested message:
  `fix: soft-delete manual assets and liabilities instead of destroying rows`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Confirm the query-site inventory

Run:

```sh
grep -rn "manualAsset\.\|manualLiability\." server/src --include=*.ts | grep -v scripts/
```

**Expected**: 23 lines, matching the tables above. If the count or the line
numbers differ materially, the codebase has drifted — **STOP**.

Also confirm neither model has the column yet:

```sh
sed -n '/^model ManualAsset /,/^}/p;/^model ManualLiability /,/^}/p' server/prisma/schema.prisma | grep -c isDeleted
```

**Expected**: `0`.

### Step 2: Add the columns to the schema

In `server/prisma/schema.prisma`, add to **both** `ManualAsset` and
`ManualLiability`:

```prisma
  isDeleted   Boolean   @default(false)
  deletedAt   DateTime?
```

Place them immediately before the `createdAt` field in each model, matching how
`Account` orders its fields (check with
`sed -n '/^model Account /,/^}/p' server/prisma/schema.prisma`).

Add an index to each model so the filtered list queries stay fast — both models
already have `@@index([householdId])`; replace it with a composite index that
covers the new filter:

```prisma
  @@index([householdId, isDeleted])
```

**Verify**: `npm exec --workspace=server -- prisma format --schema server/prisma/schema.prisma` → exit 0.

**Verify**: `npm exec --workspace=server -- prisma validate --schema server/prisma/schema.prisma` → schema is valid.

### Step 3: Generate and apply the migration

```sh
npm run db:migrate --workspace=server
```

When prompted for a migration name, enter:
`add_soft_delete_to_manual_assets_liabilities`

Open the generated
`server/prisma/migrations/<timestamp>_add_soft_delete_to_manual_assets_liabilities/migration.sql`
and confirm it contains only `ALTER TABLE ... ADD COLUMN` statements for
`manual_assets` and `manual_liabilities`, plus the index changes. Because
`isDeleted` has a default of `false`, existing rows are automatically treated as
not-deleted, which is correct — no backfill is needed.

**Verify**: the migration SQL contains **no** `DROP TABLE` and no `DELETE FROM`
statements:
```sh
grep -icE "drop table|delete from" server/prisma/migrations/*_add_soft_delete_to_manual_assets_liabilities/migration.sql
```
→ returns `0`. If it returns anything else, **STOP**.

**Verify**: `npm run db:generate --workspace=server` → exit 0.

### Step 4: Convert the two delete endpoints to soft delete

In `server/src/routes/assets.ts`, replace the hard delete at line 163. Import
`NOT_DELETED` from `../lib/softDeleteWhere` if not already imported.

Target shape:

```ts
// DELETE /api/v1/assets/:id
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const existing = await prisma.manualAsset.findFirst({
      where: { id: req.params.id, householdId: req.householdId!, ...NOT_DELETED },
    });
    if (!existing) return res.status(404).json({ error: 'Asset not found' });

    await prisma.manualAsset.update({
      where: { id: req.params.id },
      data: { isDeleted: true, deletedAt: new Date() },
    });
    res.json({ message: 'Deleted' });
  } catch (err) {
    req.log.error({ err }, 'error');
    res.status(500).json({ error: 'Failed to delete asset' });
  }
});
```

Apply the equivalent change to `server/src/routes/liabilities.ts:268`, keeping
that file's existing `return res.json(...)` style and its
`'liabilities/DELETE /:id'` log message.

Note the response body stays `{ message: 'Deleted' }` — do not change it.

**Verify**:
```sh
grep -rn "manualAsset.delete\|manualLiability.delete" server/src --include=*.ts
```
→ no matches.

**Verify**: `npm exec --workspace=server -- tsc --noEmit` → exit 0.

### Step 5: Add `NOT_DELETED` to every read site

Work through the tables in "Current state", file by file, adding
`...NOT_DELETED` to the `where` clause of each site marked "add `NOT_DELETED`".
That is 19 sites across 5 files.

For each file, add the import if absent. The relative path differs by
directory — check an existing import in a sibling file rather than guessing:
- `server/src/routes/*.ts` → `from '../lib/softDeleteWhere'`
- `server/src/routeModules/*.ts` → `from '../lib/softDeleteWhere'`
- `server/src/services/*.ts` → `from '../lib/softDeleteWhere'`
- `server/src/lib/reporting/standard.ts` → `from '../softDeleteWhere'`

Example, `server/src/routes/assets.ts:24`:

```ts
    const assets = await prisma.manualAsset.findMany({
      where: { householdId: req.householdId!, ...NOT_DELETED },
```

For the two `aggregate` calls at `assets.ts:67` and `:73`, the filter goes in
the same `where` position:

```ts
    const manualAssetsAgg = await prisma.manualAsset.aggregate({
      where: { householdId: req.householdId!, ...NOT_DELETED },
      _sum: { currentValue: true },
    });
```

Leave the two `create` calls and the two `update` calls alone — creates do not
need the filter, and both updates are already guarded by a preceding
`findFirst` that now carries it.

**Verify**: every `findMany` / `findFirst` / `aggregate` on these two models
carries the filter:
```sh
grep -rn -A2 "manualAsset\.\(findMany\|findFirst\|aggregate\)\|manualLiability\.\(findMany\|findFirst\|aggregate\)" server/src --include=*.ts | grep -c "NOT_DELETED"
```
→ returns `19`.

**Verify**: `npm exec --workspace=server -- tsc --noEmit` → exit 0.

### Step 6: Add regression tests

Create `server/tests/routes/manualSoftDelete.test.ts`.

Cases to cover:

1. **The regression this plan fixes (asset)**: `DELETE /api/v1/assets/:id`
   calls `manualAsset.update` with `{ isDeleted: true }` and **never** calls
   `manualAsset.delete`. Assert on the mock:
   `expect(prismaMock.manualAsset.delete).not.toHaveBeenCalled()`.
2. **The regression this plan fixes (liability)**: same for
   `DELETE /api/v1/liabilities/:id`.
3. **Deleted rows disappear from lists**: `GET /api/v1/assets` issues a
   `findMany` whose `where` includes `isDeleted: false`.
4. **Deleted rows are excluded from net worth**: the `manualAsset.findMany` in
   the net-worth report path passes `isDeleted: false`.
5. **404 on already-deleted**: deleting an asset whose `findFirst` returns
   `null` responds `404` with `{ error: 'Asset not found' }`.
6. **Household isolation is preserved**: the delete handler's `findFirst`
   `where` still contains the caller's `householdId`. This guards against
   accidentally dropping the household filter while editing the clause.

Mock Prisma with `vitest-mock-extended`, following
`server/tests/routes/accounts.test.ts` for harness structure.

**Verify**:
`npm run test --workspace=server -- tests/routes/manualSoftDelete.test.ts`
→ 6 tests pass.

**Verify (proves the tests are meaningful)**: temporarily revert
`assets.ts:163` to `prisma.manualAsset.delete(...)`, re-run, confirm case 1
**fails**, then restore and confirm it passes. Do not commit the temporary
change.

### Step 7: Full verification

**Verify**: `npm run test --workspace=server` → all pass (647 baseline + 6 new
= 653+), 0 failing.

**Verify**: `npm run build --workspace=server` → exit 0.

**Verify**: `npm run lint --workspace=server` → exit 0, no new errors.

## Test plan

- **New file**: `server/tests/routes/manualSoftDelete.test.ts`, six cases as
  listed in Step 6 — two soft-delete conversions, two exclusion checks, one
  not-found path, one household-isolation guard.
- **Structural pattern**: model on `server/tests/routes/accounts.test.ts`.
- **Existing tests that must keep passing**: any
  `server/tests/routes/assets.test.ts`, `liabilities.test.ts`,
  `wealth*.test.ts`, `networth.test.ts`, `settings.test.ts`, and
  `reportingStandard.test.ts`. If one fails because it asserted a hard delete,
  that is a legitimate update — change the assertion to expect the soft delete
  and say so in the commit message.
- Verification: `npm run test --workspace=server` → all pass.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -rn "manualAsset.delete\|manualLiability.delete" server/src --include=*.ts` returns no matches
- [ ] `sed -n '/^model ManualAsset /,/^}/p;/^model ManualLiability /,/^}/p' server/prisma/schema.prisma | grep -c isDeleted` returns `2`
- [ ] A migration directory matching `*_add_soft_delete_to_manual_assets_liabilities` exists
- [ ] That migration's SQL contains no `DROP TABLE` and no `DELETE FROM`
- [ ] `npm exec --workspace=server -- prisma validate --schema server/prisma/schema.prisma` passes
- [ ] `npm exec --workspace=server -- tsc --noEmit` exits 0
- [ ] `npm run test --workspace=server` exits 0 with 653+ passing
- [ ] `npm run build --workspace=server` exits 0
- [ ] `npm run lint --workspace=server` exits 0 with no new errors
- [ ] `git diff --name-only` lists no file under `client/`
- [ ] `git diff --name-only` does not list `server/src/services/investmentService.ts`
- [ ] `plans/README.md` status row for 022 updated

## STOP conditions

Stop and report back (do not improvise) if:

- Step 1's grep returns a materially different set of query sites than the
  tables list.
- No Postgres is available to run `npm run db:migrate`. The plan cannot be
  completed without applying the migration.
- The generated migration SQL contains anything beyond `ALTER TABLE ... ADD
  COLUMN` and index changes — in particular any `DROP` or `DELETE`.
- You find a query site on these models outside the five in-scope files.
- You are tempted to also fix `InvestmentHolding` / `HoldingLot`. That is
  explicitly out of scope; report it as remaining work instead.
- An existing test fails in a way you cannot attribute to the intended
  behaviour change.
- A verification fails twice after a reasonable fix attempt.

## Maintenance notes

- **For the reviewer**: the two things to check are (a) that no
  `findMany`/`findFirst`/`aggregate` on these models was left without
  `NOT_DELETED` — a missed one leaks deleted assets into a total, which is
  worse than the bug being fixed — and (b) that every existing `householdId`
  filter survived the edit.
- **Any new query** on `ManualAsset` or `ManualLiability` must spread
  `NOT_DELETED`. This is not enforced by the type system; it relies on review.
  If this class of bug recurs, consider a Prisma client extension applying the
  filter globally.
- Rows are now retained forever. If storage becomes a concern, a retention job
  purging rows with `deletedAt` older than N months is the natural follow-up —
  but that is a product decision about data retention, not a bug fix.
- **Remaining work in this class, deliberately not covered here**:
  `InvestmentHolding`, `HoldingLot`, `DividendRecord`, and
  `RecurringInvestment` still hard-delete, and `HoldingLot` cascades from
  `InvestmentHolding` — so deleting one holding still destroys its entire trade
  history and cost basis. `plans/004-investment-soft-delete.md` describes this
  but was marked DONE without being implemented; it needs re-planning against
  its true size (59 query sites).
- No restore path exists yet. Deleted rows are recoverable only by direct SQL
  (`UPDATE manual_assets SET "isDeleted" = false WHERE id = '...'`). Worth
  documenting in `docs/02-how-to/` if users start asking.
