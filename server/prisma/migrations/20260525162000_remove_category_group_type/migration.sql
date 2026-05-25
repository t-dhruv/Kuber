UPDATE "categories"
SET "type" = CASE
  WHEN lower("type") IN ('income', 'expense', 'transfer') THEN lower("type")
  ELSE 'expense'
END;

UPDATE "categories"
SET "type" = 'transfer'
WHERE "name" IN (
  'Emergency Fund',
  'RRSP / 401(k) Contribution',
  'RRSP Contribution',
  'TFSA / Roth IRA',
  'TFSA Contribution',
  'RESP / Education Savings',
  'RESP Contribution',
  'General Investments',
  'Investment Purchase',
  'Mortgage Payment',
  'Mortgage Principal Payment',
  'Loan / Debt Repayment',
  'Loan/Debt Repayment',
  'Credit Card Payment',
  'Auto Loan Principal',
  'Student Loan Principal',
  'Internal Transfer',
  'Balance Adjustment',
  'Cash Deposit'
);

UPDATE "categories"
SET "type" = 'income'
WHERE "name" IN ('e-Transfer Received', 'Interac e-Transfer Received');

UPDATE "categories"
SET "type" = 'expense'
WHERE "name" IN ('ABM Cash', 'e-Transfer Sent', 'Interac e-Transfer Sent');

ALTER TABLE "categories" ALTER COLUMN "type" SET NOT NULL;
ALTER TABLE "categories" DROP CONSTRAINT IF EXISTS "categories_type_check";
ALTER TABLE "categories"
  ADD CONSTRAINT "categories_type_check"
  CHECK ("type" IN ('income', 'expense', 'transfer'));

ALTER TABLE "category_groups" DROP COLUMN IF EXISTS "type";
