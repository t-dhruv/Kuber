# Reports Exclusion Feature — Detailed Implementation Plan

**Date**: 2026-04-30  
**Scope**: Add category/account/transaction exclusion from reports in Kuber  
**Reference**: Firefly III patterns (ignored categories, exclusion flags) + Kuber existing `excludeFromNetWorth` pattern

---

## Table of Contents

1. [Phase 1: Data Model — Prisma Migration](#phase-1)
2. [Phase 2: Backend — Apply Exclusions Everywhere](#phase-2)
3. [Phase 3: Backend — Ad-Hoc Exclusion API Params](#phase-3)
4. [Phase 4: Backend — Saved Report Filters Enhancement](#phase-4)
5. [Phase 5: Frontend — Settings UI for Permanent Exclusions](#phase-5)
6. [Phase 6: Frontend — FiltersPanel Enhancement](#phase-6)
7. [Phase 7: Frontend — Propagate Filters to All Tabs](#phase-7)
8. [Phase 8: Frontend — Transaction-Level Exclusion](#phase-8)
9. [Testing Strategy](#testing)

---

## Phase 1: Data Model — Prisma Migration {#phase-1}

### 1.1 Update Prisma Schema

**File**: `C:\_Code\_selfHosted\Kuber\server\prisma\schema.prisma`

**Changes**:

```prisma
// === In Account model (after line 200: excludeFromNetWorth Boolean @default(false)) ===

  excludeFromNetWorth   Boolean                  @default(false)
  excludeFromReports   Boolean                  @default(false)   // NEW
  lastSynced            DateTime?

// === In Category model (after line 290: isTaxDeductible Boolean @default(false)) ===

  isTaxDeductible   Boolean         @default(false)
  excludeFromReports   Boolean         @default(false)   // NEW
  createdAt      DateTime        @default(now())
```

### 1.2 Create and Run Migration

```bash
# From project root
cd server
npx prisma migrate dev --name add-exclude-from-reports
```

### 1.3 Verify Migration

Check `server\prisma\migrations\` for new SQL file:
```sql
-- Should contain:
ALTER TABLE "accounts" ADD COLUMN "excludeFromReports" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "categories" ADD COLUMN "excludeFromReports" BOOLEAN NOT NULL DEFAULT false;
```

---

## Phase 2: Backend — Apply Exclusions Everywhere {#phase-2}

### 2.1 Core Helper: `fetchGroupedTransactions()` Enhancement

**File**: `C:\_Code\_selfHosted\Kuber\server\src\routes\reports.ts`  
**Location**: Lines 114–187

**Current** `where` clause (line 123–138):
```typescript
const rawTransactions = await prisma.transaction.findMany({
  where: {
    householdId,
    date: { gte: start, lte: end },
    amount: amountWhere,
    isHidden: false,
    isTransfer: false,
    NOT: [{ category: { type: 'investment' } }],
    ...(mode === 'income' ? { isRefund: false } : {}),
  },
  // ...
});
```

**New** `where` clause — add exclusion filters:
```typescript
const rawTransactions = await prisma.transaction.findMany({
  where: {
    householdId,
    date: { gte: start, lte: end },
    amount: amountWhere,
    isHidden: false,
    isTransfer: false,
    NOT: [
      { category: { type: 'investment' } },
      { category: { name: 'Internal Transfer' } },
      { category: { excludeFromReports: true } },   // NEW
      { account: { excludeFromReports: true } },     // NEW
    ],
    ...(mode === 'income' ? { isRefund: false } : {}),
  },
  // ...
});
```

### 2.2 Apply to `/reports/overview` Endpoint

**File**: `C:\_Code\_selfHosted\Kuber\server\src\routes\reports.ts`  
**Location**: Lines 23–27

**Current**:
```typescript
const [accounts, holdings, txns] = await Promise.all([
  prisma.account.findMany({
    where: { householdId, isHidden: false },
    select: { id: true, type: true, balance: true, excludeFromNetWorth: true },
  }),
  // ...
]);
```

**New**:
```typescript
const [accounts, holdings, txns] = await Promise.all([
  prisma.account.findMany({
    where: { householdId, isHidden: false, excludeFromReports: false },  // NEW: add excludeFromReports
    select: { id: true, type: true, balance: true, excludeFromNetWorth: true, excludeFromReports: true },
  }),
  // ...
]);
```

### 2.3 Apply to `/reports/cashflow` Endpoint

**File**: `C:\_Code\_selfHosted\Kuber\server\src\routes\reports.ts`  
**Location**: Lines 924–931

**Current**:
```typescript
const where: Record<string, any> = {
  householdId,
  date: { gte: range.start, lte: range.end },
  isHidden: false,
  isTransfer: false,
  NOT: [{ category: { type: 'investment' } }],
};
```

**New**:
```typescript
const where: Record<string, any> = {
  householdId,
  date: { gte: range.start, lte: range.end },
  isHidden: false,
  isTransfer: false,
  NOT: [
    { category: { type: 'investment' } },
    { category: { excludeFromReports: true } },   // NEW
    { account: { excludeFromReports: true } },     // NEW
  ],
};
```

### 2.4 Apply to `/reports/spending` Endpoint

**File**: `C:\_Code\_selfHosted\Kuber\server\src\routes\reports.ts`  
**Location**: Lines 596–610

**Current**:
```typescript
const where: Record<string, any> = {
  householdId,
  date: { gte: range.start, lte: range.end },
  amount: amountWhere,
  isHidden: false,
  isTransfer: false,
  NOT: [
    { category: { type: 'investment' } },
    { category: { name: 'Internal Transfer' } },
  ],
};
```

**New**:
```typescript
const where: Record<string, any> = {
  householdId,
  date: { gte: range.start, lte: range.end },
  amount: amountWhere,
  isHidden: false,
  isTransfer: false,
  NOT: [
    { category: { type: 'investment' } },
    { category: { name: 'Internal Transfer' } },
    { category: { excludeFromReports: true } },   // NEW
    { account: { excludeFromReports: true } },     // NEW
  ],
};
```

### 2.5 Apply to `/reports/income` Endpoint

**File**: `C:\_Code\_selfHosted\Kuber\server\src\routes\reports.ts`  
**Location**: Lines 783–796

**Current**:
```typescript
const where: Record<string, any> = {
  householdId,
  date: { gte: range.start, lte: range.end },
  amount: amountWhere,
  isHidden: false,
  isTransfer: false,
  NOT: [{ category: { name: 'Internal Transfer' } }],
};
```

**New**:
```typescript
const where: Record<string, any> = {
  householdId,
  date: { gte: range.start, lte: range.end },
  amount: amountWhere,
  isHidden: false,
  isTransfer: false,
  NOT: [
    { category: { name: 'Internal Transfer' } },
    { category: { excludeFromReports: true } },   // NEW
    { account: { excludeFromReports: true } },     // NEW
  ],
};
```

### 2.6 Apply to `/reports/trends` Endpoint

**File**: `C:\_Code\_selfHosted\Kuber\server\src\routes\reports.ts`  
**Location**: Lines 1033–1043

**Current**:
```typescript
const whereClause: Prisma.TransactionWhereInput = {
  householdId,
  date: { gte: start, lt: end },
  amount: { lt: 0 },
  isHidden: false,
  isTransfer: false,
  NOT: [{ category: { type: 'investment' } }],
};
```

**New**:
```typescript
const whereClause: Prisma.TransactionWhereInput = {
  householdId,
  date: { gte: start, lt: end },
  amount: { lt: 0 },
  isHidden: false,
  isTransfer: false,
  NOT: [
    { category: { type: 'investment' } },
    { category: { excludeFromReports: true } },   // NEW
    { account: { excludeFromReports: true } },     // NEW
  ],
};
```

### 2.7 Apply to `/reports/tax-summary` Endpoint

**File**: `C:\_Code\_selfHosted\Kuber\server\src\routes\reports.ts`  
**Location**: Lines 1284–1294

**Current**:
```typescript
const transactions = await prisma.transaction.findMany({
  where: {
    householdId,
    isHidden: false,
    isTransfer: false,
    date: { gte: start, lte: end },
    category: { isTaxDeductible: true },
  },
  // ...
});
```

**New**:
```typescript
const transactions = await prisma.transaction.findMany({
  where: {
    householdId,
    isHidden: false,
    isTransfer: false,
    date: { gte: start, lte: end },
    category: { isTaxDeductible: true, excludeFromReports: false },  // NEW: add excludeFromReports
    NOT: [{ account: { excludeFromReports: true } }],              // NEW
  },
  // ...
});
```

### 2.8 Apply to `/reports/budget-variance` Endpoint

**File**: `C:\_Code\_selfHosted\Kuber\server\src\routes\reports.ts`  
**Location**: Lines 1342–1353

**Current**:
```typescript
const transactions = await prisma.transaction.findMany({
  where: {
    householdId,
    date: { gte: range.start, lte: range.end },
    amount: { lt: 0 },
    isHidden: false,
    isTransfer: false,
    isSplit: false,
    NOT: [{ category: { type: 'investment' } }],
  },
  // ...
});
```

**New**:
```typescript
const transactions = await prisma.transaction.findMany({
  where: {
    householdId,
    date: { gte: range.start, lte: range.end },
    amount: { lt: 0 },
    isHidden: false,
    isTransfer: false,
    isSplit: false,
    NOT: [
      { category: { type: 'investment' } },
      { category: { excludeFromReports: true } },   // NEW
      { account: { excludeFromReports: true } },     // NEW
    ],
  },
  // ...
});
```

### 2.9 Apply to `/reports/benchmarks` Endpoint

**File**: `C:\_Code\_selfHosted\Kuber\server\src\routes\reports.ts`  
**Location**: Lines 1464–1475

**Current**:
```typescript
const rows = await prisma.transaction.groupBy({
  by: ['categoryId'],
  where: {
    householdId,
    amount: { lt: 0 },
    isHidden: false,
    isTransfer: false,
    date: { gte: new Date(startDate), lte: new Date(endDate) },
    NOT: [
      { category: { type: 'investment' } },
      { category: { name: 'Internal Transfer' } },
    ],
  },
  _sum: { amount: true },
});
```

**New**:
```typescript
const rows = await prisma.transaction.groupBy({
  by: ['categoryId'],
  where: {
    householdId,
    amount: { lt: 0 },
    isHidden: false,
    isTransfer: false,
    date: { gte: new Date(startDate), lte: new Date(endDate) },
    NOT: [
      { category: { type: 'investment' } },
      { category: { name: 'Internal Transfer' } },
      { category: { excludeFromReports: true } },   // NEW
      { account: { excludeFromReports: true } },     // NEW
    ],
  },
  _sum: { amount: true },
});
```

### 2.10 Apply to `/reports/drill` Endpoint

**File**: `C:\_Code\_selfHosted\Kuber\server\src\routes\reports.ts`  
**Location**: Lines 1647–1672

**Current**:
```typescript
const where: Record<string, any> = {
  householdId,
  date: { gte: range.start, lte: range.end },
  isHidden: false,
  isTransfer: false,
};
```

**New**:
```typescript
const where: Record<string, any> = {
  householdId,
  date: { gte: range.start, lte: range.end },
  isHidden: false,
  isTransfer: false,
  NOT: [
    { category: { excludeFromReports: true } },   // NEW
    { account: { excludeFromReports: true } },     // NEW
  ],
};
```

### 2.11 Apply to `/reports/export/csv` Endpoint

**File**: `C:\_Code\_selfHosted\Kuber\server\src\routes\reports.ts`  
**Location**: Lines 1116–1125 (cashflow CSV) and Lines 1160–1168 (spending/income CSV)

Add the same `NOT` clause with `excludeFromReports` to both transaction queries in the CSV export.

---

## Phase 3: Backend — Ad-Hoc Exclusion API Params {#phase-3}

### 3.1 Extend `fetchGroupedTransactions()` with `excludeCategoryIds` / `excludeAccountIds`

**File**: `C:\_Code\_selfHosted\Kuber\server\src\routes\reports.ts`  
**Location**: Lines 114–187

Add parameter extraction and `where` clause extension:

```typescript
async function fetchGroupedTransactions(
  householdId: string,
  start: Date,
  end: Date,
  groupBy: string,
  mode: GroupMode,
  excludeCategoryIds?: string[],   // NEW
  excludeAccountIds?: string[],     // NEW
) {
  // ...
  const where: Prisma.TransactionWhereInput = {
    householdId,
    date: { gte: start, lte: end },
    amount: amountWhere,
    isHidden: false,
    isTransfer: false,
    NOT: [
      { category: { type: 'investment' } },
      { category: { excludeFromReports: true } },
      { account: { excludeFromReports: true } },
    ],
  };

  // NEW: Ad-hoc exclusions via API params
  if (excludeCategoryIds && excludeCategoryIds.length > 0) {
    where.categoryId = { notIn: excludeCategoryIds };
  }
  if (excludeAccountIds && excludeAccountIds.length > 0) {
    where.accountId = { notIn: excludeAccountIds };
  }

  // ... rest of function
}
```

### 3.2 Update `/reports/spending` Endpoint to Parse and Pass Exclusions

**File**: `C:\_Code\_selfHosted\Kuber\server\src\routes\reports.ts`  
**Location**: Lines 574–759

```typescript
// Line 578: Add to query param destructuring
const { startDate, endDate, groupBy = 'category', categoryIds, accountIds, tagIds, minAmount, maxAmount, excludeCategoryIds, excludeAccountIds } = req.query;  // NEW: excludeCategoryIds, excludeAccountIds

// In the where clause (around line 596), already handled by NOT excludeFromReports
// Now also handle ad-hoc exclusions:
if (excludeCategoryIds) where.categoryId = { notIn: (excludeCategoryIds as string).split(',') };  // NEW
if (excludeAccountIds) where.accountId = { notIn: (excludeAccountIds as string).split(',') };  // NEW
```

### 3.3 Update `/reports/income` Endpoint

**File**: `C:\_Code\_selfHosted\Kuber\server\src\routes\reports.ts`  
**Location**: Lines 761–911

Same pattern as spending — add `excludeCategoryIds` and `excludeAccountIds` parsing.

### 3.4 Update `/reports/cashflow` Endpoint

**File**: `C:\_Code\_selfHosted\Kuber\server\src\routes\reports.ts`  
**Location**: Lines 913–1014

Same pattern — add `excludeCategoryIds` and `excludeAccountIds` to query parsing and `where` clause.

---

## Phase 4: Backend — Saved Report Filters Enhancement {#phase-4}

### 4.1 Update `SavedReportSchema`

**File**: `C:\_Code\_selfHosted\Kuber\server\src\routes\reports.ts`  
**Location**: Lines 1210–1218

**Current**:
```typescript
const SavedReportSchema = z.object({
  name: z.string().min(1, 'name is required').max(100),
  filters: z.object({
    tab: z.enum(['cashflow', 'spending', 'income']).optional(),
    datePreset: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
  }),
});
```

**New**:
```typescript
const SavedReportSchema = z.object({
  name: z.string().min(1, 'name is required').max(100),
  filters: z.object({
    tab: z.enum(['overview', 'cashflow', 'spending', 'income', 'variance', 'forecast', 'tax', 'benchmarks', 'networth', 'assetsliabilities', 'investmentperformance', 'allocationdrift', 'contributionroom', 'dividendforecast', 'retirementsimulation']).optional(),  // NEW: all tabs
    datePreset: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    // NEW: inclusion/exclusion filter state
    includedCategoryIds: z.array(z.string()).optional(),
    excludedCategoryIds: z.array(z.string()).optional(),
    includedAccountIds: z.array(z.string()).optional(),
    excludedAccountIds: z.array(z.string()).optional(),
    includedTagIds: z.array(z.string()).optional(),
    excludedTagIds: z.array(z.string()).optional(),
    minAmount: z.string().optional(),
    maxAmount: z.string().optional(),
  }),
});
```

### 4.2 Update `SavedReport` Prisma Model (Optional Enhancement)

**File**: `C:\_Code\_selfHosted\Kuber\server\prisma\schema.prisma`  
**Location**: Lines 811–821

The `filters` field is already `Json`, so it can store the new fields without a schema change. However, if you want stronger typing at the DB level, you could add specific columns — but `Json` is flexible and matches the current pattern.

**Recommendation**: Keep as `Json` — no schema change needed for this part.

---

## Phase 5: Frontend — Settings UI for Permanent Exclusions {#phase-5}

### 5.1 Add "Exclude from Reports" Toggle to Categories Page

**File**: `C:\_Code\_selfHosted\Kuber\client\src\pages\settings\CategoriesPage.tsx` (or similar — verify actual filename)

**Changes**:
1. Fetch `excludeFromReports` in the categories query
2. Add a toggle column in the categories table
3. On toggle, call a PATCH/PUT endpoint (needs to be created if not exists)

**Note**: Check if there's already a PATCH endpoint for categories at `server/src/routes/categories.ts`.

### 5.2 Add "Exclude from Reports" Toggle to Accounts Page

**File**: `C:\_Code\_selfHosted\Kuber\client\src\pages\settings\AccountsPage.tsx` (or similar)

Same pattern as categories — add toggle next to the existing "Exclude from Net Worth" toggle.

### 5.3 Create API Endpoint for Updating `excludeFromReports` (if not exists)

**File**: `C:\_Code\_selfHosted\Kuber\server\src\routes\categories.ts`

Add endpoint:
```typescript
// PATCH /api/v1/settings/categories/:id
router.patch('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const { id } = req.params;
    const { excludeFromReports } = req.body;

    const category = await prisma.category.findFirst({
      where: { id, householdId },
    });
    if (!category) return res.status(404).json({ error: 'Category not found' });

    const updated = await prisma.category.update({
      where: { id },
      data: { excludeFromReports },
    });

    return res.json(updated);
  } catch (err) {
    req.log.error({ err }, 'categories/PATCH');
    return res.status(500).json({ error: 'Internal server error' });
  }
});
```

Same pattern for `accounts.ts`.

---

## Phase 6: Frontend — FiltersPanel Enhancement {#phase-6}

### 6.1 Extend `FiltersPanel` with Exclusion Sections

**File**: `C:\_Code\_selfHosted\Kuber\client\src\pages\reports\ReportsPage.tsx`  
**Location**: Lines 2810–3266 (the `FiltersPanel` component)

**Current** `FilterSection` type (line 2837):
```typescript
type FilterSection = "categories" | "accounts" | "tags" | "amount";
```

**New**:
```typescript
type FilterSection = "categories" | "accounts" | "tags" | "amount" | "excludeCategories" | "excludeAccounts";  // NEW
```

Add new state for excluded IDs:
```typescript
// Around line 3488-3492
const [excludeCategoryIds, setExcludeCategoryIds] = useState<string[]>([]);  // NEW
const [excludeAccountIds, setExcludeAccountIds] = useState<string[]>([]);  // NEW
```

Update `FiltersPanelProps` (line 2820–2835) to include new props:
```typescript
interface FiltersPanelProps {
  // ... existing props
  excludeCategoryIds: string[];          // NEW
  excludeAccountIds: string[];          // NEW
  onExcludeCategoryChange: (ids: string[]) => void;  // NEW
  onExcludeAccountChange: (ids: string[]) => void;      // NEW
}
```

Add new navigation items in `FiltersPanel` (around line 2913):
```typescript
const NAV_ITEMS: { value: FilterSection; label: string }[] = [
  { value: "categories", label: "Categories" },
  { value: "accounts", label: "Accounts" },
  { value: "tags", label: "Tags" },
  { value: "amount", label: "Amount" },
  { value: "excludeCategories", label: "Exclude Categories" },  // NEW
  { value: "excludeAccounts", label: "Exclude Accounts" },    // NEW
];
```

Add new section rendering in the right content area (around line 3051):
```typescript
{section === "excludeCategories" &&
  (categoriesData.length === 0 ? (
    <span style={{ fontSize: "0.8125rem", color: "var(--color-text-muted)", padding: "0.5rem" }}>
      No categories
    </span>
  ) : (
    categoriesData.map((cat) => (
      <label key={cat.id} style={checkboxStyle(excludeCategoryIds.includes(cat.id))}>
        <input
          type="checkbox"
          checked={excludeCategoryIds.includes(cat.id)}
          onChange={() => toggleId(excludeCategoryIds, cat.id, setExcludeCategoryIds)}
          style={{ accentColor: "var(--color-accent)" }}
        />
        {cat.icon && (
          <span style={{ fontSize: "1.125rem", lineHeight: 1 }}>{cat.icon}</span>
        )}
        <span style={{ fontSize: "0.8125rem", color: "var(--color-text)" }}>
          {cat.name}
        </span>
      </label>
    ))
  ))}

{section === "excludeAccounts" &&
  (accountsData.length === 0 ? (
    <span style={{ fontSize: "0.8125rem", color: "var(--color-text-muted)", padding: "0.5rem" }}>
      No accounts
    </span>
  ) : (
    accountsData.map((acc) => (
      <label key={acc.id} style={checkboxStyle(excludeAccountIds.includes(acc.id))}>
        <input
          type="checkbox"
          checked={excludeAccountIds.includes(acc.id)}
          onChange={() => toggleId(excludeAccountIds, acc.id, setExcludeAccountIds)}
          style={{ accentColor: "var(--color-accent)" }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "0.8125rem", color: "var(--color-text)" }}>{acc.name}</div>
          {acc.type && (
            <div style={{ fontSize: "0.6875rem", color: "var(--color-text-muted)" }}>{acc.type}</div>
          )}
        </div>
      </label>
    ))
  ))}
```

Update `activeFilterCount` (line 3506–3511):
```typescript
const activeFilterCount =
  filterCategoryIds.length +
  filterAccountIds.length +
  filterTagIds.length +
  (filterMinAmount ? 1 : 0) +
  (filterMaxAmount ? 1 : 0) +
  excludeCategoryIds.length +   // NEW
  excludeAccountIds.length;     // NEW
```

Update `clearAllFilters` (line 3513–3519):
```typescript
function clearAllFilters() {
  setFilterCategoryIds([]);
  setFilterAccountIds([]);
  setFilterTagIds([]);
  setFilterMinAmount("");
  setFilterMaxAmount("");
  setExcludeCategoryIds([]);  // NEW
  setExcludeAccountIds([]);  // NEW
}
```

### 6.2 Update `extraFilterParams` to Include Exclusions

**File**: `C:\_Code\_selfHosted\Kuber\client\src\pages\reports\ReportsPage.tsx`  
**Location**: Lines 3561–3577

**Current**:
```typescript
const extraFilterParams = useMemo(() => {
  const parts: string[] = [];
  if (filterCategoryIds.length)
    parts.push(`categoryIds=${filterCategoryIds.join(",")}`);
  if (filterAccountIds.length)
    parts.push(`accountIds=${filterAccountIds.join(",")}`);
  if (filterTagIds.length) parts.push(`tagIds=${filterTagIds.join(",")}`);
  if (filterMinAmount) parts.push(`minAmount=${filterMinAmount}`);
  if (filterMaxAmount) parts.push(`maxAmount=${filterMaxAmount}`);
  return parts.length ? `&${parts.join("&")}` : "";
}, [filterCategoryIds, filterAccountIds, filterTagIds, filterMinAmount, filterMaxAmount]);
```

**New**:
```typescript
const extraFilterParams = useMemo(() => {
  const parts: string[] = [];
  if (filterCategoryIds.length)
    parts.push(`categoryIds=${filterCategoryIds.join(",")}`);
  if (filterAccountIds.length)
    parts.push(`accountIds=${filterAccountIds.join(",")}`);
  if (filterTagIds.length) parts.push(`tagIds=${filterTagIds.join(",")}`);
  if (filterMinAmount) parts.push(`minAmount=${filterMinAmount}`);
  if (filterMaxAmount) parts.push(`maxAmount=${filterMaxAmount}`);
  // NEW: exclusion params
  if (excludeCategoryIds.length)
    parts.push(`excludeCategoryIds=${excludeCategoryIds.join(",")}`);
  if (excludeAccountIds.length)
    parts.push(`excludeAccountIds=${excludeAccountIds.join(",")}`);
  return parts.length ? `&${parts.join("&")}` : "";
}, [
  filterCategoryIds, filterAccountIds, filterTagIds,
  filterMinAmount, filterMaxAmount,
  excludeCategoryIds, excludeAccountIds,  // NEW
]);
```

---

## Phase 7: Frontend — Propagate Filters to All Tabs {#phase-7}

### 7.1 Update `SavedReport["filters"]` Type and Persistence

**File**: `C:\_Code\_selfHosted\Kuber\client\src\pages\reports\ReportsPage.tsx`  
**Location**: Lines 3272–3282

**Current**:
```typescript
interface SavedReport {
  id: string;
  name: string;
  filters: {
    tab?: ReportTab;
    datePreset?: DatePreset;
    startDate?: string;
    endDate?: string;
  };
  createdAt: string;
}
```

**New**:
```typescript
interface SavedReport {
  id: string;
  name: string;
  filters: {
    tab?: ReportTab;
    datePreset?: DatePreset;
    startDate?: string;
    endDate?: string;
    // NEW: persisted filter state
    includedCategoryIds?: string[];
    excludedCategoryIds?: string[];
    includedAccountIds?: string[];
    excludedAccountIds?: string[];
    includedTagIds?: string[];
    excludedTagIds?: string[];
    minAmount?: string;
    maxAmount?: string;
  };
  createdAt: string;
}
```

### 7.2 Update `currentFilters` to Include All Filter State

**File**: `C:\_Code\_selfHosted\Kuber\client\src\pages\reports\ReportsPage.tsx`  
**Location**: Lines 3526–3532

**Current**:
```typescript
const currentFilters: SavedReport["filters"] = {
  tab,
  datePreset,
  startDate,
  endDate,
};
```

**New**:
```typescript
const currentFilters: SavedReport["filters"] = {
  tab,
  datePreset,
  startDate,
  endDate,
  // NEW: include all filter state
  includedCategoryIds: filterCategoryIds,
  excludedCategoryIds: excludeCategoryIds,
  includedAccountIds: filterAccountIds,
  excludedAccountIds: excludeAccountIds,
  includedTagIds: filterTagIds,
  excludedTagIds: [],  // TODO: add state if implementing tag exclusions
  minAmount: filterMinAmount || undefined,
  maxAmount: filterMaxAmount || undefined,
};
```

### 7.3 Update `loadSavedView` to Restore All Filters

**File**: `C:\_Code\_selfHosted\Kuber\client\src\pages\reports\ReportsPage.tsx`  
**Location**: Lines 3533–3536

**Current**:
```typescript
function loadSavedView(filters: SavedReport["filters"]) {
  if (filters.tab) setTab(filters.tab);
  if (filters.datePreset) setDatePreset(filters.datePreset as DatePreset);
}
```

**New**:
```typescript
function loadSavedView(filters: SavedReport["filters"]) {
  if (filters.tab) setTab(filters.tab);
  if (filters.datePreset) setDatePreset(filters.datePreset as DatePreset);
  // NEW: restore all filter state
  if (filters.includedCategoryIds) setFilterCategoryIds(filters.includedCategoryIds);
  if (filters.excludedCategoryIds) setExcludeCategoryIds(filters.excludedCategoryIds);
  if (filters.includedAccountIds) setFilterAccountIds(filters.includedAccountIds);
  if (filters.excludedAccountIds) setExcludeAccountIds(filters.excludedAccountIds);
  if (filters.includedTagIds) setFilterTagIds(filters.includedTagIds);
  if (filters.minAmount) setFilterMinAmount(filters.minAmount);
  if (filters.maxAmount) setFilterMaxAmount(filters.maxAmount);
}
```

### 7.4 Propagate `extraFilterParams` to ALL Tab Components

**File**: `C:\_Code\_selfHosted\Kuber\client\src\pages\reports\ReportsPage.tsx`  
**Location**: Lines 3734–3775

Currently only 3 tabs receive `extraParams`. **All tabs** need to receive filter params:

```typescript
// Core tabs - already have extraParams
{tab === "cashflow" && (
  <CashFlowTab startDate={startDate} endDate={endDate} extraParams={extraFilterParams} />
)}
{tab === "spending" && (
  <CategoryTab mode="spending" startDate={startDate} endDate={endDate} extraParams={extraFilterParams} onDrillClick={handleDrillClick} />
)}
{tab === "income" && (
  <CategoryTab mode="income" startDate={startDate} endDate={endDate} extraParams={extraFilterParams} onDrillClick={handleDrillClick} />
)}

// Tabs that need extraParams ADDED:
{tab === "variance" && (
  <BudgetVarianceChart from={startDate} to={endDate} extraParams={extraFilterParams} />  // NEW
)}
{tab === "forecast" && (
  <CashFlowForecast extraParams={extraFilterParams} />  // NEW - may need prop
)}
{tab === "tax" && (
  <TaxSummaryTab year={new Date().getFullYear()} extraParams={extraFilterParams} />  // NEW
)}
{tab === "benchmarks" && (
  <SpendingBenchmarksTab startDate={startDate} endDate={endDate} extraParams={extraFilterParams} />  // NEW
)}

// Wealth tabs - these use different data sources, may not need extraParams
// But should at least respect excludeFromReports at the backend level (already handled in Phase 2)
```

**Note**: Components like `OverviewSummary`, `NetWorthSection`, `AssetsLiabilitiesSection`, etc. fetch their own data. They don't currently accept `extraParams`. Options:
1. **Preferred**: Add `extraParams` prop to these components and pass it through to their API calls
2. **Alternative**: Since Phase 2 already adds `excludeFromReports` checks at the backend, these tabs will automatically respect permanent exclusions. Only need `extraParams` if you want ad-hoc exclusions via UI.

---

## Phase 8: Frontend — Transaction-Level Exclusion {#phase-8}

### 8.1 Bulk Exclude Transactions by Category

**File**: `C:\_Code\_selfHosted\Kuber\client\src\pages\reports\components\DrillPanel.tsx`  
**Location**: Around the transaction list area

Add a button/action to exclude all transactions from a specific category:
```typescript
// In DrillPanel, add action button
<button
  onClick={() => {
    // Bulk action: set category's excludeFromReports = true
    api.patch(`/settings/categories/${filter.groupId}`, {
      excludeFromReports: true,
    }).then(() => {
      notify.success(`Excluded ${filter.groupName} from reports`);
    });
  }}
  style={{ /* styles */ }}
>
  Exclude "{filter.groupName}" from all reports
</button>
```

### 8.2 Update `isHidden` for Individual Transactions

The existing `Transaction.isHidden` field already hides transactions from reports. To let users exclude individual transactions:

**File**: `C:\_Code\_selfHosted\Kuber\client\src\pages\transactions\TransactionsPage.tsx` (verify actual path)

Add a "Exclude from Reports" action in the transaction list (similar to "Delete" or "Edit"):
- Toggle `isHidden` field
- Or add a dedicated `excludeFromReports` field on Transaction model (requires new migration)

**Recommendation**: Use existing `isHidden` for now — it already works.

---

## Testing Strategy {#testing}

### Unit Tests

1. **Prisma Migration Test**: Verify new columns exist
   - File: `server/src/routes/__tests__/reports.test.ts` (create if not exists)

2. **Backend Exclusion Logic**: Test that `excludeFromReports: true` categories/accounts are filtered out
   - Test `fetchGroupedTransactions()` with mock data
   - Test all report endpoints with `excludeFromReports: true` set on test data

3. **SavedReport Filters**: Test persistence and restoration of new filter fields
   - Test `SavedReportSchema` validation with new fields
   - Test save/load cycle with excluded IDs

### Integration Tests

1. **E2E Tests** (Playwright):
   - Navigate to Reports page
   - Toggle "Exclude from Reports" on a category in Settings
   - Verify that category no longer appears in Spending report
   - Use FiltersPanel to exclude a category ad-hoc
   - Verify it's excluded from the current report view
   - Save a view with exclusions
   - Reload the saved view and verify exclusions are restored

### Manual Testing Checklist

- [ ] Run Prisma migration successfully
- [ ] `Account.excludeFromReports` defaults to `false`
- [ ] `Category.excludeFromReports` defaults to `false`
- [ ] Setting `excludeFromReports: true` on a category hides it from /reports/spending
- [ ] Setting `excludeFromReports: true` on an account hides it from /reports/cashflow
- [ ] Ad-hoc `excludeCategoryIds` param works on /reports/spending
- [ ] FiltersPanel "Exclude Categories" section renders
- [ ] Checking an exclusion checkbox updates `activeFilterCount`
- [ ] Saving a view with exclusions preserves them
- [ ] Loading a saved view restores exclusions
- [ ] `extraFilterParams` propagates to all tabs (verify in Network tab)

---

## Summary of Files to Modify

| File | Phase | Change Type |
|-----|-------|-------------|
| `server/prisma/schema.prisma` | 1 | Add `excludeFromReports` to Account + Category |
| `server/src/routes/reports.ts` | 2, 3, 4 | Apply exclusions in all endpoints, add ad-hoc params, update SavedReportSchema |
| `server/src/routes/categories.ts` | 5 | Add PATCH endpoint for `excludeFromReports` |
| `server/src/routes/accounts.ts` | 5 | Add PATCH endpoint for `excludeFromReports` |
| `client/src/pages/reports/ReportsPage.tsx` | 6, 7 | Extend FiltersPanel, update extraFilterParams, propagate to all tabs |
| `client/src/pages/settings/CategoriesPage.tsx` | 5 | Add "Exclude from Reports" toggle |
| `client/src/pages/settings/AccountsPage.tsx` | 5 | Add "Exclude from Reports" toggle |
| `client/src/pages/reports/components/DrillPanel.tsx` | 8 | Add bulk-exclude action |

---

## Execution Order Recommendation

```
1. Phase 1: Prisma migration (blocking - must be done first)
2. Phase 2: Backend exclusions (depends on Phase 1)
3. Phase 3: Ad-hoc exclusion params (can be done with Phase 2)
4. Phase 4: SavedReport filters (can be done in parallel with Phase 5)
5. Phase 5: Settings UI (frontend, depends on Phase 2 backend endpoints)
6. Phase 6: FiltersPanel enhancement (depends on Phase 3)
7. Phase 7: Propagate to all tabs (depends on Phase 6)
8. Phase 8: Transaction exclusion (can be done anytime)
```

---

**Ready to implement. Start with Phase 1 (Prisma migration)?**
