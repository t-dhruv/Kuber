CREATE TABLE "bills" (
  "id" TEXT NOT NULL,
  "householdId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "amountMin" DECIMAL(19,4),
  "amountMax" DECIMAL(19,4),
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "startDate" TIMESTAMP(3) NOT NULL,
  "endDate" TIMESTAMP(3),
  "repeatFreq" TEXT NOT NULL,
  "skipPeriods" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "notes" TEXT,
  "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "bills_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "bills_householdId_idx" ON "bills"("householdId");

CREATE TABLE "bill_paid_periods" (
  "id" TEXT NOT NULL,
  "billId" TEXT NOT NULL,
  "transactionId" TEXT NOT NULL,
  "periodKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "bill_paid_periods_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "bill_paid_periods_billId_periodKey_key" UNIQUE ("billId", "periodKey")
);

ALTER TABLE "bills" ADD CONSTRAINT "bills_householdId_fkey"
  FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "bill_paid_periods" ADD CONSTRAINT "bill_paid_periods_billId_fkey"
  FOREIGN KEY ("billId") REFERENCES "bills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "bill_paid_periods" ADD CONSTRAINT "bill_paid_periods_transactionId_fkey"
  FOREIGN KEY ("transactionId") REFERENCES "transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
