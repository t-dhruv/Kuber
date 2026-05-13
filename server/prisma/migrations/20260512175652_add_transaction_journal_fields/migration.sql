-- AlterTable
ALTER TABLE "transaction_journals" ADD COLUMN "merchantId" TEXT,
ADD COLUMN "isSplit" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "aiSuggestedCategoryId" TEXT,
ADD COLUMN "aiSuggestedCategoryName" TEXT,
ADD COLUMN "aiSuggestionConfidence" DOUBLE PRECISION;

-- CreateIndex
CREATE INDEX "transaction_journals_merchantId_idx" ON "transaction_journals"("merchantId");

-- AddForeignKey
ALTER TABLE "transaction_journals" ADD CONSTRAINT "transaction_journals_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "merchants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_journals" ADD CONSTRAINT "transaction_journals_aiSuggestedCategoryId_fkey" FOREIGN KEY ("aiSuggestedCategoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
