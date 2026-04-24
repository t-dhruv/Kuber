CREATE TABLE "rule_groups" (
  "id" TEXT NOT NULL,
  "householdId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "stopProcessing" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "rule_groups_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "rule_groups_householdId_idx" ON "rule_groups"("householdId");

ALTER TABLE "rules" ADD COLUMN "ruleGroupId" TEXT;

ALTER TABLE "rule_groups" ADD CONSTRAINT "rule_groups_householdId_fkey"
  FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "rules" ADD CONSTRAINT "rules_ruleGroupId_fkey"
  FOREIGN KEY ("ruleGroupId") REFERENCES "rule_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;
