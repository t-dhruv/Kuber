-- CreateTable
CREATE TABLE "reporting_snapshots" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "snapshotDate" DATE NOT NULL,
    "periodKey" TEXT NOT NULL,
    "subjectId" TEXT,
    "payload" JSONB NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reporting_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reporting_rollups" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "subjectId" TEXT,
    "payload" JSONB NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reporting_rollups_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "reporting_snapshots_householdId_kind_snapshotDate_subjectId_key" ON "reporting_snapshots"("householdId", "kind", "snapshotDate", "subjectId");

-- CreateIndex
CREATE INDEX "reporting_snapshots_householdId_kind_snapshotDate_idx" ON "reporting_snapshots"("householdId", "kind", "snapshotDate");

-- CreateIndex
CREATE UNIQUE INDEX "reporting_rollups_householdId_kind_periodKey_subjectId_key" ON "reporting_rollups"("householdId", "kind", "periodKey", "subjectId");

-- CreateIndex
CREATE INDEX "reporting_rollups_householdId_kind_periodKey_idx" ON "reporting_rollups"("householdId", "kind", "periodKey");

-- AddForeignKey
ALTER TABLE "reporting_snapshots" ADD CONSTRAINT "reporting_snapshots_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reporting_rollups" ADD CONSTRAINT "reporting_rollups_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;
