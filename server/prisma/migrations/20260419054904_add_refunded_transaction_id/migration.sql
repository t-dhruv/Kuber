-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "refundedTransactionId" TEXT;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_refundedTransactionId_fkey" FOREIGN KEY ("refundedTransactionId") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
