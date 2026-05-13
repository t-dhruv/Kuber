-- Add soft delete field to TransactionJournal
ALTER TABLE "transaction_journals" ADD COLUMN "isDeleted" BOOLEAN NOT NULL DEFAULT false;

-- Create index for filtering out deleted journals
CREATE INDEX "transaction_journals_householdId_isDeleted_date_idx" ON "transaction_journals"("householdId", "isDeleted", "date");
