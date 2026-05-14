-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "aiSuggestedCategoryId" TEXT,
ADD COLUMN     "aiSuggestedCategoryName" TEXT,
ADD COLUMN     "aiSuggestionConfidence" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "category_learning_examples" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "descriptionPattern" TEXT NOT NULL,
    "correctCategoryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "category_learning_examples_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "category_learning_examples_householdId_idx" ON "category_learning_examples"("householdId");

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_aiSuggestedCategoryId_fkey" FOREIGN KEY ("aiSuggestedCategoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category_learning_examples" ADD CONSTRAINT "category_learning_examples_correctCategoryId_fkey" FOREIGN KEY ("correctCategoryId") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_groups" ADD CONSTRAINT "transfer_groups_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;
