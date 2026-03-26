-- CreateTable
CREATE TABLE "tax_accounts" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "linkedAccountId" TEXT,
    "memberName" TEXT,
    "birthYear" INTEGER,
    "annualRoomCad" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalRoomEver" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "contributionsYtd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "withdrawalsYtd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tax_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tax_accounts_householdId_idx" ON "tax_accounts"("householdId");

-- AddForeignKey
ALTER TABLE "tax_accounts" ADD CONSTRAINT "tax_accounts_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_accounts" ADD CONSTRAINT "tax_accounts_linkedAccountId_fkey" FOREIGN KEY ("linkedAccountId") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
