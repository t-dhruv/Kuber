-- AlterTable
ALTER TABLE "transactions" ADD COLUMN "isTransfer" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "transactions" ADD COLUMN "transferId" TEXT;
