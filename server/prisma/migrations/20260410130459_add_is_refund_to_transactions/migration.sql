-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "isRefund" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "webhooks" ALTER COLUMN "events" DROP DEFAULT;
