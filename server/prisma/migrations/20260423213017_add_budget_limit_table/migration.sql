-- CreateTable
CREATE TABLE "budget_limits" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "limitAmount" DECIMAL(19,4) NOT NULL,
    "spentAmount" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "rolloverAmount" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "budget_limits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "budget_limits_householdId_periodKey_idx" ON "budget_limits"("householdId", "periodKey");

-- CreateIndex
CREATE UNIQUE INDEX "budget_limits_budgetId_periodKey_key" ON "budget_limits"("budgetId", "periodKey");

-- AddForeignKey
ALTER TABLE "budget_limits" ADD CONSTRAINT "budget_limits_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "budgets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
