ALTER TABLE "transactions" ADD COLUMN "isCleared" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "transactions" ADD COLUMN "clearedDate" TIMESTAMP(3);
ALTER TABLE "transactions" ADD COLUMN "reconcileId" TEXT;

CREATE TABLE "reconciliations" (
  "id" TEXT NOT NULL,
  "householdId" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "statementDate" TIMESTAMP(3) NOT NULL,
  "statementBalance" DECIMAL(19,4) NOT NULL,
  "openingBalance" DECIMAL(19,4) NOT NULL,
  "difference" DECIMAL(19,4) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "reconciliations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "reconciliations_householdId_accountId_idx" ON "reconciliations"("householdId", "accountId");

ALTER TABLE "reconciliations" ADD CONSTRAINT "reconciliations_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "reconciliations" ADD CONSTRAINT "reconciliations_householdId_fkey"
  FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;
