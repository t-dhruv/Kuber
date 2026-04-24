-- Rename existing currency column to currencyCode
ALTER TABLE "transactions" RENAME COLUMN "currency" TO "currencyCode";
-- Update default to CAD
ALTER TABLE "transactions" ALTER COLUMN "currencyCode" SET DEFAULT 'CAD';
-- Add new FX columns
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "originalAmount" DECIMAL(19,4);
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "fxRate"         DECIMAL(19,6);