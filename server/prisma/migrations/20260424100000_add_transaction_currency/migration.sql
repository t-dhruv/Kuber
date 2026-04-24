-- Rename existing currency column to currencyCode
ALTER TABLE "transactions" RENAME COLUMN "currency" TO "currencyCode";
-- Update default to CAD
ALTER TABLE "transactions" ALTER COLUMN "currencyCode" SET DEFAULT 'CAD';
-- Add new FX columns
ALTER TABLE "transactions" ADD COLUMN "originalAmountFloat" DOUBLE PRECISION;
ALTER TABLE "transactions" ADD COLUMN "fxRate"         DOUBLE PRECISION;