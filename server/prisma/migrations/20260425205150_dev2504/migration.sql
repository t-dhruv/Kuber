/*
  Warnings:

  - You are about to drop the column `exchangeRate` on the `transactions` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "available_budgets" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "bills" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "object_groups" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "rule_groups" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "transactions" DROP COLUMN "exchangeRate";
