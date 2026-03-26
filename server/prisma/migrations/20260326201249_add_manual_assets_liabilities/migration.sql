-- CreateTable
CREATE TABLE "manual_assets" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'other',
    "currentValue" DOUBLE PRECISION NOT NULL,
    "purchaseValue" DOUBLE PRECISION,
    "purchaseDate" TIMESTAMP(3),
    "notes" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "manual_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "manual_liabilities" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'other',
    "originalAmount" DOUBLE PRECISION NOT NULL,
    "currentBalance" DOUBLE PRECISION NOT NULL,
    "interestRate" DOUBLE PRECISION,
    "monthlyPayment" DOUBLE PRECISION,
    "maturityDate" TIMESTAMP(3),
    "notes" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "manual_liabilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "manual_asset_snapshots" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "manual_asset_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "manual_assets_householdId_idx" ON "manual_assets"("householdId");

-- CreateIndex
CREATE INDEX "manual_liabilities_householdId_idx" ON "manual_liabilities"("householdId");

-- CreateIndex
CREATE INDEX "manual_asset_snapshots_assetId_date_idx" ON "manual_asset_snapshots"("assetId", "date");

-- AddForeignKey
ALTER TABLE "manual_assets" ADD CONSTRAINT "manual_assets_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_liabilities" ADD CONSTRAINT "manual_liabilities_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_asset_snapshots" ADD CONSTRAINT "manual_asset_snapshots_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "manual_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
