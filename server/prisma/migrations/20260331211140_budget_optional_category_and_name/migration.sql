-- DropIndex
DROP INDEX "budgets_householdId_categoryId_key";

-- AlterTable
ALTER TABLE "budgets" ADD COLUMN     "name" TEXT,
ALTER COLUMN "categoryId" DROP NOT NULL;
