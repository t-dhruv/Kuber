/*
  Warnings:

  - Added the required column `updatedAt` to the `category_learning_examples` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "category_learning_examples" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- CreateIndex
CREATE INDEX "transactions_householdId_needsReview_idx" ON "transactions"("householdId", "needsReview");

-- AddForeignKey
ALTER TABLE "category_learning_examples" ADD CONSTRAINT "category_learning_examples_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;
