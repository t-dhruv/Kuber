-- Add Firefly-style normalized rule metadata without removing legacy JSON rule storage.
ALTER TABLE "rules" ADD COLUMN "name" TEXT;
ALTER TABLE "rules" ADD COLUMN "strict" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "rules" ADD COLUMN "stopProcessing" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "rule_triggers" (
  "id" TEXT NOT NULL,
  "ruleId" TEXT NOT NULL,
  "field" TEXT NOT NULL,
  "operator" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "rule_triggers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "rule_actions" (
  "id" TEXT NOT NULL,
  "ruleId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "value" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "stopProcessing" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "rule_actions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "rule_execution_logs" (
  "id" TEXT NOT NULL,
  "householdId" TEXT NOT NULL,
  "ruleId" TEXT NOT NULL,
  "journalId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'applied',
  "actionsApplied" INTEGER NOT NULL DEFAULT 0,
  "message" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "rule_execution_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "rules_householdId_isActive_sortOrder_idx" ON "rules"("householdId", "isActive", "sortOrder");
CREATE INDEX "rules_ruleGroupId_idx" ON "rules"("ruleGroupId");
CREATE INDEX "rule_triggers_ruleId_sortOrder_idx" ON "rule_triggers"("ruleId", "sortOrder");
CREATE INDEX "rule_actions_ruleId_sortOrder_idx" ON "rule_actions"("ruleId", "sortOrder");
CREATE INDEX "rule_execution_logs_householdId_createdAt_idx" ON "rule_execution_logs"("householdId", "createdAt");
CREATE INDEX "rule_execution_logs_ruleId_createdAt_idx" ON "rule_execution_logs"("ruleId", "createdAt");
CREATE INDEX "rule_execution_logs_journalId_createdAt_idx" ON "rule_execution_logs"("journalId", "createdAt");

ALTER TABLE "rule_triggers" ADD CONSTRAINT "rule_triggers_ruleId_fkey"
  FOREIGN KEY ("ruleId") REFERENCES "rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "rule_actions" ADD CONSTRAINT "rule_actions_ruleId_fkey"
  FOREIGN KEY ("ruleId") REFERENCES "rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "rule_execution_logs" ADD CONSTRAINT "rule_execution_logs_householdId_fkey"
  FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "rule_execution_logs" ADD CONSTRAINT "rule_execution_logs_ruleId_fkey"
  FOREIGN KEY ("ruleId") REFERENCES "rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "rule_execution_logs" ADD CONSTRAINT "rule_execution_logs_journalId_fkey"
  FOREIGN KEY ("journalId") REFERENCES "transaction_journals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
