# Database Audit Fixes

Generated: 2026-05-11

## Migrations Created

All migrations are in `server/prisma/migrations/` and ready to run.

### 1. Soft Delete for Financial Records (P0)
**File:** `20260511_add_soft_delete_to_transactions_accounts/migration.sql`

- Add `isDeleted` to `transactions` with index `(householdId, isDeleted, date)`
- Add `isDeleted` to `accounts` with index `(householdId, isDeleted)`
- Prevents hard-deletion loss of financial data
- All existing records default to `isDeleted = false`

### 2. Soft Delete for Planning Models (P1)
**File:** `20260511_add_soft_delete_to_category_budget_goal/migration.sql`

- Add `isDeleted` to `categories` with index
- Add `isDeleted` to `budgets` with index
- Add `isDeleted` to `goals` with index
- Add `isDeleted` to `recurring_items` with index
- Prevents accidental loss of user's planning data

### 3. Missing Household Indexes (P0)
**File:** `20260511_add_missing_household_indexes/migration.sql`

Tables now indexed on `(householdId)`:
- `merchants` — speeds up merchant queries
- `tags` — speeds up tag queries
- `saved_reports` — speeds up saved report queries
- `duplicate_dismissals` — speeds up duplicate detection
- `category_groups` — speeds up category group queries
- Composite index: `category_groups(householdId, type)`

**Impact:** Prevents table scans on large households.

### 4. Scope UserPreference to Household (P1)
**File:** `20260511_scope_user_preference_to_household/migration.sql`

**Breaking Change:** UserPreference primary key changes from `(userId, key)` to `(userId, householdId, key)`

- Add `householdId` column (backfilled from household_members)
- Add FK constraint to households
- Prevents multi-household users from seeing/modifying each other's preferences
- **App Code Impact:** Update all `UserPreference` queries to include `householdId`

### 5. Fix Merchant Deletion Cascade (P2)
**File:** `20260511_fix_merchant_cascading_delete/migration.sql`

- Change `transactions.merchantId` FK from `ON DELETE CASCADE` to `ON DELETE SET NULL`
- Preserves transaction history when merchants are deleted
- Merchant will be null in transactions but data remains

### 6. Consolidate Float → Decimal (P0)
**File:** `20260511_consolidate_float_to_decimal/migration.sql`

Copies all Float → Decimal values in:
- `transactions: amount → amountDecimal`
- `accounts: balance → balanceDecimal`, `creditLimit → creditLimitDecimal`
- `budgets: amount → amountDecimal`
- `goals: targetAmount, currentAmount, monthlyContribution → Decimal fields`
- `goal_allocations: amount → amountDecimal`
- `manual_assets: currentValue, purchaseValue → Decimal fields`
- `manual_asset_snapshots: value → valueDecimal`
- `manual_liabilities: originalAmount, currentBalance, interestRate, monthlyPayment → Decimal fields`
- `investment_holdings: shares, costBasis, currentPrice → Decimal fields`
- `holding_lots: shares, pricePerShare → Decimal fields`
- `recurring_investments: amount → amountDecimal`
- `recurring_items: amount → amountDecimal`
- `account_balance_snapshots: balance → balanceDecimal`
- `net_worth_snapshots: assets, liabilities, netWorth → Decimal fields`

**Note:** Float columns retained for gradual migration. App code must exclusively use Decimal fields.

### 7. Validate Category Group Scoping (P1)
**File:** `20260511_validate_category_group_scoping/migration.sql`

Creates Postgres triggers to enforce:
- Category.householdId == CategoryGroup.householdId
- Account.householdId == ObjectGroup.householdId
- Category.householdId == ObjectGroup.householdId
- Budget.householdId == ObjectGroup.householdId

**Prevents:** Cross-household category/object group linkage through app bugs.

## Schema Changes

### New Fields
- `transactions.isDeleted`
- `accounts.isDeleted`
- `categories.isDeleted`
- `budgets.isDeleted`
- `goals.isDeleted`
- `recurring_items.isDeleted`
- `user_preferences.householdId`

### Removed Constraints
- None (soft delete and indexes are additive)

### Changed Constraints
- `transactions.merchantId`: `Cascade` → `SetNull`
- `user_preferences.@@id`: `[userId, key]` → `[userId, householdId, key]`

### New Triggers
- `validate_category_group_scoping()`
- `validate_object_group_scoping()`

## Running Migrations

```bash
# Verify migrations first
npx prisma migrate status

# Apply all migrations
npx prisma migrate deploy

# Format schema after
npx prisma format
```

## Code Changes Required (After Migrations)

### Critical
1. **Transactions:** Add `WHERE isDeleted = false` to all transaction queries
2. **Accounts:** Add `WHERE isDeleted = false` to all account queries
3. **UserPreference:** Add `householdId` parameter to all preference queries
4. **Decimal fields:** Update app code to use `amountDecimal` instead of `amount`

### High Priority
1. **Categories, Budgets, Goals:** Add `WHERE isDeleted = false` to queries
2. **Merchant deletion:** Handle null merchantId in transaction display

### Testing
1. Run type checker: `npx tsc`
2. Run tests: `npm run test`
3. Verify soft-deleted records don't appear in UI
4. Verify UserPreference queries include householdId

## Rollback Plan

Each migration can be rolled back individually:

```bash
npx prisma migrate resolve --rolled-back 20260511_add_soft_delete_to_transactions_accounts
```

However, data migrations (Decimal consolidation) are forward-only.

## Performance Impact

- ✅ Negative impact: +8 new indexes (minor insert/update overhead)
- ✅ Positive impact: Prevents table scans on queries (major select speedup)
- ✅ Net: Improved query performance on large households

## Data Integrity

All migrations preserve existing data:
- Soft delete defaults to `false` (no data hidden)
- Decimal migration copies values (no precision loss)
- FK constraints added after data backfill
- Triggers validate future inserts/updates
