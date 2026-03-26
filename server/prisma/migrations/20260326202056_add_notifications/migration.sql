/*
  Warnings:

  - You are about to drop the column `isRead` on the `notifications` table. All the data in the column will be lost.
  - You are about to drop the column `metadata` on the `notifications` table. All the data in the column will be lost.
  - Added the required column `householdId` to the `notifications` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_userId_fkey";

-- AlterTable
ALTER TABLE "notifications" DROP COLUMN "isRead",
DROP COLUMN "metadata",
ADD COLUMN     "householdId" TEXT NOT NULL,
ADD COLUMN     "linkedEntityId" TEXT,
ADD COLUMN     "linkedEntityType" TEXT,
ADD COLUMN     "read" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "severity" TEXT NOT NULL DEFAULT 'info',
ALTER COLUMN "userId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "notifications_householdId_read_createdAt_idx" ON "notifications"("householdId", "read", "createdAt");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;
