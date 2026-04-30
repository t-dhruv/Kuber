-- AlterTable
ALTER TABLE "accounts" ADD COLUMN     "excludeFromReports" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "categories" ADD COLUMN     "excludeFromReports" BOOLEAN NOT NULL DEFAULT false;
