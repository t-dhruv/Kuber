UPDATE "categories"
SET "bucketType" = 'wants'
WHERE "bucketType" = 'uncategorized';

ALTER TABLE "categories"
ALTER COLUMN "bucketType" SET DEFAULT 'wants';
