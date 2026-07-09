/*
  Warnings:

  - You are about to drop the column `teoriaEnabled` on the `CompanyPlan` table. All the data in the column will be lost.
  - You are about to drop the column `teoriaSeatPriceCents` on the `CompanyPlan` table. All the data in the column will be lost.
  - You are about to drop the column `teoriaSeats` on the `CompanyPlan` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "CompanyPlan" DROP COLUMN "teoriaEnabled",
DROP COLUMN "teoriaSeatPriceCents",
DROP COLUMN "teoriaSeats";

-- CreateTable
CREATE TABLE "CompanyLicensePurchase" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "companyId" UUID NOT NULL,
    "seats" INTEGER NOT NULL,
    "seatPriceCents" INTEGER NOT NULL,
    "purchasedAt" TIMESTAMP(6) NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyLicensePurchase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompanyLicensePurchase_companyId_purchasedAt_idx" ON "CompanyLicensePurchase"("companyId", "purchasedAt");

-- AddForeignKey
ALTER TABLE "CompanyLicensePurchase" ADD CONSTRAINT "CompanyLicensePurchase_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
