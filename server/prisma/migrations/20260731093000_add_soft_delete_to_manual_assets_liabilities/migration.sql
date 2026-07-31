-- Add soft delete to manually tracked assets and liabilities.
--
-- These are financial records that fed net worth reporting, but DELETE
-- /assets/:id and DELETE /liabilities/:id hard-deleted them, so removing a
-- property or a mortgage erased it from all historical reporting with no
-- way back.

-- Add soft delete to ManualAsset (financial record)
ALTER TABLE "manual_assets" ADD COLUMN "isDeleted" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "manual_assets_householdId_isDeleted_idx" ON "manual_assets"("householdId", "isDeleted");

-- Add soft delete to ManualLiability (financial record)
ALTER TABLE "manual_liabilities" ADD COLUMN "isDeleted" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "manual_liabilities_householdId_isDeleted_idx" ON "manual_liabilities"("householdId", "isDeleted");

-- Existing rows are all live records, so the false default is correct and no
-- backfill is required. App code must filter isDeleted = false on read.
