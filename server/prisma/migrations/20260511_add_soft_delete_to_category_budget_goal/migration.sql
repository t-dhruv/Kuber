-- Add soft delete to Category
ALTER TABLE "categories" ADD COLUMN "isDeleted" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "categories_householdId_isDeleted_idx" ON "categories"("householdId", "isDeleted");

-- Add soft delete to Budget
ALTER TABLE "budgets" ADD COLUMN "isDeleted" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "budgets_householdId_isDeleted_idx" ON "budgets"("householdId", "isDeleted");

-- Add soft delete to Goal
ALTER TABLE "goals" ADD COLUMN "isDeleted" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "goals_householdId_isDeleted_idx" ON "goals"("householdId", "isDeleted");

-- Add soft delete to RecurringItem
ALTER TABLE "recurring_items" ADD COLUMN "isDeleted" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "recurring_items_householdId_isDeleted_idx" ON "recurring_items"("householdId", "isDeleted");
