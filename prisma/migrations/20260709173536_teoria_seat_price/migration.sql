/*
  Warnings:

  - You are about to drop the column `teoriaPriceCents` on the `CompanyPlan` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "CompanyPlan" DROP COLUMN "teoriaPriceCents",
ADD COLUMN     "teoriaSeatPriceCents" INTEGER NOT NULL DEFAULT 0;
