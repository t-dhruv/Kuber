# Plan 005: Fire webhook events for goals and transaction deletion

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 28cf4a0..HEAD -- server/src/services/transactionService.ts server/src/routes/ server/src/lib/webhookFire.ts` — if any in-scope file changed, compare against live code before proceeding; on a mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: MED
- **Depends on**: none
- **Category**: correctness
- **Planned at**: commit `28cf4a0`, 2026-06-19

## Why this matters

The webhook schema (in `server/src/routes/webhooks.ts:15-21`) declares 5 event types: `transaction.created`, `transaction.updated`, `transaction.deleted`, `goal.created`, `goal.updated`. But `fireWebhooks` is only called for `transaction.created` (2 call sites) and `transaction.updated` (1 call site) in `transactionService.ts`. Three events — `transaction.deleted`, `goal.created`, `goal.updated` — are defined in the API but never fired. Any webhook configured for these events silently never triggers.

## Current state

- `server/src/routes/webhooks.ts:15-21` — schema validates all 5 event types
- `server/src/lib/webhookFire.ts:12-17` — `WebhookEvent` type includes all 5
- `server/src/services/transactionService.ts:538,934` — `fireWebhooks` called for `transaction.created`
- `server/src/services/transactionService.ts:1082` — `fireWebhooks` called for `transaction.updated`
- `server/src/routes/goals.ts` or `server/src/routeModules/goals.ts` — goal create/update handlers exist but have no `fireWebhooks` calls
- `server/src/services/transactionService.ts` — soft-delete handlers exist but have no `fireWebhooks` call

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Build | `npm run build --workspace=server` | exit 0 |
| Test goals | `npm run test --workspace=server -- tests/routes/goals.test.ts` | all pass |
| Test transactions | `npm run test --workspace=server -- tests/routes/transactions.test.ts` | all pass |
| Lint | `npm run lint --workspace=server` | exit 0 |

## Scope

**In scope**:
- `server/src/services/transactionService.ts` — add `fireWebhooks` call in soft-delete path
- `server/src/routes/goals.ts` or `server/src/routeModules/goals.ts` — add `fireWebhooks` calls in create/update handlers

**Out of scope**:
- Other event types not in the schema
- Webhook schema changes
- Retry or delivery guarantees for the new events

## Steps

### Step 1: Find the goal route handler file

Goals routes are in either `server/src/routes/goals.ts` or `server/src/routeModules/`. Read the file to find create and update handlers.

Look for the `import { fireWebhooks } from '../lib/webhookFire'` pattern or where fireWebhooks would need to be added.

**Verify**: Identify the correct file path.

### Step 2: Add fireWebhooks to goal create handler

In the goals create handler, after the goal is successfully created in the database and before the response is sent, add:

```ts
fireWebhooks(householdId, 'goal.created', { id: goal.id, name: goal.name }).catch(() => {});
```

The `.catch(() => {})` is the existing pattern (fire-and-forget).

### Step 3: Add fireWebhooks to goal update handler

In the goals update handler, after the goal is successfully updated:

```ts
fireWebhooks(householdId, 'goal.updated', { id: goal.id, name: goal.name }).catch(() => {});
```

### Step 4: Add fireWebhooks to transaction delete handler

In `server/src/services/transactionService.ts`, find the soft-delete function. After the journal is marked `isDeleted: true` but before returning, add:

```ts
fireWebhooks(householdId, 'transaction.deleted', {
  id: journal.id,
  description: journal.description,
  amount: Number(journal.amountDecimal),
}).catch(() => {});
```

### Step 5: Build and test

```bash
npm run build --workspace=server
npm run test --workspace=server -- tests/routes/goals.test.ts tests/routes/transactions.test.ts
npm run lint --workspace=server
```

## Test plan

- Existing tests should still pass — `fireWebhooks` is fire-and-forget with `.catch(() => {})`, so it can't break the handler.
- Consider adding a test that mocks `fireWebhooks` and verifies it was called with the correct event type, modeled after the transaction tests that already verify webhook firing.

## Done criteria

- [ ] `npm run build --workspace=server` exits 0
- [ ] `npm run test --workspace=server -- tests/routes/goals.test.ts tests/routes/transactions.test.ts` exits 0
- [ ] `npm run lint --workspace=server` exits 0
- [ ] `fireWebhooks` called with `'goal.created'`, `'goal.updated'`, `'transaction.deleted'` in the respective handlers
- [ ] `plans/README.md` status updated

## STOP conditions

- If goals routes use a different pattern than expected (e.g., a service layer instead of inline), follow the same pattern as the route file uses for consistency.
- If tests fail because `fireWebhooks` is now inside a transaction block and the mock prisma doesn't have it, report and we'll use `.catch(() => {})` outside the transaction.

## Maintenance notes

- When new webhook event types are added to the schema, create handlers should fire the event.
- The `.catch(() => {})` pattern means webhook delivery failures are silent. This is existing behavior.
