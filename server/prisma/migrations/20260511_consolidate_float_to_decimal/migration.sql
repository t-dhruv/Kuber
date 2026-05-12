-- Consolidate Float fields to Decimal across all financial tables
-- This ensures consistency and prevents Float/Decimal drift

-- Transaction: amount Float -> use amountDecimal
-- Copy data from amount to amountDecimal if amountDecimal is null
UPDATE "transactions"
SET "amountDecimal" = CAST("amount" AS DECIMAL(19, 4))
WHERE "amountDecimal" IS NULL AND "amount" IS NOT NULL;

-- Account: balance Float -> use balanceDecimal
UPDATE "accounts"
SET "balanceDecimal" = CAST("balance" AS DECIMAL(19, 4))
WHERE "balanceDecimal" IS NULL AND "balance" IS NOT NULL;

-- Account: creditLimit Float -> use creditLimitDecimal
UPDATE "accounts"
SET "creditLimitDecimal" = CAST("creditLimit" AS DECIMAL(19, 4))
WHERE "creditLimitDecimal" IS NULL AND "creditLimit" IS NOT NULL;

-- Budget: amount Float -> use amountDecimal
UPDATE "budgets"
SET "amountDecimal" = CAST("amount" AS DECIMAL(19, 4))
WHERE "amountDecimal" IS NULL AND "amount" IS NOT NULL;

-- Goal: targetAmount, currentAmount, monthlyContribution
UPDATE "goals"
SET "targetAmountDecimal" = CAST("targetAmount" AS DECIMAL(19, 4))
WHERE "targetAmountDecimal" IS NULL AND "targetAmount" IS NOT NULL;

UPDATE "goals"
SET "currentAmountDecimal" = CAST("currentAmount" AS DECIMAL(19, 4))
WHERE "currentAmountDecimal" IS NULL AND "currentAmount" IS NOT NULL;

UPDATE "goals"
SET "monthlyContributionDecimal" = CAST("monthlyContribution" AS DECIMAL(19, 4))
WHERE "monthlyContributionDecimal" IS NULL AND "monthlyContribution" IS NOT NULL;

-- GoalAllocation: amount
UPDATE "goal_allocations"
SET "amountDecimal" = CAST("amount" AS DECIMAL(19, 4))
WHERE "amountDecimal" IS NULL AND "amount" IS NOT NULL;

-- ManualAsset: currentValue, purchaseValue
UPDATE "manual_assets"
SET "currentValueDecimal" = CAST("currentValue" AS DECIMAL(19, 4))
WHERE "currentValueDecimal" IS NULL AND "currentValue" IS NOT NULL;

UPDATE "manual_assets"
SET "purchaseValueDecimal" = CAST("purchaseValue" AS DECIMAL(19, 4))
WHERE "purchaseValueDecimal" IS NULL AND "purchaseValue" IS NOT NULL;

-- ManualAssetSnapshot: value
UPDATE "manual_asset_snapshots"
SET "valueDecimal" = CAST("value" AS DECIMAL(19, 4))
WHERE "valueDecimal" IS NULL AND "value" IS NOT NULL;

-- ManualLiability: originalAmount, currentBalance, interestRate, monthlyPayment
UPDATE "manual_liabilities"
SET "originalAmountDecimal" = CAST("originalAmount" AS DECIMAL(19, 4))
WHERE "originalAmountDecimal" IS NULL AND "originalAmount" IS NOT NULL;

UPDATE "manual_liabilities"
SET "currentBalanceDecimal" = CAST("currentBalance" AS DECIMAL(19, 4))
WHERE "currentBalanceDecimal" IS NULL AND "currentBalance" IS NOT NULL;

UPDATE "manual_liabilities"
SET "interestRateDecimal" = CAST("interestRate" AS DECIMAL(19, 4))
WHERE "interestRateDecimal" IS NULL AND "interestRate" IS NOT NULL;

UPDATE "manual_liabilities"
SET "monthlyPaymentDecimal" = CAST("monthlyPayment" AS DECIMAL(19, 4))
WHERE "monthlyPaymentDecimal" IS NULL AND "monthlyPayment" IS NOT NULL;

-- InvestmentHolding: shares, costBasis, currentPrice
UPDATE "investment_holdings"
SET "sharesDecimal" = CAST("shares" AS DECIMAL(19, 4))
WHERE "sharesDecimal" IS NULL AND "shares" IS NOT NULL;

UPDATE "investment_holdings"
SET "costBasisDecimal" = CAST("costBasis" AS DECIMAL(19, 4))
WHERE "costBasisDecimal" IS NULL AND "costBasis" IS NOT NULL;

UPDATE "investment_holdings"
SET "currentPriceDecimal" = CAST("currentPrice" AS DECIMAL(19, 4))
WHERE "currentPriceDecimal" IS NULL AND "currentPrice" IS NOT NULL;

-- HoldingLot: shares, pricePerShare
UPDATE "holding_lots"
SET "sharesDecimal" = CAST("shares" AS DECIMAL(19, 4))
WHERE "sharesDecimal" IS NULL AND "shares" IS NOT NULL;

UPDATE "holding_lots"
SET "pricePerShareDecimal" = CAST("pricePerShare" AS DECIMAL(19, 4))
WHERE "pricePerShareDecimal" IS NULL AND "pricePerShare" IS NOT NULL;

-- RecurringInvestment: amount
UPDATE "recurring_investments"
SET "amountDecimal" = CAST("amount" AS DECIMAL(19, 4))
WHERE "amountDecimal" IS NULL AND "amount" IS NOT NULL;

-- RecurringItem: amount
UPDATE "recurring_items"
SET "amountDecimal" = CAST("amount" AS DECIMAL(19, 4))
WHERE "amountDecimal" IS NULL AND "amount" IS NOT NULL;

-- AccountBalanceSnapshot: balance
UPDATE "account_balance_snapshots"
SET "balanceDecimal" = CAST("balance" AS DECIMAL(19, 4))
WHERE "balanceDecimal" IS NULL AND "balance" IS NOT NULL;

-- NetWorthSnapshot: assets, liabilities, netWorth
UPDATE "net_worth_snapshots"
SET "assetsDecimal" = CAST("assets" AS DECIMAL(19, 4))
WHERE "assetsDecimal" IS NULL AND "assets" IS NOT NULL;

UPDATE "net_worth_snapshots"
SET "liabilitiesDecimal" = CAST("liabilities" AS DECIMAL(19, 4))
WHERE "liabilitiesDecimal" IS NULL AND "liabilities" IS NOT NULL;

UPDATE "net_worth_snapshots"
SET "netWorthDecimal" = CAST("netWorth" AS DECIMAL(19, 4))
WHERE "netWorthDecimal" IS NULL AND "netWorth" IS NOT NULL;

-- Note: Float columns are retained for now (for gradual migration).
-- App code should exclusively use Decimal fields going forward.
-- Float columns can be dropped in a future migration after verification.
