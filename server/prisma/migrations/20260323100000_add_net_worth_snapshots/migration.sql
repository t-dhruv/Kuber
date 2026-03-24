CREATE TABLE "net_worth_snapshots" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "assets" DOUBLE PRECISION NOT NULL,
    "liabilities" DOUBLE PRECISION NOT NULL,
    "netWorth" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "net_worth_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "net_worth_snapshots_householdId_date_key" ON "net_worth_snapshots"("householdId", "date");
CREATE INDEX "net_worth_snapshots_householdId_date_idx" ON "net_worth_snapshots"("householdId", "date");

ALTER TABLE "net_worth_snapshots" ADD CONSTRAINT "net_worth_snapshots_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;
