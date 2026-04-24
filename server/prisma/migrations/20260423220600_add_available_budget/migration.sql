CREATE TABLE "available_budgets" (
  "id" TEXT NOT NULL,
  "householdId" TEXT NOT NULL,
  "amount" DECIMAL(19,4) NOT NULL,
  "currencyCode" TEXT NOT NULL DEFAULT 'USD',
  "periodKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "available_budgets_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "available_budgets_householdId_periodKey_key" UNIQUE ("householdId", "periodKey")
);

ALTER TABLE "available_budgets" ADD CONSTRAINT "available_budgets_householdId_fkey"
  FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;
