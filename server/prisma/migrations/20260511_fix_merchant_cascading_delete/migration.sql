-- Change Merchant onDelete from Cascade to SetNull
-- This preserves transaction history when merchants are deleted
-- First drop the old FK constraint
ALTER TABLE "transactions" DROP CONSTRAINT IF EXISTS "transactions_merchantId_fkey";

-- Add new FK with SetNull
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_merchantId_fkey"
  FOREIGN KEY ("merchantId") REFERENCES "merchants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
