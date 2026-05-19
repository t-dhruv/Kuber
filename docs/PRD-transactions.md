# PRD: Transactions — Kuber

**Version**: 1.0  
**Date**: 2026-05-14  
**Status**: Draft

---

## 1. Executive Summary

### Problem Statement

Transactions are the heartbeat of any personal finance app, but Kuber's current transaction experience has three compounding failures: CSV import is unreliable with frequent column mismatches and duplicate slip-through; categorization is entirely manual with no rule-learning or AI assistance that surfaces proactively; and there is no coherent spending-pattern view that answers "where does my money actually go?"

### Proposed Solution

Redesign the transaction system end-to-end as the reliable data foundation for all other features (budgets, goals, net worth, reports). The system must handle import from any bank CSV with high fidelity, automatically categorize using rules + AI, deduplicate with confidence, and surface spending insights that require zero manual effort from the user.

### Success Criteria

| Metric | Target |
|--------|--------|
| CSV import success rate (no manual column remapping needed) | ≥ 85% of common bank formats |
| Duplicate false-positive rate | < 2% after dedup runs |
| Transactions auto-categorized on import | ≥ 70% |
| Time to import + review 100 transactions | < 5 minutes |
| Household members can independently categorize without conflict | 100% (optimistic locking) |

---

## 2. User Personas

### Primary: The Household Finance Manager
One person in a 2–4 person household who manages all accounts: checking, savings, credit cards, and investment. Imports bank CSVs monthly (or after each statement). Wants to see total household spending by category, compare month-over-month, and know exactly which subscriptions they're paying.

### Secondary: The Household Member
Spouse or partner who occasionally reviews transactions, adds receipts/notes, or re-categorizes personal purchases. Does not manage imports. Must not accidentally corrupt the other member's work.

---

## 3. User Stories & Acceptance Criteria

### 3.1 CSV Import

**Story**: As a finance manager, I want to upload a CSV from any bank so that my transactions appear in Kuber without manual data entry.

**Acceptance Criteria**:
- System auto-detects column mappings for: date, description, amount (single or debit/credit split), currency, reference number
- Supports formats: TD Bank, RBC, BMO, Scotiabank, CIBC, Chase, Wealthsimple (activity export), AMEX, Capital One
- User sees a preview of detected mappings before confirming import
- User can override any auto-detected column mapping
- Duplicate detection runs automatically: transactions within ±1 day and ±$0.01 of an existing transaction are flagged, not blindly imported
- Import result shows: total rows, imported, skipped (duplicate), skipped (invalid), failed
- Import is fully reversible via Operation Checkpoint for 7 days
- Invalid rows (missing date, missing amount, malformed date) are skipped and shown in an error list — they never silently import as bad data

**Non-Goal**: Real-time bank sync (Plaid/Basiq integration is a separate feature track).

---

### 3.2 Manual Transaction Entry

**Story**: As a household member, I want to add a transaction manually so that cash purchases and missing entries are captured.

**Acceptance Criteria**:
- Entry form requires: date, amount, description, account
- Entry form optional: category, merchant, notes, tags, second account (for transfers)
- Transfer entry creates two linked journal entries (debit from one account, credit to another) atomically
- Split entry allows one transaction to be divided across multiple categories
- Form validates: date is a real calendar date, amount is non-zero, account belongs to this household
- Created transaction immediately appears in the account transaction list, sorted by date

---

### 3.3 Categorization

**Story**: As a finance manager, I want transactions to be categorized automatically so that I don't have to touch every row after import.

**Acceptance Criteria**:

**Rule Engine**:
- Rules fire on import and on manual save
- Rule conditions: description contains/starts-with/matches-regex, amount ≥/≤/between, merchant name equals
- Rule actions: set category, set merchant, add tag, mark as recurring, hide transaction
- Rules run in priority order; first matching rule wins unless `stopProcessing=false`
- Rules can be grouped; group has its own `stopProcessing` flag
- Rules apply retroactively via "Apply Rules to All" bulk action (with checkpoint)

**AI Categorization**:
- When AI provider is configured, uncategorized transactions get a category suggestion with confidence score
- Suggestions shown inline as "AI suggested: [Category] (82%)" — user accepts or overrides
- User override trains the local learning model (`CategoryLearningExample`) for that description pattern
- AI categorization never overwrites a user-set category
- App functions fully when AI provider = "none"

**Auto-categorize**:
- Merchant name → category mapping persists across imports (same merchant, same category)
- `autoCategorize` endpoint applies learned mappings to a batch of uncategorized transactions

---

### 3.4 Deduplication

**Story**: As a finance manager, I want the system to catch duplicate transactions so that my balances are not inflated by double-imports.

**Acceptance Criteria**:
- Duplicate detection algorithm: same account + same date (±1 day window) + same amount (±$0.01) = candidate duplicate
- Candidates shown in a dedicated "Review Duplicates" view with side-by-side comparison
- User can: confirm duplicate (soft-delete one), dismiss (mark as "not a duplicate"), or merge (keep one, pull notes/tags from other)
- Dismissed pairs stored in `DuplicateDismissal` — never re-surfaced
- Auto-dedup on import: if confidence > 95% (exact date + exact amount + same description prefix), skip automatically and count as `rowsDuplicate` in import result
- User can re-import with "force import" flag to bypass auto-dedup

---

### 3.5 Transaction List & Filtering

**Story**: As a household member, I want to filter and search transactions so that I can find specific purchases quickly.

**Acceptance Criteria**:
- Filter by: date range, account (multi-select), category (multi-select), merchant, tag, amount range, transaction type (income/expense/transfer), reconciled status, needs-review flag
- Free-text search across: description, merchant name, notes
- Sort by: date (default desc), amount, merchant name
- Pagination: 50 rows per page, total count shown
- Bulk actions: categorize, add tag, mark hidden, delete (soft), mark reconciled
- All bulk actions create an Operation Checkpoint for undo within 7 days

---

### 3.6 Spending Insights

**Story**: As a finance manager, I want to see where my money goes each month so that I can make better decisions.

**Acceptance Criteria**:
- Monthly spending summary: total income, total expenses, net cash flow
- Spending breakdown by category (bar/donut chart), sorted by amount desc
- Month-over-month comparison: current month vs prior month, and vs same month last year
- Top merchants by spend, with transaction count
- Largest single transactions this month
- Budget vs actual for each budgeted category
- All views filter by household (not per-user) — shared household view is default

---

## 4. Technical Specifications

### Data Model (Current — Double-Entry)

```
TransactionGroup (1) → TransactionJournal (many) → TransactionEntry (many)
```

- `TransactionJournal`: the "head" record — holds description, category, merchant, amount, type, AI fields, flags
- `TransactionEntry`: the ledger leg — links a journal to an account with a signed amount
- `TransactionGroup`: groups related journals (e.g., a transfer is two journals in one group)

**This model is correct. Do not replace it.**

### Schema Gaps to Fix

| Gap | Fix |
|-----|-----|
| `HoldingLot` has no `transactionType` | Add `transactionType String @default("buy")` |
| `ImportHistory` has no link to created journal IDs | Add `journalIds String[]` for undo support |
| No index on `TransactionJournal(householdId, merchantId)` | Add for merchant aggregation queries |
| `TransactionJournalMeta` underused | Use for storing import source row hash (dedup fingerprint) |

### Import Pipeline Architecture

```
CSV Upload → Column Detection (csvColumnDetector) 
          → Preview + User Override (MappingConfirmStep)
          → Parse + Validate (parseWithMapping)
          → Dedup Check (importDedup)
          → Rule Application (rules engine)
          → AI Categorization (if provider set)
          → Commit to DB + Checkpoint
          → ImportHistory record
```

### Dedup Fingerprint Strategy

Store SHA-256 of `(accountId + date + amountCents)` in `TransactionJournalMeta` with `name = "importHash"`. On import, check for matching hash before inserting. This catches exact re-imports without relying on fuzzy matching.

### API Surface

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/v1/transactions` | Paginated list with filters |
| POST | `/api/v1/transactions` | Create manual transaction |
| PUT | `/api/v1/transactions/:id` | Update transaction |
| DELETE | `/api/v1/transactions/:id` | Soft delete |
| POST | `/api/v1/transactions/:id/split` | Create split |
| POST | `/api/v1/transactions/bulk` | Bulk categorize/tag/delete |
| POST | `/api/v1/import/detect-mapping` | Auto-detect CSV columns |
| POST | `/api/v1/import/parse-with-mapping` | Preview parsed rows |
| POST | `/api/v1/import/confirm` | Commit import |
| POST | `/api/v1/import/undo/:checkpointId` | Roll back import |
| GET | `/api/v1/duplicates` | List duplicate candidates |
| POST | `/api/v1/duplicates/dismiss` | Dismiss a pair |
| POST | `/api/v1/duplicates/merge` | Merge two transactions |
| POST | `/api/v1/auto-categorize` | Apply learned mappings to batch |

### Security & Privacy

- All routes require `requireAuth` + household scoping via `req.householdId`
- Bulk actions validate every target ID belongs to requesting household
- CSV upload size limit: 10MB
- Import files are not persisted to disk — parsed in-memory, discarded after commit
- Audit log entry created for every transaction create/update/delete

---

## 5. Non-Goals (v1)

- Real-time bank sync (Plaid, Open Banking)
- OCR receipt scanning (attachment upload yes, OCR no)
- Multi-currency transaction-level FX conversion in reports
- Custom transaction types beyond: income, expense, transfer, investment
- Public API for third-party transaction write access

---

## 6. Risks & Phased Roadmap

### Phase 1 — Foundation (Fix what's broken)
- Fix import pipeline: reliable column detection for top 8 Canadian/US bank formats
- Fix dedup: hash-based fingerprint on import, fuzzy review UI
- Fix description concatenation (done)
- Fix rule engine: ensure rules fire on import, not just on manual save

### Phase 2 — Categorization Intelligence
- AI suggestion inline on transaction list (accept/reject UX)
- CategoryLearningExample feedback loop
- Auto-apply merchant → category mapping on import

### Phase 3 — Insights & Reporting
- Monthly spending summary dashboard card
- Category breakdown chart (month-over-month)
- Top merchant spend report
- Budget vs actual inline on transaction list

### Technical Risks

| Risk | Likelihood | Mitigation |
|------|-----------|-----------|
| CSV format variance breaks detection | High | Normalize column names (lowercase, strip punctuation, map aliases) before matching |
| Dedup false positives on legitimate same-day same-amount transactions | Medium | Expose user control: review UI + dismiss |
| Rule engine performance on "Apply All" over 10k transactions | Medium | Batch process with progress indicator, use checkpoint |
| AI API downtime blocks categorization | Low | AI is opt-in; gracefully degrade to uncategorized |
