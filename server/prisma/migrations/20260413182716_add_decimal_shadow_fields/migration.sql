-- AlterTable
ALTER TABLE "account_balance_snapshots" ADD COLUMN     "balanceDecimal" DECIMAL(19,4);

-- AlterTable
ALTER TABLE "accounts" ADD COLUMN     "balanceDecimal" DECIMAL(19,4),
ADD COLUMN     "creditLimitDecimal" DECIMAL(19,4),
ADD COLUMN     "providerConnectionId" TEXT;

-- AlterTable
ALTER TABLE "budgets" ADD COLUMN     "amountDecimal" DECIMAL(19,4);

-- AlterTable
ALTER TABLE "goal_allocations" ADD COLUMN     "amountDecimal" DECIMAL(19,4);

-- AlterTable
ALTER TABLE "goals" ADD COLUMN     "currentAmountDecimal" DECIMAL(19,4),
ADD COLUMN     "monthlyContributionDecimal" DECIMAL(19,4),
ADD COLUMN     "targetAmountDecimal" DECIMAL(19,4);

-- AlterTable
ALTER TABLE "holding_lots" ADD COLUMN     "pricePerShareDecimal" DECIMAL(19,4),
ADD COLUMN     "sharesDecimal" DECIMAL(19,4);

-- AlterTable
ALTER TABLE "investment_holdings" ADD COLUMN     "costBasisDecimal" DECIMAL(19,4),
ADD COLUMN     "currentPriceDecimal" DECIMAL(19,4),
ADD COLUMN     "sharesDecimal" DECIMAL(19,4);

-- AlterTable
ALTER TABLE "manual_asset_snapshots" ADD COLUMN     "valueDecimal" DECIMAL(19,4);

-- AlterTable
ALTER TABLE "manual_assets" ADD COLUMN     "currentValueDecimal" DECIMAL(19,4),
ADD COLUMN     "purchaseValueDecimal" DECIMAL(19,4);

-- AlterTable
ALTER TABLE "manual_liabilities" ADD COLUMN     "currentBalanceDecimal" DECIMAL(19,4),
ADD COLUMN     "interestRateDecimal" DECIMAL(19,4),
ADD COLUMN     "monthlyPaymentDecimal" DECIMAL(19,4),
ADD COLUMN     "originalAmountDecimal" DECIMAL(19,4);

-- AlterTable
ALTER TABLE "net_worth_snapshots" ADD COLUMN     "assetsDecimal" DECIMAL(19,4),
ADD COLUMN     "liabilitiesDecimal" DECIMAL(19,4),
ADD COLUMN     "netWorthDecimal" DECIMAL(19,4);

-- AlterTable
ALTER TABLE "recurring_investments" ADD COLUMN     "amountDecimal" DECIMAL(19,4);

-- AlterTable
ALTER TABLE "recurring_items" ADD COLUMN     "amountDecimal" DECIMAL(19,4);

-- AlterTable
ALTER TABLE "tax_accounts" ADD COLUMN     "annualRoomCadDecimal" DECIMAL(19,4),
ADD COLUMN     "contributionsYtdDecimal" DECIMAL(19,4),
ADD COLUMN     "totalRoomEverDecimal" DECIMAL(19,4),
ADD COLUMN     "withdrawalsYtdDecimal" DECIMAL(19,4);

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "amountDecimal" DECIMAL(19,4),
ADD COLUMN     "exchangeRate" DECIMAL(19,6),
ADD COLUMN     "transferGroupId" TEXT;

-- CreateTable
CREATE TABLE "transaction_splits" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "amountDecimal" DECIMAL(19,4) NOT NULL,
    "categoryId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transaction_splits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_connections" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'good',
    "lastSyncAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provider_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transfer_groups" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'matched',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transfer_groups_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "transaction_splits_transactionId_idx" ON "transaction_splits"("transactionId");

-- CreateIndex
CREATE INDEX "transaction_splits_categoryId_idx" ON "transaction_splits"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "provider_connections_itemId_key" ON "provider_connections"("itemId");

-- CreateIndex
CREATE INDEX "transactions_householdId_categoryId_date_idx" ON "transactions"("householdId", "categoryId", "date");

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_providerConnectionId_fkey" FOREIGN KEY ("providerConnectionId") REFERENCES "provider_connections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_transferGroupId_fkey" FOREIGN KEY ("transferGroupId") REFERENCES "transfer_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_splits" ADD CONSTRAINT "transaction_splits_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_splits" ADD CONSTRAINT "transaction_splits_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_connections" ADD CONSTRAINT "provider_connections_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;
