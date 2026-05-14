-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "transaction_journals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_paid_periods" ADD CONSTRAINT "bill_paid_periods_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "transaction_journals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goal_allocations" ADD CONSTRAINT "goal_allocations_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "transaction_journals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_tags" ADD CONSTRAINT "transaction_tags_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "transaction_journals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_splits" ADD CONSTRAINT "transaction_splits_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "transaction_journals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_links" ADD CONSTRAINT "transaction_links_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "transaction_journals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_links" ADD CONSTRAINT "transaction_links_toId_fkey" FOREIGN KEY ("toId") REFERENCES "transaction_journals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
