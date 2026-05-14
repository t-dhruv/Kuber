ALTER TABLE "recurring_items" ADD COLUMN "lastProcessedAt" TIMESTAMP(3);
ALTER TABLE "transactions" ADD COLUMN "recurringItemId" TEXT;
