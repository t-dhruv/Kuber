# Plan 021: Stop reading stale Decimal shadow columns for balances and holdings

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 66c013c..HEAD -- server/src/lib/reporting/standard.ts server/src/routeModules/accounts.ts server/prisma/schema.prisma`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: MED
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `66c013c`, 2026-07-27

## Why this matters

Kuber's schema carries "shadow" Decimal columns alongside the original Float
money columns (`balance` / `balanceDecimal`, `shares` / `sharesDecimal`, and so
on) from an incomplete Float→Decimal migration. Migration
`server/prisma/migrations/20260511_consolidate_float_to_decimal/migration.sql`
backfilled those Decimal columns once.

The problem is the direction of preference. **No runtime code writes any of
these Decimal columns** — verify with the greps in Step 1 — yet fourteen read
sites prefer them over the Float:

```ts
decimal(account.balanceDecimal ?? account.balance ?? 0)
```

So for any row that existed at migration time, the Decimal holds the
migration-day value forever while every subsequent write updates only the
Float. Concretely, today:

- Reconciling an account (`POST /api/v1/accounts/:id/reconcile`) writes
  `balance` only. The account list (`GET /api/v1/accounts`) and the net-worth
  report keep showing the **pre-reconcile** balance.
- The nightly investment balance job writes `balance` only; same staleness.
- Every transaction, transfer, and CSV import increments `balance` only; the
  net-worth report does not move.
- Editing a manual asset's or liability's value updates the Float only; the
  net-worth report keeps the old value.

These are user-visible wrong numbers in a personal-finance app, on the two
screens people trust most.

**The fix is to read the column the application actually maintains — the
Float.** That is a small, safe, reviewable change that makes reads consistent
with writes today. It is deliberately *not* an attempt to finish the
Float→Decimal migration: doing that properly means making the Decimal columns
non-nullable, converting every one of the ~14 balance write sites (most of
which use `{ balance: { increment: n } }`), backfilling, and dropping the Float
columns. That is a real project and is recorded as follow-on work at the end of
this plan. Half-finishing it a second time is how this bug was created.

## Current state

Files involved:

- `server/src/lib/reporting/standard.ts` — the standard reporting engine.
  Contains 13 of the 14 stale-preference reads, in the net-worth and
  investment-summary generators (lines 1089-1158).
- `server/src/routeModules/accounts.ts` — the account list endpoint; contains
  the 14th (line 207).
- `server/prisma/schema.prisma` — declares the shadow columns.
- `server/src/scripts/backfill-decimals.ts` — the one-shot backfill.
  **Read-only reference.**

`server/src/routeModules/accounts.ts:207` — the account list:

```ts
      balance: a.balanceDecimal ? Number(a.balanceDecimal) : a.balance,
```

`server/src/lib/reporting/standard.ts:1089-1093` — the net-worth query. Note it
selects both columns of each pair:

```ts
    prisma.manualAsset.findMany({ where: { householdId: input.householdId }, select: { currentValue: true, currentValueDecimal: true } }),
    prisma.manualLiability.findMany({ where: { householdId: input.householdId }, select: { currentBalance: true, currentBalanceDecimal: true } }),
    prisma.investmentHolding.findMany({
      where: { account: { householdId: input.householdId, isDeleted: false, isHidden: false, excludeFromNetWorth: false } },
      select: { shares: true, sharesDecimal: true, currentPrice: true, currentPriceDecimal: true },
    }),
```

`server/src/lib/reporting/standard.ts:1096-1109` — the stale reads:

```ts
  const cashValue = accounts
    .filter((account) => account.type !== 'investment')
    .reduce((sum, account) => sum.plus(decimal(account.balanceDecimal ?? account.balance ?? 0)), ZERO);
  const investmentValue = holdings.reduce((sum, holding) => {
    const shares = decimal(holding.sharesDecimal ?? holding.shares ?? 0);
    const price = decimal(holding.currentPriceDecimal ?? holding.currentPrice ?? 0);
    return sum.plus(shares.times(price));
  }, ZERO);
  const manualAssetValue = manualAssets.reduce((sum, asset) => sum.plus(decimal(asset.currentValueDecimal ?? asset.currentValue ?? 0)), ZERO);
  const manualLiabilityValue = manualLiabilities.reduce((sum, liability) => sum.plus(decimal(liability.currentBalanceDecimal ?? liability.currentBalance ?? 0)), ZERO);
  const accountContributions = accounts.map((account) => ({
    id: account.id,
    name: account.name,
    value: decimal(account.balanceDecimal ?? account.balance ?? 0),
  }));
```

`server/src/lib/reporting/standard.ts:1147-1157` — the investment summary:

```ts
      const shares = decimal(holding.sharesDecimal ?? holding.shares ?? 0);
      const price = decimal(holding.currentPriceDecimal ?? holding.currentPrice ?? 0);
      ...
        costBasis: decimal(holding.costBasisDecimal ?? holding.costBasis ?? 0),
```

An example of a write site that only touches the Float, for context —
`server/src/lib/accountBalanceJob.ts:42-45`:

```ts
          await prisma.account.update({
            where: { id: account.id },
            data: { balance: rounded },
          });
```

### Two sites that must NOT change, and why

- `server/src/lib/reporting/standard.ts:1119-1121` reads
  `snapshot.assetsDecimal ?? snapshot.assets` on `NetWorthSnapshot`. Leave
  these alone. `NetWorthSnapshot` rows are immutable history — once written
  they are never updated — so the Decimal (where backfilled) and the Float
  agree by construction, and there is no staleness. Changing them adds risk for
  no benefit.
- `server/src/lib/reporting/standard.ts:1158` reads
  `lot.realizedGainDecimal ?? 0`. This has **no Float counterpart** —
  `realizedGainDecimal` is a genuine Decimal-only column that `investmentService`
  writes directly. It is correct as written.

Read those two carefully before editing; they look identical in shape to the
lines you are changing and it is easy to change them by accident.

### Repo conventions to follow

- Money arithmetic inside `standard.ts` goes through the module's `decimal()`
  helper and `Decimal` methods (`.plus()`, `.times()`), never raw JS floats.
  Keep every `decimal(...)` wrapper in place — this plan changes only which
  *column* is passed into it, never the arithmetic.
- Per `CLAUDE.md`: household-scoped queries always filter on `householdId` from
  the request context. Do not alter any `where` clause in this plan.
- Server tests live in `server/tests/`, use Vitest, and mock Prisma with
  `vitest-mock-extended`. Use `server/tests/lib/reporting/` files as the
  structural pattern if any exist (`ls server/tests/lib/reporting/`),
  otherwise `server/tests/routes/accounts.test.ts`.

## Commands you will need

| Purpose                | Command                                                                 | Expected on success   |
|------------------------|-------------------------------------------------------------------------|-----------------------|
| Typecheck server       | `npm exec --workspace=server -- tsc --noEmit`                            | exit 0                |
| Reporting tests        | `npm run test --workspace=server -- tests/routes/reports.test.ts tests/routes/reportingStandard.test.ts` | all pass |
| Net worth tests        | `npm run test --workspace=server -- tests/routes/networth.test.ts`       | all pass              |
| Account tests          | `npm run test --workspace=server -- tests/routes/accounts.test.ts`       | all pass              |
| Server tests           | `npm run test --workspace=server`                                        | all pass              |
| Build                  | `npm run build --workspace=server`                                       | exit 0                |
| Lint                   | `npm run lint --workspace=server`                                        | exit 0 (warnings OK)  |

## Scope

**In scope** (the only files you should modify):

- `server/src/lib/reporting/standard.ts` (lines ~1089-1158 only)
- `server/src/routeModules/accounts.ts` (line 207 only)
- `server/prisma/schema.prisma` (comments only — see Step 4)
- `server/tests/lib/reporting/netWorthFreshness.test.ts` (create)

**Out of scope** (do NOT touch, even though they look related):

- **Any write site.** Do not add Decimal writes to `accountBalanceJob.ts`,
  `transactionService.ts`, `importService.ts`, `accounts.ts` update/reconcile
  handlers, `assets.ts`, `liabilities.ts`, or `investmentService.ts`. Dual-write
  is the *other* possible fix and mixing the two approaches produces a system
  with no single source of truth.
- **Any Prisma migration.** No column is added, dropped, or made non-nullable
  in this plan. `schema.prisma` changes are comments only.
- `server/src/scripts/backfill-decimals.ts` — leave it; it is inert unless run.
- `standard.ts:1119-1121` (`NetWorthSnapshot`) and `standard.ts:1158`
  (`realizedGainDecimal`) — see "Two sites that must NOT change" above.
- Anything reading `amountDecimal` on `Transaction` / `JournalEntry` /
  `TransactionSplit`. Those Decimal columns are **non-nullable** and are the
  real source of truth for transaction amounts — that part of the migration
  completed successfully. Do not touch them.

## Git workflow

- Branch: `fix/stale-decimal-balance-reads`
- Commit style: Conventional Commits. Suggested message:
  `fix: read maintained Float balances instead of stale Decimal shadows`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Confirm the premise before changing anything

This plan rests on the claim that no runtime code writes these shadow columns.
Verify it yourself:

```sh
grep -rn "balanceDecimal:" server/src --include=*.ts | grep -v scripts/
grep -rn "sharesDecimal:\|costBasisDecimal:\|currentPriceDecimal:" server/src --include=*.ts | grep -v scripts/
grep -rn "currentValueDecimal:\|currentBalanceDecimal:" server/src --include=*.ts | grep -v scripts/
```

**Expected**: the only matches are `select:` clauses (reads) inside
`server/src/lib/reporting/standard.ts`. There must be **no** `data: { ... }`
assignment writing any of these columns outside `server/src/scripts/`.

If any runtime write site exists, **STOP** — the premise is false and the
correct fix may be dual-write instead.

### Step 2: Read the maintained column in the reporting engine

In `server/src/lib/reporting/standard.ts`, change each of the following reads
to use the Float column that runtime code maintains. Keep the `decimal(...)`
wrapper and the `?? 0` guard exactly as they are.

| Line (approx) | From | To |
|---|---|---|
| 1098 | `decimal(account.balanceDecimal ?? account.balance ?? 0)` | `decimal(account.balance ?? 0)` |
| 1100 | `decimal(holding.sharesDecimal ?? holding.shares ?? 0)` | `decimal(holding.shares ?? 0)` |
| 1101 | `decimal(holding.currentPriceDecimal ?? holding.currentPrice ?? 0)` | `decimal(holding.currentPrice ?? 0)` |
| 1104 | `decimal(asset.currentValueDecimal ?? asset.currentValue ?? 0)` | `decimal(asset.currentValue ?? 0)` |
| 1105 | `decimal(liability.currentBalanceDecimal ?? liability.currentBalance ?? 0)` | `decimal(liability.currentBalance ?? 0)` |
| 1109 | `decimal(account.balanceDecimal ?? account.balance ?? 0)` | `decimal(account.balance ?? 0)` |
| 1147 | `decimal(holding.sharesDecimal ?? holding.shares ?? 0)` | `decimal(holding.shares ?? 0)` |
| 1148 | `decimal(holding.currentPriceDecimal ?? holding.currentPrice ?? 0)` | `decimal(holding.currentPrice ?? 0)` |
| 1157 | `decimal(holding.costBasisDecimal ?? holding.costBasis ?? 0)` | `decimal(holding.costBasis ?? 0)` |

Then remove the now-unused shadow columns from the `select` clauses at lines
1087-1094 (`balanceDecimal`, `currentValueDecimal`, `currentBalanceDecimal`,
`sharesDecimal`, `currentPriceDecimal`, and `costBasisDecimal` wherever it is
selected). Leaving them selected would be harmless but misleading; removing
them is what makes the typechecker enforce that nothing reads them again.

Add a short comment above the net-worth query explaining the choice, so the
next reader does not "helpfully" restore the Decimal preference:

```ts
  // Read the Float columns: they are the ones every write path maintains.
  // The *Decimal shadow columns are populated only by the one-shot backfill in
  // scripts/backfill-decimals.ts and go stale the moment a balance changes.
  // See plans/021 — completing the Decimal migration is separate follow-on work.
```

**Verify**: `npm exec --workspace=server -- tsc --noEmit` → exit 0. If the
compiler reports an unused-property or missing-property error on a removed
`select` field, you have removed one that is still read — restore that one.

**Verify**:
`grep -n "Decimal ?? " server/src/lib/reporting/standard.ts` → returns **only**
the three `NetWorthSnapshot` lines (`assetsDecimal`, `liabilitiesDecimal`,
`netWorthDecimal`) and nothing else.

### Step 3: Read the maintained column in the account list

In `server/src/routeModules/accounts.ts:207`, change:

```ts
      balance: a.balanceDecimal ? Number(a.balanceDecimal) : a.balance,
```

to:

```ts
      balance: a.balance,
```

If `balanceDecimal` appears in that handler's Prisma `select`, remove it there
too.

**Verify**:
`grep -n "balanceDecimal" server/src/routeModules/accounts.ts` → no matches.

**Verify**: `npm exec --workspace=server -- tsc --noEmit` → exit 0.

### Step 4: Mark the shadow columns as unmaintained in the schema

In `server/prisma/schema.prisma`, add a trailing comment to each shadow column
this plan stopped reading, so nobody wires them back up believing they are
live. Comments only — **do not change any field type, nullability, or
attribute.**

Apply to: `Account.balanceDecimal`, `Account.creditLimitDecimal`,
`InvestmentHolding.sharesDecimal`, `InvestmentHolding.costBasisDecimal`,
`InvestmentHolding.currentPriceDecimal`, `ManualAsset.currentValueDecimal`,
`ManualAsset.purchaseValueDecimal`, `ManualLiability.currentBalanceDecimal`,
`ManualLiability.originalAmountDecimal`.

Comment text: `// UNMAINTAINED: backfill-only shadow column; see plans/021`

Do **not** comment `Transaction.amountDecimal`, `JournalEntry.amountDecimal`,
or `HoldingLot.realizedGainDecimal`/`acbPerShareAtSale` — those are live.

**Verify**: `npm exec --workspace=server -- prisma format --schema server/prisma/schema.prisma`
→ exit 0.

**Verify**: `npm exec --workspace=server -- prisma validate --schema server/prisma/schema.prisma`
→ reports the schema is valid.

**Verify**: `git diff --stat server/prisma/schema.prisma` → shows only comment
additions; `git diff server/prisma/schema.prisma | grep -E "^[-+]" | grep -v "UNMAINTAINED" | grep -vE "^(---|\+\+\+)"`
returns no lines other than the unchanged field text.

### Step 5: Add a regression test proving balances are not stale

Create `server/tests/lib/reporting/netWorthFreshness.test.ts`.

The test pins the exact bug: given a row whose Float and Decimal disagree — the
state produced by any write after the backfill — the reported value must follow
the Float.

Cases to cover:

1. **The regression this plan fixes**: an account with
   `balance: 500, balanceDecimal: 100` contributes `500` to `cashValue`, not
   `100`.
2. A manual asset with `currentValue: 250, currentValueDecimal: 999`
   contributes `250` to `manualAssetValue`.
3. A manual liability with `currentBalance: 80, currentBalanceDecimal: 5`
   contributes `80` to `manualLiabilityValue`.
4. A holding with `shares: 10, sharesDecimal: 1, currentPrice: 3,
   currentPriceDecimal: 99` contributes `30` to `investmentValue`.
5. **Happy path**: when Float and Decimal agree, the total is unchanged
   (guards against an inverted fix).

Mock Prisma with `vitest-mock-extended` following the pattern in the existing
reporting tests — run `ls server/tests/lib/reporting/ server/tests/routes/reportingStandard.test.ts`
and copy the harness from whichever exists. Do not invent a new one.

**Verify**:
`npm run test --workspace=server -- tests/lib/reporting/netWorthFreshness.test.ts`
→ 5 tests pass.

**Verify (proves the test is meaningful)**: temporarily revert line 1098 to
`decimal(account.balanceDecimal ?? account.balance ?? 0)`, re-run, and confirm
case 1 **fails**. Restore and confirm it passes. Do not commit the temporary
change.

### Step 6: Full verification

**Verify**: `npm run test --workspace=server` → all pass (647 baseline + 5 new
= 652+), 0 failing.

**Verify**: `npm run build --workspace=server` → exit 0.

**Verify**: `npm run lint --workspace=server` → exit 0, no new errors.

## Test plan

- **New file**: `server/tests/lib/reporting/netWorthFreshness.test.ts` with the
  five cases in Step 5 — four divergence cases (one per affected model) and one
  agreement case.
- **Structural pattern**: copy the Prisma-mocking harness from
  `server/tests/routes/reportingStandard.test.ts`.
- **Existing tests that must keep passing**: `tests/routes/reports.test.ts`,
  `tests/routes/reportingStandard.test.ts`, `tests/routes/networth.test.ts`,
  `tests/routes/accounts.test.ts`. If one of these fails, read it before
  changing it — a failure may mean an existing test asserted the stale
  behaviour, which is a STOP condition, not something to edit away.
- Verification: `npm run test --workspace=server` → all pass.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -c "balanceDecimal" server/src/routeModules/accounts.ts` returns 0
- [ ] `grep -n "Decimal ?? " server/src/lib/reporting/standard.ts` returns
      exactly 3 lines, all on `NetWorthSnapshot` fields
- [ ] `grep -rn "sharesDecimal\|currentValueDecimal\|currentBalanceDecimal\|costBasisDecimal\|currentPriceDecimal" server/src --include=*.ts | grep -v scripts/`
      returns no matches
- [ ] `npm exec --workspace=server -- tsc --noEmit` exits 0
- [ ] `npm exec --workspace=server -- prisma validate --schema server/prisma/schema.prisma` passes
- [ ] `npm run test --workspace=server` exits 0 with 652+ passing
- [ ] `npm run build --workspace=server` exits 0
- [ ] `git diff --name-only` lists no file under `server/prisma/migrations/`
- [ ] `git status --short` shows only the four in-scope files
- [ ] `plans/README.md` status row for 021 updated

## STOP conditions

Stop and report back (do not improvise) if:

- Step 1's greps find any runtime code writing a shadow Decimal column. The
  premise is then false and dual-write may be the correct fix instead.
- Any excerpt in "Current state" does not match the live file.
- An existing test fails after Step 2 or 3 **because it asserts the stale
  Decimal value**. Do not rewrite that test to match. It means someone pinned
  the current behaviour deliberately and a human must decide.
- You conclude the right fix is to write the Decimal columns instead. That may
  well be the better long-term answer, but it is a different, larger change
  (~14 write sites, several using `increment`, plus a non-null migration) and
  must not be attempted under this plan.
- `prisma format` reorders or rewrites fields beyond your comment additions.
- A verification fails twice after a reasonable fix attempt.

## Maintenance notes

- **For the reviewer**: check that no write site changed (`git diff` should
  touch no `data: {` block), that the three `NetWorthSnapshot` reads and
  `realizedGainDecimal` are untouched, and that the schema diff is comments
  only.
- After this lands, the shadow Decimal columns are dead weight: written by
  nothing, read by nothing. They are intentionally left in place rather than
  dropped, because dropping columns is irreversible and deserves its own
  reviewed migration.
- **The real follow-on, deliberately deferred**: finish the Float→Decimal
  migration properly as one deliberate project — make the Decimal columns
  non-nullable with backfill, convert all ~14 balance write sites (note most
  use `{ balance: { increment: n } }`, which needs care since incrementing a
  NULL Decimal yields NULL), switch reads, then drop the Float columns. Until
  that happens, **the Float column is the source of truth** for
  `Account.balance`, `InvestmentHolding`, `ManualAsset`, and `ManualLiability`.
  Anyone adding a new read must use the Float.
- `NetWorthSnapshot.cashValue`, `investmentValue`, and `otherAssetsValue` have
  no Decimal counterpart at all. If the consolidation project happens, they
  need columns adding, not just switching.
