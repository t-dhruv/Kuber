-- AlterTable: replace logoUrl (text URL) with logoData (binary) + mimeType
ALTER TABLE "logo_cache" DROP COLUMN IF EXISTS "logoUrl";
ALTER TABLE "logo_cache" ADD COLUMN "logoData" BYTEA;
ALTER TABLE "logo_cache" ADD COLUMN "mimeType" TEXT;
