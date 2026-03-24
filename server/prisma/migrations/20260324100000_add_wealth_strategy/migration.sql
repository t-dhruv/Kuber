-- Add bucketType to categories
ALTER TABLE "categories" ADD COLUMN "bucketType" TEXT NOT NULL DEFAULT 'uncategorized';

-- Create wealth_ai_cache table
CREATE TABLE "wealth_ai_cache" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "analysis" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wealth_ai_cache_pkey" PRIMARY KEY ("id")
);

-- Create unique index on householdId
CREATE UNIQUE INDEX "wealth_ai_cache_householdId_key" ON "wealth_ai_cache"("householdId");

-- Add foreign key constraint
ALTER TABLE "wealth_ai_cache" ADD CONSTRAINT "wealth_ai_cache_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
