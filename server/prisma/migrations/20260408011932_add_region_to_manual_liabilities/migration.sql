-- AlterTable
ALTER TABLE "manual_liabilities" ADD COLUMN     "amortizationYears" INTEGER,
ADD COLUMN     "paymentFrequency" TEXT,
ADD COLUMN     "primeDiscount" DOUBLE PRECISION,
ADD COLUMN     "primeRate" DOUBLE PRECISION,
ADD COLUMN     "rateType" TEXT,
ADD COLUMN     "region" TEXT,
ADD COLUMN     "termEndDate" TIMESTAMP(3),
ADD COLUMN     "termStartDate" TIMESTAMP(3);
