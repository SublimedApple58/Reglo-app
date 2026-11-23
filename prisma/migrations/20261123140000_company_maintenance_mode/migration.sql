-- CreateEnum
CREATE TYPE "CompanyMaintenanceScope" AS ENUM ('OWNER_ONLY', 'EVERYONE');

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "maintenanceScope" "CompanyMaintenanceScope",
ADD COLUMN     "maintenanceSince" TIMESTAMP(6);

-- CreateTable
CREATE TABLE "CompanyMaintenanceEvent" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "companyId" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "scope" "CompanyMaintenanceScope",
    "previousScope" "CompanyMaintenanceScope",
    "actorKind" TEXT NOT NULL,
    "actorUserId" UUID,
    "actorBackofficeAdminId" UUID,
    "actorLabel" TEXT NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyMaintenanceEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompanyMaintenanceEvent_companyId_createdAt_idx" ON "CompanyMaintenanceEvent"("companyId", "createdAt");

-- AddForeignKey
ALTER TABLE "CompanyMaintenanceEvent" ADD CONSTRAINT "CompanyMaintenanceEvent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

