-- AlterTable
ALTER TABLE "holding_lots" ADD COLUMN     "acbPerShareAtSale" DECIMAL(19,4),
ADD COLUMN     "realizedGainDecimal" DECIMAL(19,4),
ADD COLUMN     "transactionType" TEXT NOT NULL DEFAULT 'buy';

-- AlterTable
ALTER TABLE "import_history" ADD COLUMN     "journalIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "investment_holdings" ADD COLUMN     "lastPriceUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "totalDividendsDecimal" DECIMAL(19,4);

-- CreateTable
CREATE TABLE "dividend_records" (
    "id" TEXT NOT NULL,
    "holdingId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "amountDecimal" DECIMAL(19,4) NOT NULL,
    "currencyCode" TEXT NOT NULL DEFAULT 'CAD',
    "journalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dividend_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "dividend_records_holdingId_date_idx" ON "dividend_records"("holdingId", "date");

-- CreateIndex
CREATE INDEX "holding_lots_holdingId_date_idx" ON "holding_lots"("holdingId", "date");

-- CreateIndex
CREATE INDEX "transaction_journals_householdId_merchantId_idx" ON "transaction_journals"("householdId", "merchantId");

-- AddForeignKey
ALTER TABLE "dividend_records" ADD CONSTRAINT "dividend_records_holdingId_fkey" FOREIGN KEY ("holdingId") REFERENCES "investment_holdings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
