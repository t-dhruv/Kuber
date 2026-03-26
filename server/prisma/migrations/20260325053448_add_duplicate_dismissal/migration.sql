-- CreateTable
CREATE TABLE "duplicate_dismissals" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "transactionId1" TEXT NOT NULL,
    "transactionId2" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "duplicate_dismissals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "duplicate_dismissals_transactionId1_transactionId2_key" ON "duplicate_dismissals"("transactionId1", "transactionId2");

-- CreateIndex
CREATE INDEX "transactions_householdId_date_amount_idx" ON "transactions"("householdId", "date", "amount");

-- AddForeignKey
ALTER TABLE "duplicate_dismissals" ADD CONSTRAINT "duplicate_dismissals_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;
