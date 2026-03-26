-- CreateTable
CREATE TABLE "import_history" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "bankSource" TEXT,
    "rowsTotal" INTEGER NOT NULL,
    "rowsImported" INTEGER NOT NULL,
    "rowsDuplicate" INTEGER NOT NULL DEFAULT 0,
    "rowsSkipped" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "import_history_householdId_createdAt_idx" ON "import_history"("householdId", "createdAt");

-- AddForeignKey
ALTER TABLE "import_history" ADD CONSTRAINT "import_history_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;
