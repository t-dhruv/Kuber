-- Add householdId indexes on high-query tables
CREATE INDEX "merchants_householdId_idx" ON "merchants"("householdId");
CREATE INDEX "tags_householdId_idx" ON "tags"("householdId");
CREATE INDEX "saved_reports_householdId_idx" ON "saved_reports"("householdId");
CREATE INDEX "duplicate_dismissals_householdId_idx" ON "duplicate_dismissals"("householdId");
CREATE INDEX "category_groups_householdId_idx" ON "category_groups"("householdId");

-- Composite indexes for common queries
CREATE INDEX "category_groups_householdId_type_idx" ON "category_groups"("householdId", "type");
