/*
  Warnings:

  - You are about to drop the column `emoji` on the `categories` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "categories" DROP COLUMN "emoji",
ADD COLUMN     "icon" TEXT;
