-- Add soft delete to investment financial records.
--
-- These four tables previously had no soft-delete column and were hard-deleted
-- by the application. Because holding_lots, dividend_records and
-- recurring_investments all cascade from investment_holdings, deleting a single
-- holding permanently destroyed its entire trade history and cost basis.

-- Add soft delete to InvestmentHolding (financial record)
ALTER TABLE "investment_holdings" ADD COLUMN "isDeleted" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "investment_holdings_accountId_isDeleted_idx" ON "investment_holdings"("accountId", "isDeleted");

-- Add soft delete to HoldingLot (financial record — holds cost basis / ACB history)
ALTER TABLE "holding_lots" ADD COLUMN "isDeleted" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "holding_lots_holdingId_isDeleted_idx" ON "holding_lots"("holdingId", "isDeleted");

-- Add soft delete to DividendRecord (financial record)
ALTER TABLE "dividend_records" ADD COLUMN "isDeleted" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "dividend_records_holdingId_isDeleted_idx" ON "dividend_records"("holdingId", "isDeleted");

-- Add soft delete to RecurringInvestment
ALTER TABLE "recurring_investments" ADD COLUMN "isDeleted" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "recurring_investments_holdingId_isDeleted_idx" ON "recurring_investments"("holdingId", "isDeleted");

-- Existing rows are all live records, so the false default is correct and no
-- backfill is required. App code must filter isDeleted = false on read.
