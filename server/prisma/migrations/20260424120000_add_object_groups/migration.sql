CREATE TABLE "object_groups" (
  "id"          TEXT NOT NULL,
  "householdId" TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "entityType"  TEXT NOT NULL,
  "color"       TEXT,
  "sortOrder"   INTEGER NOT NULL DEFAULT 0,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "object_groups_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "object_groups_householdId_entityType_idx"
  ON "object_groups"("householdId", "entityType");
ALTER TABLE "object_groups"
  ADD CONSTRAINT "object_groups_householdId_fkey"
  FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "accounts"   ADD COLUMN "objectGroupId" TEXT;
ALTER TABLE "categories" ADD COLUMN "objectGroupId" TEXT;
ALTER TABLE "budgets"    ADD COLUMN "groupId" TEXT;

ALTER TABLE "accounts"
  ADD CONSTRAINT "accounts_objectGroupId_fkey"
  FOREIGN KEY ("objectGroupId") REFERENCES "object_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "categories"
  ADD CONSTRAINT "categories_objectGroupId_fkey"
  FOREIGN KEY ("objectGroupId") REFERENCES "object_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "budgets"
  ADD CONSTRAINT "budgets_groupId_fkey"
  FOREIGN KEY ("groupId") REFERENCES "object_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;