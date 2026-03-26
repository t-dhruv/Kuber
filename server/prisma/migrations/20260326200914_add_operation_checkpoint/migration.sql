-- CreateTable
CREATE TABLE "operation_checkpoints" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "txnCount" INTEGER NOT NULL,
    "rolledBack" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "operation_checkpoints_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "operation_checkpoints_householdId_createdAt_idx" ON "operation_checkpoints"("householdId", "createdAt");

-- AddForeignKey
ALTER TABLE "operation_checkpoints" ADD CONSTRAINT "operation_checkpoints_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;
