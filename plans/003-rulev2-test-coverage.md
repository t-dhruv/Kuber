# Plan 003: Add RuleV2 engine test coverage

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 28cf4a0..HEAD -- server/src/lib/ruleV2/ server/tests/lib/` — if any in-scope file changed, compare against live code before proceeding; on a mismatch, STOP.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `28cf4a0`, 2026-06-19

## Why this matters

The RuleV2 engine (4 core modules, ~948 source lines) auto-categorizes transactions, sets merchants, clears fields, and moves money — but has one test file with 1 `it` block checking only execution-log shape. Condition evaluation (12+ operators across string/number/date/amount fields), action execution (8+ action types), and transfer matching have zero automated verification. This is financial-moving code with no safety net.

Adding characterization tests (tests that capture current behavior) means future refactors won't silently break the engine. The test pattern (mocked Prisma) already exists in `ruleV2EngineService.test.ts`.

## Current state

### Files under test:
- `server/tests/lib/ruleV2EngineService.test.ts` — 102 lines, 1 test, only checks `runRule` writes correct log shape. Uses `vi.fn()` mocks for Prisma.

### Files that need tests:
- `server/src/lib/ruleV2/RuleV2ConditionEvaluator.ts` (~1252 lines) — evaluates conditions (amount, text comparison, date range, account type, merchant match, tag presence, etc.)
- `server/src/lib/ruleV2/RuleV2ActionExecutor.ts` (~1304 lines) — executes actions (set category, set merchant, set notes, add/remove tags, hide, split, flag for review, stop processing)
- `server/src/lib/ruleV2/RuleV2TransferService.ts` (~670 lines) — matches transfers between accounts
- `server/src/lib/ruleV2/RuleV2EngineService.ts` (~797 lines) — orchestrates rule run, already has 1 test

### Test pattern (from existing test):
```ts
// server/tests/lib/ruleV2EngineService.test.ts
import { describe, expect, it, vi } from 'vitest';

describe('RuleV2EngineService', () => {
  it('writes execution logs using the RuleV2ExecutionLog schema fields', async () => {
    const prisma = { ruleV2Rule: { findFirst: vi.fn()... }, ... };
    const summary = await RuleV2EngineService.runRule(prisma as any, { ... });
    expect(summary).toMatchObject({ ... });
  });
});
```

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Build | `npm run build --workspace=server` | exit 0 |
| Test | `npm run test --workspace=server -- tests/lib/ruleV2EngineService.test.ts` | all pass |
| Test all | `npm run test --workspace=server` | 648+ tests pass |
| Lint | `npm run lint --workspace=server` | exit 0 |

## Scope

**In scope** (create/modify these):
- `server/tests/lib/ruleV2ConditionEvaluator.test.ts` — new file
- `server/tests/lib/ruleV2ActionExecutor.test.ts` — new file
- `server/tests/lib/ruleV2TransferService.test.ts` — new file
- `server/tests/lib/ruleV2EngineService.test.ts` — extend existing

**Out of scope**:
- Modifying RuleV2 source code (tests only)
- Integration tests with real database (unit tests with mocks only)

## Steps

### Step 1: Read the source modules to understand export surface

Read each source file briefly to identify exported functions and their signatures:

- `server/src/lib/ruleV2/RuleV2ConditionEvaluator.ts` — find exported functions
- `server/src/lib/ruleV2/RuleV2ActionExecutor.ts` — find exported functions
- `server/src/lib/ruleV2/RuleV2TransferService.ts` — find exported functions
- `server/src/lib/ruleV2/RuleV2EngineService.ts` — find exported functions

### Step 2: Create `server/tests/lib/ruleV2ConditionEvaluator.test.ts`

Test the condition evaluator with mocked Prisma. Cover at minimum:

- **Amount conditions**: greater than, less than, between, equals
- **Text conditions**: description contains, equals, starts with, regex match
- **Date conditions**: before date, after date, in range
- **Account conditions**: account type equals, account ID match
- **Merchant conditions**: merchant ID equals, merchant name contains
- **Tag conditions**: tag present, tag absent
- **Edge cases**: null/undefined fields, case sensitivity, empty strings
- **conditionMode**: ALL vs ANY matching

Use the existing `ruleV2EngineService.test.ts` as pattern for mocking Prisma.

**Verify**: `npm run test --workspace=server -- tests/lib/ruleV2ConditionEvaluator.test.ts` → all tests pass

### Step 3: Create `server/tests/lib/ruleV2ActionExecutor.test.ts`

Test the action executor. Cover:

- **setCategory**: updates journal with new categoryId
- **setMerchant**: updates journal with new merchantId
- **setNotes**: updates notes field
- **addTags**: creates transaction tags
- **removeTags**: removes transaction tags
- **hide**: sets isHidden flag
- **flagForReview**: sets needsReview flag
- **split**: creates split journals
- **stopProcessing**: returns early from rule chain
- **Edge cases**: null/empty values, already-set values, dry run mode
- **Dry run**: actions are evaluated but not persisted

**Verify**: `npm run test --workspace=server -- tests/lib/ruleV2ActionExecutor.test.ts` → all pass

### Step 4: Create `server/tests/lib/ruleV2TransferService.test.ts`

Test transfer matching:

- **Match found**: two journals with matching amounts and dates across accounts
- **No match**: journals with different amounts
- **Partial match**: one side matched, other pending
- **Multi-currency**: different currencies don't match (or do, depending on logic)
- **Edge cases**: already-linked journals, soft-deleted journals

**Verify**: `npm run test --workspace=server -- tests/lib/ruleV2TransferService.test.ts` → all pass

### Step 5: Extend `server/tests/lib/ruleV2EngineService.test.ts`

Add 3 more tests to the existing file:

- **runRule with no matching conditions**: scannedCount=1, matchedCount=0
- **runRule with all matching conditions**: scannedCount=1, matchedCount=1
- **runRule with stopProcessing**: first matching rule stops, second rule not evaluated
- **runRule with triggerSource='import'**: logs correct trigger source
- **runRule with triggerSource='manual'**: logs correct trigger source

**Verify**: `npm run test --workspace=server -- tests/lib/ruleV2EngineService.test.ts` → all tests pass (now 6+)

### Step 6: Full test run

```bash
npm run test --workspace=server
```

All 648+ existing tests pass, plus new tests.

```bash
npm run build --workspace=server && npm run lint --workspace=server
```

## Test plan

New test files (3) and extensions (1):
- `ruleV2ConditionEvaluator.test.ts` — ~6 describe blocks, ~20 tests
- `ruleV2ActionExecutor.test.ts` — ~8 describe blocks, ~24 tests
- `ruleV2TransferService.test.ts` — ~5 describe blocks, ~10 tests
- `ruleV2EngineService.test.ts` — +5 tests

Total new tests: ~55-60.

Pattern: each test creates a mock Prisma client with `vi.fn()`, calls the exported function, asserts the expected Prisma call shape and return value.

## Done criteria

- [ ] `npm run test --workspace=server` exits 0 with 700+ tests passing (at minimum 55 new)
- [ ] `npm run build --workspace=server` exits 0
- [ ] `npm run lint --workspace=server` exits 0
- [ ] New test files exist for ConditionEvaluator, ActionExecutor, TransferService
- [ ] Existing `ruleV2EngineService.test.ts` has at least 6 tests
- [ ] `plans/README.md` status updated

## STOP conditions

- If a source module exports few or no testable functions (e.g., all internal/private), report the available API surface and adjust scope.
- If mocks become too complex (deep nesting), simplify — prefer testing one function per describe block with focused mocks.
- If build breaks, check that all imports resolve and types match.

## Maintenance notes

- When new condition operators or action types are added to RuleV2, corresponding tests should be added.
- The mock-heavy pattern means these tests won't catch Prisma schema drift, but they will catch logic regressions.
- Consider adding a real-database integration test for RuleV2 as a future improvement.
