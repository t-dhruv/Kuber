-- Add soft delete to Transaction (financial record)
ALTER TABLE "transactions" ADD COLUMN "isDeleted" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "transactions_householdId_isDeleted_date_idx" ON "transactions"("householdId", "isDeleted", "date");

-- Add soft delete to Account (financial record)
ALTER TABLE "accounts" ADD COLUMN "isDeleted" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "accounts_householdId_isDeleted_idx" ON "accounts"("householdId", "isDeleted");

-- Update existing queries to filter isDeleted = false
-- App code must be updated to include WHERE isDeleted = false
