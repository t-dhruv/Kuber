# Kuber — Feature Algorithms & Implementation Reference
> Deep-dives for each gap item in GAP_ANALYSIS.md.
> Reference: firefly-iii source. Kuber stack: Node/Express/Prisma/TypeScript.
> Date: 2026-04-23

---

## 1. Bills (Recurring Bill Tracker)

### What it is
A "Bill" in Firefly is different from a recurring transaction. It represents an **expected periodic payment** (rent, Netflix, insurance) and tracks whether each period was paid, with configurable expected amount range.

### Firefly data model
```
Bill
  id, householdId, name
  amountMin, amountMax          -- expected range (null = any)
  date                          -- first expected date
  repeatFreq                    -- weekly | monthly | quarterly | yearly
  skip                          -- skip N periods (e.g. quarterly = skip 2 months)
  active, paid_dates[]          -- which periods have matched transactions
  endDate                       -- optional end date
```

### Core algorithm: match transaction to bill
1. On every transaction create/update, iterate all active bills for the household.
2. For each bill: compute the **expected date range** for the current period using `repeatFreq` + `skip`.
3. If `transaction.date` falls in the period window AND `transaction.amount` is within `[amountMin, amountMax]` AND merchant/description matches bill name (fuzzy) → mark period paid by creating a `BillPaidPeriod` record linking the transaction.
4. Period window: `[billDate for this period, billDate for next period)`.

### Kuber implementation plan
**Schema additions:**
```prisma
model Bill {
  id           String   @id @default(cuid())
  householdId  String
  name         String
  amountMin    Decimal?
  amountMax    Decimal?
  currency     String   @default("USD")
  startDate    DateTime
  endDate      DateTime?
  repeatFreq   String   -- "monthly" | "weekly" | "quarterly" | "yearly"
  skipPeriods  Int      @default(0)
  isActive     Boolean  @default(true)
  notes        String?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  paidPeriods  BillPaidPeriod[]
  household    Household @relation(fields: [householdId], references: [id])
}

model BillPaidPeriod {
  id            String      @id @default(cuid())
  billId        String
  transactionId String
  periodKey     String      -- "2026-04" format
  bill          Bill        @relation(fields: [billId], references: [id])
  transaction   Transaction @relation(fields: [transactionId], references: [id])
  @@unique([billId, periodKey])
}
```

**Matching logic** (`lib/billMatcher.ts`):
```typescript
function getExpectedPeriod(bill: Bill, now: Date): { start: Date; end: Date } {
  // Walk forward from bill.startDate by repeatFreq until we find the period containing now
  // Account for skipPeriods (skip N occurrences)
}

async function matchBillsForTransaction(tx: Transaction, householdId: string) {
  const bills = await prisma.bill.findMany({ where: { householdId, isActive: true } });
  for (const bill of bills) {
    const period = getExpectedPeriod(bill, tx.date);
    if (!period) continue;
    if (tx.date < period.start || tx.date >= period.end) continue;
    if (bill.amountMin && Math.abs(tx.amount) < bill.amountMin) continue;
    if (bill.amountMax && Math.abs(tx.amount) > bill.amountMax) continue;
    const periodKey = `${tx.date.getFullYear()}-${String(tx.date.getMonth() + 1).padStart(2, '0')}`;
    await prisma.billPaidPeriod.upsert({
      where: { billId_periodKey: { billId: bill.id, periodKey } },
      create: { billId: bill.id, transactionId: tx.id, periodKey },
      update: { transactionId: tx.id },
    });
  }
}
```
Call `matchBillsForTransaction()` from `POST /transactions` and `PUT /transactions/:id`.

**Dashboard widget:** List bills due in next 7 days (upcoming) + overdue (period passed, no paid record).

---

## 2. Account Reconciliation

### What it is
User opens a reconciliation view for an account, enters the **closing balance from their bank statement**, and the system calculates the difference. User marks transactions as "cleared". System creates a reconciliation transaction to zero out any remaining difference.

### Firefly algorithm
1. `GET /accounts/:id/reconcile?date=YYYY-MM-DD` → return: sum of all cleared transactions, list of uncleared transactions since last reconciliation.
2. User selects which transactions are cleared.
3. User enters `statementBalance` (what the bank shows).
4. `difference = statementBalance - (openingBalance + sum(clearedTransactions))`.
5. If `difference != 0`: create a reconciliation transaction of type `reconcile` for the difference amount.
6. Mark all selected transactions `isCleared = true`, store `clearedDate`.

### Kuber implementation plan
**Schema additions:**
```prisma
// Add to Transaction:
isCleared     Boolean  @default(false)
clearedDate   DateTime?
reconcileId   String?

model Reconciliation {
  id                String   @id @default(cuid())
  householdId       String
  accountId         String
  statementDate     DateTime
  statementBalance  Decimal
  openingBalance    Decimal
  difference        Decimal  -- auto-created reconcile tx amount (0 if balanced)
  createdAt         DateTime @default(now())
  account           Account  @relation(...)
  household         Household @relation(...)
}
```

**Route:** `POST /api/v1/accounts/:id/reconcile`
```typescript
// Body: { statementDate, statementBalance, clearedTransactionIds[] }
// 1. Fetch account current balance
// 2. Mark transactions isCleared = true
// 3. Compute difference
// 4. If difference != 0: create Transaction { amount: difference, type: 'reconcile', description: 'Reconciliation adjustment' }
// 5. Create Reconciliation record
// 6. Return summary
```

---

## 3. Advanced Operator Search

### What it is
Firefly's search supports queries like: `amount:>100 category:"food & drink" date:last-month account:HSBC has:attachment`

### Firefly architecture
- `QueryParser` → tokenises string into `FieldNode` (key:value) and `StringNode` (free text)
- `OperatorQuerySearch` → maps each node to a Prisma-equivalent WHERE clause fragment
- Supported operators: `amount:`, `amount_more:`, `amount_less:`, `description_contains:`, `description_starts:`, `description_ends:`, `category:`, `budget:`, `account:`, `date:`, `date_before:`, `date_after:`, `tag:`, `has:attachment`, `has:no_category`, `notes_contain:`

### Kuber implementation plan
**Parser** (`lib/searchParser.ts`):
```typescript
type SearchNode =
  | { type: 'field'; key: string; op: '=' | '>' | '<' | '>=' | '<='; value: string }
  | { type: 'text'; value: string };

function parseSearchQuery(query: string): SearchNode[] {
  // Regex: /(\w+):(>=?|<=?|=)?([^\s"]+|"[^"]+")|\S+/g
  // Each token either matches field:op:value or free text
}

const FIELD_MAP: Record<string, (value: string, op: string) => Prisma.TransactionWhereInput> = {
  amount:       (v, op) => ({ amount: { [opToPrisma(op)]: parseFloat(v) } }),
  category:     (v)     => ({ category: { name: { contains: v, mode: 'insensitive' } } }),
  account:      (v)     => ({ account: { name: { contains: v, mode: 'insensitive' } } }),
  tag:          (v)     => ({ tags: { some: { tag: { name: { contains: v, mode: 'insensitive' } } } } }),
  date_before:  (v)     => ({ date: { lt: new Date(v) } }),
  date_after:   (v)     => ({ date: { gt: new Date(v) } }),
  date:         (v)     => resolveDateKeyword(v),   // "last-month", "this-week", "today"
  has:          (v)     => v === 'no_category' ? { categoryId: null } : {},
  notes:        (v)     => ({ notes: { contains: v, mode: 'insensitive' } }),
};

function buildSearchWhere(query: string): Prisma.TransactionWhereInput {
  const nodes = parseSearchQuery(query);
  const clauses: Prisma.TransactionWhereInput[] = nodes.map(node => {
    if (node.type === 'field') return FIELD_MAP[node.key]?.(node.value, node.op) ?? {};
    return { OR: [
      { description: { contains: node.value, mode: 'insensitive' } },
      { notes: { contains: node.value, mode: 'insensitive' } },
    ]};
  });
  return { AND: clauses };
}
```
Replace inline `where` building in `GET /transactions` with `buildSearchWhere(req.query.search)`.

---

## 4. File Attachments

### What it is
User uploads a PDF/image/any-file to attach to a transaction. Stored on disk (or S3). Downloadable later.

### Kuber implementation plan
**Schema:**
```prisma
model Attachment {
  id            String   @id @default(cuid())
  householdId   String
  transactionId String
  filename      String
  mimeType      String
  sizeBytes     Int
  storagePath   String   -- relative path on disk or S3 key
  uploadedAt    DateTime @default(now())
  transaction   Transaction @relation(...)
  household     Household   @relation(...)
}
```

**Storage strategy:** Local disk (`/data/attachments/{householdId}/{txId}/{uuid}-{filename}`) with Nginx serving via `/files/` route. Make S3-swappable via a `StorageAdapter` interface.

**Routes:**
- `POST /api/v1/transactions/:id/attachments` — multer upload, validate mime type, store file, create `Attachment` row
- `GET /api/v1/transactions/:id/attachments` — list attachments (metadata only)
- `GET /api/v1/attachments/:id/download` — stream file from disk
- `DELETE /api/v1/attachments/:id` — unlink file + delete DB row

**Security:** Verify `attachment.householdId === req.householdId` before serving file. Never expose `storagePath` to client.

---

## 5. Available Budget (Global Spending Ceiling)

### What it is
A household-level budget cap per period. E.g. "we can spend max $3,000 this month total." Separate from individual category budgets. UI shows how much of the ceiling the sum of category budgets consumes.

### Algorithm
```
availableRemaining = availableBudget.amount - sum(all category budget limits for period)
spentRemaining = availableBudget.amount - sum(all actual spending this period)
```

**Schema:**
```prisma
model AvailableBudget {
  id          String   @id @default(cuid())
  householdId String
  amount      Decimal
  currencyCode String  @default("USD")
  periodKey   String   -- "2026-04"
  createdAt   DateTime @default(now())
  household   Household @relation(...)
  @@unique([householdId, periodKey])
}
```

Expose on `GET /budgets` response: `availableBudget: { amount, periodKey, totalAllocated, totalSpent }`. UI shows warning when `totalAllocated > amount`.

---

## 6. Auto-Budget

### What it is
Each budget can have an auto-budget rule that runs on period start:
- `RESET`: set limit to fixed amount each period
- `ROLLOVER`: set limit to `fixedAmount + unspent from previous period`
- `ADJUSTED`: set limit to `fixedAmount - overspent from previous period` (decrease if over)

### Algorithm
Runs as a cron job at period start (1st of each month):
```typescript
async function runAutoBudget() {
  const budgets = await prisma.budget.findMany({ where: { autoBudgetType: { not: null } } });
  const periodKey = getPeriodKey(new Date());

  for (const budget of budgets) {
    const prevPeriodKey = getPreviousPeriodKey(periodKey);
    const prevLimit = await prisma.budgetLimit.findUnique({ where: { budgetId_periodKey: { budgetId: budget.id, periodKey: prevPeriodKey } } });

    let newAmount = budget.autoBudgetAmount!;
    if (budget.autoBudgetType === 'ROLLOVER' && prevLimit) {
      const unspent = prevLimit.amount - prevLimit.spent;
      newAmount = budget.autoBudgetAmount! + Math.max(0, unspent);
    } else if (budget.autoBudgetType === 'ADJUSTED' && prevLimit) {
      const overspent = prevLimit.spent - prevLimit.amount;
      newAmount = budget.autoBudgetAmount! - Math.max(0, overspent);
    }

    await prisma.budgetLimit.upsert({
      where: { budgetId_periodKey: { budgetId: budget.id, periodKey } },
      create: { budgetId: budget.id, householdId: budget.householdId, periodKey, amount: newAmount, spent: 0 },
      update: { amount: newAmount },
    });
  }
}
```

**Schema addition on Budget:**
```prisma
autoBudgetType    String?   -- "RESET" | "ROLLOVER" | "ADJUSTED"
autoBudgetAmount  Decimal?  -- base amount for auto calculation
```

---

## 7. Rule Groups + Stop-on-Match

### What it is
Rules are organized into `RuleGroup`s. Each group has a `sortOrder`. Within a group, rules run in sortOrder. A group can have `stopProcessing = true`: if any rule in the group fires, stop evaluating further groups.

### Algorithm
```typescript
// lib/ruleEngine.ts — extend applyActiveRulesToTransaction()

type RuleGroup = { id: string; sortOrder: number; stopProcessing: boolean; rules: Rule[] };

async function applyRulesToTransaction(tx: Transaction, householdId: string) {
  const groups = await prisma.ruleGroup.findMany({
    where: { householdId },
    include: { rules: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } } },
    orderBy: { sortOrder: 'asc' },
  });

  for (const group of groups) {
    let groupFired = false;
    for (const rule of group.rules) {
      if (ruleMatches(rule, tx)) {
        await applyActionsToTransaction(rule, tx);
        groupFired = true;
      }
    }
    if (groupFired && group.stopProcessing) break;
  }
}
```

**Schema addition:**
```prisma
model RuleGroup {
  id              String   @id @default(cuid())
  householdId     String
  name            String
  sortOrder       Int      @default(0)
  stopProcessing  Boolean  @default(false)
  isActive        Boolean  @default(true)
  rules           Rule[]
  household       Household @relation(...)
}
// Add ruleGroupId to Rule model
```

---

## 8. Multi-Currency per Transaction

### What it is
Each transaction can have its own `currencyCode` + `originalAmount`. The account's native currency stores the converted amount. Exchange rate at time of transaction is stored for historical accuracy.

### Algorithm
```typescript
// On transaction create with foreign currency:
// 1. Fetch rate: originalAmount * fxRate = amount (native currency)
// 2. Store both on Transaction

// On balance calculation:
// Always sum Transaction.amount (native currency) — already converted
// Never re-convert historical transactions

// On multi-currency report:
// Group by currencyCode for raw view, use amount for aggregates
```

**Schema additions on Transaction:**
```prisma
currencyCode    String?    -- null = household default currency
originalAmount  Decimal?   -- amount in foreign currency
fxRate          Decimal?   -- rate used at time of transaction
```

**Critical rule:** Once stored, `fxRate` and `originalAmount` are immutable. Revaluation must create an adjustment transaction, not mutate history.

---

## 9. Recurring Transaction Auto-Creation

### What it is
Instead of requiring user confirmation, recurring items whose `nextDate <= today` automatically generate a real transaction and advance `nextDate`.

### Algorithm (`lib/recurringJob.ts`):
```typescript
async function processRecurringItems() {
  const today = startOfDay(new Date());
  const dueItems = await prisma.recurringItem.findMany({
    where: { isActive: true, nextDate: { lte: today }, autoPay: true },
    include: { account: true, category: true },
  });

  for (const item of dueItems) {
    // Create the transaction
    await prisma.transaction.create({
      data: {
        householdId: item.householdId,
        accountId: item.accountId,
        categoryId: item.categoryId,
        description: item.name,
        amount: -item.amount, // expense
        date: item.nextDate,
        isRecurring: true,
        recurringItemId: item.id,
      },
    });

    // Advance nextDate
    const next = computeNextDate(item.nextDate, item.frequency);
    await prisma.recurringItem.update({
      where: { id: item.id },
      data: { nextDate: next, lastProcessedAt: new Date() },
    });
  }
}

function computeNextDate(current: Date, frequency: string): Date {
  const d = new Date(current);
  switch (frequency) {
    case 'daily':   d.setDate(d.getDate() + 1); break;
    case 'weekly':  d.setDate(d.getDate() + 7); break;
    case 'monthly': d.setMonth(d.getMonth() + 1); break;
    case 'yearly':  d.setFullYear(d.getFullYear() + 1); break;
  }
  return d;
}
```

**Schema addition on RecurringItem:**
```prisma
autoPay           Boolean   @default(false)  -- true = auto-create, false = reminder only
lastProcessedAt   DateTime?
recurringItemId   String?   -- backref on Transaction
```

Run `processRecurringItems()` in the daily cron in `index.ts`.

---

## 10. Webhook Delivery Log

### What it is
Every webhook fire is tracked: what was sent, HTTP response, whether it succeeded, and supports retry.

### Algorithm
```typescript
// lib/webhookFire.ts — enhance existing implementation

model WebhookDelivery {
  id          String   @id @default(cuid())
  webhookId   String
  event       String   -- "transaction.created" etc.
  payload     Json
  statusCode  Int?
  response    String?  -- first 1000 chars of response body
  success     Boolean
  attempts    Int      @default(1)
  lastAttemptAt DateTime
  nextRetryAt   DateTime?
  createdAt   DateTime @default(now())
  webhook     Webhook  @relation(...)
}
```

**Retry logic:**
```typescript
async function fireWebhookWithRetry(webhook: Webhook, event: string, payload: object) {
  const delivery = await prisma.webhookDelivery.create({
    data: { webhookId: webhook.id, event, payload, success: false, lastAttemptAt: new Date() }
  });

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const resp = await fetch(webhook.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Kuber-Event': event },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10_000),
      });
      await prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: { statusCode: resp.status, success: resp.ok, attempts: attempt, lastAttemptAt: new Date() }
      });
      if (resp.ok) return;
    } catch (err) {
      if (attempt === 3) {
        await prisma.webhookDelivery.update({
          where: { id: delivery.id },
          data: { attempts: attempt, lastAttemptAt: new Date(), nextRetryAt: null }
        });
      }
    }
    await sleep(attempt * 2000); // exponential backoff: 2s, 4s
  }
}
```

Expose `GET /api/v1/webhooks/:id/deliveries` for debugging.

---

## Cross-Cutting Implementation Notes

### Decimal precision
All monetary amounts use `Decimal` (Prisma / `decimal.js`). Never `Float`. Store as cents integer internally, divide by 100 for display if needed. Firefly uses `decimal(32,12)` columns — use `@db.Decimal(19,4)` in Prisma for Kuber.

### Period key convention
Use `"YYYY-MM"` string format (matching existing `BudgetLimit.periodKey`). Consistent across Bills, AvailableBudget, AutoBudget.

### Soft deletes on new financial models
All new financial models (Bill, Reconciliation, Attachment, AvailableBudget) must follow existing soft-delete convention: `isDeleted Boolean @default(false)`. Never hard delete.

### Household scope
Every new model must have `householdId` + every query must include `where: { householdId: req.householdId! }`. This is non-negotiable per CLAUDE.md.

### Zod validation
Every new route with a request body needs a Zod schema. Pattern: define schema at top of route file, `safeParse()` before touching DB.
