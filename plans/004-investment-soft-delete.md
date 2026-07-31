# Plan 004: Add soft-delete support for investment holdings and lots

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 28cf4a0..HEAD -- server/prisma/schema.prisma server/src/services/investmentService.ts server/src/` — if any in-scope file changed, compare against live code before proceeding; on a mismatch, STOP.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: data-integrity
- **Planned at**: commit `28cf4a0`, 2026-06-19

## Why this matters

`InvestmentHolding` and `HoldingLot` models use hard-delete (`prisma.investmentHolding.delete()`, `prisma.holdingLot.delete()`), permanently destroying financial records. This violates the project rule "Never hard-delete financial records." Without soft-delete:
- No audit trail for deleted holdings.
- No rollback possible if a delete is accidental.
- Reporting queries that should exclude deleted records can't distinguish them.

Other models in the schema (`Account`, `TransactionJournal`, `Category`, `RecurringItem`) already have `isDeleted` columns and soft-delete patterns.

## Current state

- `server/prisma/schema.prisma:600-644` — `InvestmentHolding` and `HoldingLot` models lack `isDeleted` and `deletedAt` columns.
- `server/src/services/investmentService.ts:421-455` — `deleteHolding`, `deleteHoldingsByAccountId`, `deleteHoldingsByIds` use `prisma.investmentHolding.delete()`/`deleteMany()`.
- `server/src/services/investmentService.ts:638-662` — `deleteLot` uses `prisma.holdingLot.delete()`.

Example hard-delete (line 421-427):
```ts
export async function deleteHolding(householdId: string, id: string) {
  const existing = await prisma.investmentHolding.findFirst({
    where: { id, account: { householdId, ...NOT_DELETED } }
  });
  if (!existing) return null;
  await prisma.investmentHolding.delete({ where: { id } });  // ← hard delete
  return { success: true };
}
```

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Format schema | `npx prisma format --schema server/prisma/schema.prisma` | exit 0 |
| Generate client | `npm run db:generate --workspace=server` | exit 0 |
| Build | `npm run build --workspace=server` | exit 0 |
| Test | `npm run test --workspace=server -- tests/services/` | all pass |

## Scope

**In scope**:
- `server/prisma/schema.prisma` — add `isDeleted` and `deletedAt` to both models
- `server/src/services/investmentService.ts` — change `delete()` to `update({ isDeleted: true })` in all delete functions; add `isDeleted: false` to all read queries
- `server/src/` — update any other file that queries `InvestmentHolding` or `HoldingLot` without `isDeleted: false`

**Out of scope**:
- Data migration to backfill existing records (not practical — hard-deleted data is gone)
- The `DividendRecord` model (different work item)
- Hard-delete callers in tests (test mocks don't need changes)

## Steps

### Step 1: Add `isDeleted` and `deletedAt` to Prisma schema

In `server/prisma/schema.prisma`, add to `InvestmentHolding` model (after line 618):

```
isDeleted Boolean @default(false)
deletedAt  DateTime?
```

Add to `HoldingLot` model (after line 640):

```
isDeleted Boolean @default(false)
deletedAt  DateTime?
```

Run: `npx prisma format --schema server/prisma/schema.prisma` → exit 0

Run: `npm run db:generate --workspace=server` → exit 0

**Verify**: `npm run build --workspace=server` → exit 0

### Step 2: Update delete functions in investmentService.ts

In `server/src/services/investmentService.ts`:

1. **`deleteHolding`** (line 425): Change `prisma.investmentHolding.delete({ where: { id } })` to:
   ```ts
   await prisma.investmentHolding.update({
     where: { id },
     data: { isDeleted: true, deletedAt: new Date() },
   });
   ```

2. **`deleteHoldingsByAccountId`** (lines 435-438): Replace the transaction:
   ```ts
   await prisma.$transaction([
     prisma.holdingLot.updateMany({
       where: { holdingId: { in: holdingIds } },
       data: { isDeleted: true, deletedAt: new Date() },
     }),
     prisma.recurringInvestment.deleteMany({ where: { holdingId: { in: holdingIds } } }),
     prisma.investmentHolding.updateMany({
       where: { id: { in: holdingIds } },
       data: { isDeleted: true, deletedAt: new Date() },
     }),
   ]);
   ```
   Note: `RecurringInvestment` stays hard-deleted (it's a scheduling config, not a financial record).

3. **`deleteHoldingsByIds`** (lines 449-453): Same pattern as above — replace `deleteMany` with `updateMany` for holding lots and holdings.

4. **`deleteLot`** (line 645): Change `prisma.holdingLot.delete({ where: { id } })` to:
   ```ts
   await prisma.holdingLot.update({
     where: { id },
     data: { isDeleted: true, deletedAt: new Date() },
   });
   ```

**Verify**: `npm run build --workspace=server` → exit 0

### Step 3: Add `isDeleted: false` to read queries

Search `server/src/` for all `findMany`, `findFirst`, `findUnique` on `investmentHolding` and `holdingLot`. Add `isDeleted: false` to every `where` clause.

The key locations to check:
- `investmentService.ts` — all read queries on holdings/lots (the `existing` checks in delete functions, `findMany` for holdings listing, etc.)
- Any route handler or service that reads holdings/lots

For each query, add to the `where`:
```ts
isDeleted: false,
```

For `findFirst` in delete functions, also add `isDeleted: false` so you can't operate on already-deleted records.

**Verify**: `npm run build --workspace=server` → exit 0

### Step 4: Run tests

```bash
npm run test --workspace=server -- tests/services/ tests/routes/investments.test.ts tests/routes/assets.test.ts
```

All pass. If tests fail, check whether test fixtures create holdings without `isDeleted` (the column has `@default(false)`, so they get it automatically — tests should pass).

### Step 5: Create a migration file

Run:
```bash
cd server && npx prisma migrate dev --name add_soft_delete_investment_holdings --create-only
```

This creates a migration file in `server/prisma/migrations/`. The migration will add the two nullable columns with defaults.

**Verify**: Migration file exists with correct naming.

## Test plan

- Existing tests cover the investment service. No new tests needed — the change replaces `delete` with `update` in same functions.
- The `isDeleted` default of `false` means existing read queries without `isDeleted: false` in their where clause will still include non-deleted records (the column is false by default). This is safe but suboptimal — step 3 should fix all read queries.

## Done criteria

- [ ] `npx prisma format --schema server/prisma/schema.prisma` exits 0
- [ ] `npm run db:generate --workspace=server` exits 0
- [ ] `npm run build --workspace=server` exits 0
- [ ] `npm run test --workspace=server -- tests/services/ tests/routes/investments.test.ts tests/routes/assets.test.ts` exits 0
- [ ] A migration file exists in `server/prisma/migrations/` for the schema change
- [ ] No `.delete()` or `.deleteMany()` calls remain on `investmentHolding` or `holdingLot` in server source (except test files)
- [ ] All read queries on holdings/lots include `isDeleted: false`
- [ ] `plans/README.md` status updated

## STOP conditions

- If the migration file conflicts with existing migrations (sequencing issue), report and ask for guidance.
- If `npm run db:generate` fails, check Prisma CLI version.
- If removing all `.delete()` calls from read-only queries causes test failures, restore those queries and report.

## Maintenance notes

- When new investment-holding queries are added, they should include `isDeleted: false` by convention.
- `RecurringInvestment` remains hard-deleted — it's a scheduling config model, not a financial record. This matches how other scheduling models work.
- `DividendRecord` is also hard-deleted — audit separately if needed.
