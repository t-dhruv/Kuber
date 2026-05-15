# PRD: Investments — Kuber

**Version**: 1.0  
**Date**: 2026-05-14  
**Status**: Draft

---

## 1. Executive Summary

### Problem Statement

Investment tracking in Kuber is fundamentally broken at the data model level: `HoldingLot` has no `transactionType` field, so buy and sell transactions cannot be distinguished; there is no realized gain calculation; broker CSV import (e.g., Wealthsimple) misdetects transaction types; and the portfolio view shows raw holdings with no performance context. Users cannot answer "am I making money?" or "what is my total wealth including investments?"

### Proposed Solution

Rebuild the investment feature on a corrected data model that properly tracks buy lots, sell lots, cost basis using FIFO/ACB, realized gains, unrealized gains, dividends, and total return. Add reliable CSV import for at least Wealthsimple and Questrade formats. Surface a portfolio view that gives households a clear picture: individual holding performance, total portfolio return, and integration with net worth.

### Success Criteria

| Metric | Target |
|--------|--------|
| Wealthsimple CSV import: buy/sell types correctly detected | ≥ 95% of rows |
| Average cost basis (ACB) calculation accuracy vs manual check | 100% (deterministic math) |
| Unrealized gain displayed per holding | Within ±$0.01 of manual calculation |
| Portfolio page load time (≤ 50 holdings) | < 800ms |
| Net worth includes investment portfolio value | 100% (no manual sync needed) |

---

## 2. User Personas

### Primary: The Self-Directed Investor
Manages a Wealthsimple or Questrade account. Buys ETFs and stocks regularly. Wants to see: how much each position is up or down, total portfolio value, realized gains this year (for tax), and where to rebalance. Does not use a financial advisor — Kuber is their financial dashboard.

### Secondary: The TFSA/RRSP Tracker
Has tax-sheltered registered accounts. Cares about: contribution room remaining, whether they've over-contributed, and account growth over time. Needs investments linked to tax account records.

---

## 3. User Stories & Acceptance Criteria

### 3.1 Investment Account Setup

**Story**: As a user, I want to designate an account as an investment account so that it shows portfolio features instead of transaction features.

**Acceptance Criteria**:
- Account `type` field supports: `"investment"`, `"tfsa_investment"`, `"rrsp_investment"`, `"fhsa_investment"`, `"resp_investment"`
- Investment accounts show holdings view, not transaction list
- Investment accounts contribute to net worth as: sum of (shares × current price) per holding
- Investment account balance is auto-computed from holdings — not manually entered
- Investment accounts can optionally be linked to a `TaxAccount` for contribution room tracking

---

### 3.2 CSV Import for Investment Transactions

**Story**: As an investor, I want to import my broker's activity CSV so that all my trades are captured in Kuber without manual entry.

**Acceptance Criteria**:

**Supported formats (v1)**:
- Wealthsimple: activity export CSV
- Questrade: order history / account activity CSV

**Detected transaction types**:
- `buy` — adds shares to a holding lot
- `sell` — removes shares via FIFO lot reduction, computes realized gain
- `dividend` — recorded as income transaction linked to the holding
- `deposit` / `withdrawal` — cash in/out of the account
- `fee` — brokerage fees, recorded as expense

**Acceptance criteria**:
- System auto-detects: symbol/ticker, transaction type, date, shares, price per share, total amount
- User previews detected rows before confirming — can override type or symbol
- Duplicate detection: same symbol + date + shares + type = skip (stored hash)
- Import result: rows imported, skipped (dup), skipped (invalid), with error detail
- Import is reversible via Operation Checkpoint for 7 days
- Dividend rows create a `TransactionJournal` (income) linked to the investment account + a `DividendRecord` on the holding

---

### 3.3 Manual Trade Entry

**Story**: As an investor, I want to manually add a buy or sell trade so that broker accounts without CSV export are still tracked.

**Acceptance Criteria**:
- Form fields: symbol (with search/autocomplete from existing holdings), transaction type (buy/sell/dividend), date, shares, price per share, total (auto-calculated, editable for override), notes
- On save:
  - `buy`: creates `HoldingLot` with `transactionType = "buy"`, updates `InvestmentHolding.sharesDecimal` and `costBasisDecimal`
  - `sell`: creates `HoldingLot` with `transactionType = "sell"` (negative shares), applies FIFO to compute realized gain, reduces holding shares
  - `dividend`: creates a `TransactionJournal` of type `income` + records dividend amount on holding
- If selling more shares than held: validation error — cannot sell into negative position
- Fractional shares supported (up to 8 decimal places)

---

### 3.4 Portfolio View

**Story**: As an investor, I want to see my portfolio's performance so that I know how my investments are doing.

**Acceptance Criteria**:

**Portfolio-level summary**:
- Total portfolio value (sum of all holdings at current price)
- Total cost basis (sum of all buy lots, minus sold lots)
- Total unrealized gain/loss = portfolio value − cost basis
- Total unrealized gain/loss % = (unrealized / cost basis) × 100
- Total realized gains (all-time, current year)
- Total dividends received (all-time, current year)
- Total return = (unrealized gain + realized gain + dividends) / cost basis

**Per-holding row**:
- Symbol, name, shares held
- Average cost basis per share (ACB)
- Current price (manually entered or from FX/price feed if available)
- Current value = shares × current price
- Unrealized gain/loss = current value − (shares × ACB)
- Unrealized gain/loss %
- Day change (if price history available)

**Expanded holding view** (click to expand):
- All buy lots: date, shares, price, total cost
- All sell lots: date, shares, sell price, cost basis at sale, realized gain
- All dividends: date, amount

**Pagination**:
- Holdings list paginated at 25 per page
- Expanded lots view paginated at 20 per page

---

### 3.5 Cost Basis Calculation (ACB / FIFO)

**Story**: As an investor, I want accurate cost basis calculations so that my tax reporting is correct.

**Acceptance Criteria**:

**Method**: Adjusted Cost Base (ACB) — Canadian standard; matches FIFO for US users.

**Algorithm**:
- ACB = total cost of all buy lots ÷ total shares held
- Each new buy: ACB recalculated as (previous total cost + new lot cost) / new total shares
- Each sell: realized gain = (sell price − ACB at time of sale) × shares sold; ACB does not change per-share after a sell (ACB method, not FIFO lot-specific)
- Sell lots stored with: shares sold, ACB per share at time of sale, sell price per share, realized gain

**Edge cases**:
- Partial sell of a lot: only the sold portion generates a realized gain record
- Sell reducing holding to 0 shares: holding stays in DB with 0 shares (history preserved), ACB resets on next buy
- Stock split / reverse split: user manually adjusts shares and price; no auto-detection in v1

---

### 3.6 Wealth Integration

**Story**: As a household member, I want my investment accounts to appear in my net worth so that I have one complete financial picture.

**Acceptance Criteria**:
- Net worth calculation includes: bank account balances + investment portfolio value + manual assets − liabilities
- Investment portfolio value = sum across all investment accounts of (shares × current price per holding)
- Net worth snapshot (daily cron) captures investment value at day's close
- Net worth trend chart shows investment contribution distinctly (stacked area: cash, investments, other assets, liabilities)
- "Wealth" page breaks down: liquid assets (checking/savings), investment assets, physical assets, total liabilities, net worth

---

### 3.7 Price Updates

**Story**: As an investor, I want to update the current price of my holdings so that my portfolio value is accurate.

**Acceptance Criteria** (v1 — manual, no live feed):
- User can edit current price per holding inline on the portfolio view
- Price change recalculates unrealized gain instantly (no page reload)
- `priceHistory` JSON field on `InvestmentHolding` stores last 90 days of prices as `[{ date, price }]` — written on each manual update
- Price history powers a sparkline chart per holding

**v2 (future)**: Scheduled price fetch from a free market data API (e.g., Yahoo Finance unofficial, Alpha Vantage free tier) for US/CA listed equities.

---

## 4. Technical Specifications

### Schema Changes Required

#### 4.1 `HoldingLot` — Add `transactionType`

```prisma
model HoldingLot {
  id                   String            @id @default(cuid())
  holdingId            String
  transactionType      String            @default("buy")   // "buy" | "sell" | "dividend"
  date                 DateTime          @default(now())
  shares               Float
  sharesDecimal        Decimal?          @db.Decimal(19, 4)
  pricePerShare        Float
  pricePerShareDecimal Decimal?          @db.Decimal(19, 4)
  // For sell lots only:
  acbPerShareAtSale    Decimal?          @db.Decimal(19, 4)
  realizedGainDecimal  Decimal?          @db.Decimal(19, 4)
  note                 String?
  status               String            @default("confirmed")
  createdAt            DateTime          @default(now())
  holding              InvestmentHolding @relation(fields: [holdingId], references: [id], onDelete: Cascade)

  @@index([holdingId, date])
  @@map("holding_lots")
}
```

#### 4.2 `InvestmentHolding` — Add computed fields

```prisma
model InvestmentHolding {
  // existing fields ...
  totalDividendsDecimal     Decimal?   @db.Decimal(19, 4)
  realizedGainDecimal       Decimal?   @db.Decimal(19, 4)  // materialized on sell
  lastPriceUpdatedAt        DateTime?
  // priceHistory already exists as Json
}
```

#### 4.3 `DividendRecord` — New model

```prisma
model DividendRecord {
  id            String            @id @default(cuid())
  holdingId     String
  date          DateTime
  amountDecimal Decimal           @db.Decimal(19, 4)
  currencyCode  String            @default("CAD")
  journalId     String?           // linked TransactionJournal (income)
  createdAt     DateTime          @default(now())
  holding       InvestmentHolding @relation(fields: [holdingId], references: [id], onDelete: Cascade)

  @@index([holdingId, date])
  @@map("dividend_records")
}
```

---

### ACB Computation — Server Logic

```
function computeACB(lots: HoldingLot[]): {
  shares: Decimal,
  totalCost: Decimal,
  acbPerShare: Decimal,
  realizedGain: Decimal
}

Algorithm:
  shares = 0, totalCost = 0, realizedGain = 0
  for lot in lots sorted by date asc:
    if lot.transactionType === "buy":
      shares += lot.shares
      totalCost += lot.shares * lot.pricePerShare
    if lot.transactionType === "sell":
      acbAtSale = totalCost / shares   (before this sell)
      realizedGain += lot.shares * (lot.pricePerShare - acbAtSale)
      totalCost -= lot.shares * acbAtSale
      shares -= lot.shares
  acbPerShare = shares > 0 ? totalCost / shares : 0
```

This is deterministic — same lots always produce same result. Never store ACB as a mutable field on `InvestmentHolding`; always recompute from lots.

---

### API Surface

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/v1/investments/holdings` | Portfolio summary + holdings list |
| POST | `/api/v1/investments/holdings` | Create new holding (first buy) |
| GET | `/api/v1/investments/holdings/:id` | Single holding with lots |
| PUT | `/api/v1/investments/holdings/:id/price` | Update current price |
| DELETE | `/api/v1/investments/holdings/:id` | Soft delete holding |
| GET | `/api/v1/investments/holdings/:id/lots` | Paginated lots |
| POST | `/api/v1/investments/lots` | Add buy/sell/dividend lot |
| DELETE | `/api/v1/investments/lots/:id` | Delete a lot (recalculates ACB) |
| GET | `/api/v1/investments/performance` | Portfolio-level P&L summary |
| POST | `/api/v1/import/detect-mapping` | Shared with transactions import |
| POST | `/api/v1/import/parse-with-mapping` | Investment-aware parsing |
| POST | `/api/v1/import/confirm` | Commit investment import |

---

### Import Pipeline for Investment CSVs

```
CSV Upload
  → Column Detection (detect symbol, type, shares, price, date columns)
  → Type Inference (buy/sell/dividend/deposit from action/type column values)
  → Preview (user sees detected rows, can override type/symbol)
  → Dedup Check (hash: accountId + symbol + date + shares + type)
  → Commit:
      buy → upsert InvestmentHolding + insert HoldingLot(buy)
      sell → insert HoldingLot(sell) + recompute realized gain + update holding
      dividend → insert DividendRecord + create TransactionJournal(income)
      deposit/withdrawal → create TransactionJournal on account
  → Operation Checkpoint
  → ImportHistory record
```

### Wealthsimple CSV Column Mapping

| Wealthsimple Column | Kuber Field |
|---------------------|-------------|
| `Activity Date` | `date` |
| `Symbol` | `symbol` |
| `Activity Type` | `transactionType` (map: "Buy"→buy, "Sell"→sell, "Dividend"→dividend, "Contribution"→deposit, "Withdrawal"→withdrawal) |
| `Quantity` | `shares` |
| `Price` | `pricePerShare` |
| `Amount` | `totalAmount` |
| `Description` | `description` |

---

### Security & Privacy

- Investment data is household-scoped — all queries filter by `req.householdId`
- Lot deletion audited in `AuditLog`
- No external price feed credentials needed in v1 (manual price entry)
- CSV upload not persisted to disk

---

## 5. Non-Goals (v1)

- Live price feeds / market data API integration
- Options, futures, crypto, or fixed income (bonds) — equities and ETFs only
- Tax form generation (T5008, Schedule 3, Form 8949)
- Brokerage account linking (OAuth/API integration with Wealthsimple, Questrade)
- Portfolio rebalancing recommendations
- Benchmark comparison (vs S&P 500, etc.)
- Multi-currency portfolio with FX-adjusted returns

---

## 6. Risks & Phased Roadmap

### Phase 1 — Fix the Foundation
1. Add `transactionType` to `HoldingLot` (migration)
2. Add `DividendRecord` model (migration)
3. Rewrite ACB computation to be derived from lots (not mutable field)
4. Fix realized gain calculation on sell
5. Fix Wealthsimple import: column aliases + type detection

### Phase 2 — Portfolio View
1. Portfolio summary endpoint with P&L, realized/unrealized gains, dividends
2. Per-holding expanded view with buy/sell/dividend lots
3. Price update UI with sparkline from `priceHistory`
4. Pagination for holdings and lots

### Phase 3 — Wealth Integration
1. Net worth includes investment portfolio value (computed, not manual)
2. Net worth breakdown chart: cash vs investments vs physical vs liabilities
3. Daily snapshot cron captures investment value
4. Wealth page with complete household financial picture

### Technical Risks

| Risk | Likelihood | Mitigation |
|------|-----------|-----------|
| ACB recalculation slow for holdings with 500+ lots | Low | ACB is O(n) over lots; only recompute on mutation, cache result on holding |
| Wealthsimple changes CSV format | Medium | Column detection is alias-based, not position-based; update alias table |
| User deletes a buy lot that has associated sells | High | Validate: cannot delete a buy lot if sells depend on it for ACB; show error |
| Sell into negative position via import | Medium | Validate shares sold ≤ shares held at that point in time; reject row |
| Price history JSON grows unbounded | Low | Trim to last 365 days on each price update |
