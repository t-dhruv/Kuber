-- CreateTable
CREATE TABLE "transaction_groups" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "title" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transaction_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transaction_journals" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "transactionType" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "amountDecimal" DECIMAL(19,4) NOT NULL,
    "currencyCode" TEXT NOT NULL DEFAULT 'USD',
    "categoryId" TEXT,
    "notes" TEXT,
    "isPending" BOOLEAN NOT NULL DEFAULT false,
    "isReconciled" BOOLEAN NOT NULL DEFAULT false,
    "reconciledAt" TIMESTAMP(3),
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transaction_journals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transaction_entries" (
    "id" TEXT NOT NULL,
    "journalId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "amountDecimal" DECIMAL(19,4) NOT NULL,
    "currencyCode" TEXT NOT NULL DEFAULT 'USD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transaction_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transaction_journal_meta" (
    "id" TEXT NOT NULL,
    "journalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "transaction_journal_meta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_tags" (
    "journalId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "journal_tags_pkey" PRIMARY KEY ("journalId","tagId")
);

-- CreateIndex
CREATE INDEX "transaction_groups_householdId_createdAt_idx" ON "transaction_groups"("householdId", "createdAt");

-- CreateIndex
CREATE INDEX "transaction_journals_householdId_date_idx" ON "transaction_journals"("householdId", "date");

-- CreateIndex
CREATE INDEX "transaction_journals_householdId_transactionType_date_idx" ON "transaction_journals"("householdId", "transactionType", "date");

-- CreateIndex
CREATE INDEX "transaction_journals_groupId_idx" ON "transaction_journals"("groupId");

-- CreateIndex
CREATE INDEX "transaction_journals_categoryId_idx" ON "transaction_journals"("categoryId");

-- CreateIndex
CREATE INDEX "transaction_entries_journalId_idx" ON "transaction_entries"("journalId");

-- CreateIndex
CREATE INDEX "transaction_entries_accountId_idx" ON "transaction_entries"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "transaction_journal_meta_journalId_name_key" ON "transaction_journal_meta"("journalId", "name");

-- AddForeignKey
ALTER TABLE "transaction_groups" ADD CONSTRAINT "transaction_groups_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_journals" ADD CONSTRAINT "transaction_journals_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_journals" ADD CONSTRAINT "transaction_journals_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "transaction_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_journals" ADD CONSTRAINT "transaction_journals_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_entries" ADD CONSTRAINT "transaction_entries_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "transaction_journals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_entries" ADD CONSTRAINT "transaction_entries_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_journal_meta" ADD CONSTRAINT "transaction_journal_meta_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "transaction_journals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_tags" ADD CONSTRAINT "journal_tags_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "transaction_journals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_tags" ADD CONSTRAINT "journal_tags_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;
