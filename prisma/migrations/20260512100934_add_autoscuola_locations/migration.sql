-- AlterTable
ALTER TABLE "AutoscuolaAppointment" ADD COLUMN     "locationId" UUID;

-- CreateTable
CREATE TABLE "AutoscuolaLocation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "companyId" UUID NOT NULL,
    "createdByUserId" UUID,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "placeId" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isPrecise" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(6),
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutoscuolaLocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AutoscuolaLocation_companyId_idx" ON "AutoscuolaLocation"("companyId");

-- CreateIndex
CREATE INDEX "AutoscuolaLocation_companyId_archivedAt_idx" ON "AutoscuolaLocation"("companyId", "archivedAt");

-- CreateIndex
CREATE INDEX "AutoscuolaAppointment_locationId_idx" ON "AutoscuolaAppointment"("locationId");

-- AddForeignKey
ALTER TABLE "AutoscuolaAppointment" ADD CONSTRAINT "AutoscuolaAppointment_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "AutoscuolaLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoscuolaLocation" ADD CONSTRAINT "AutoscuolaLocation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoscuolaLocation" ADD CONSTRAINT "AutoscuolaLocation_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Partial unique index: at most one isDefault=true per company
CREATE UNIQUE INDEX "AutoscuolaLocation_companyId_isDefault_key" ON "AutoscuolaLocation" ("companyId") WHERE "isDefault" = true;

-- Backfill: create one default placeholder location per existing company
INSERT INTO "AutoscuolaLocation" ("id", "companyId", "name", "isDefault", "isPrecise", "createdAt", "updatedAt")
SELECT gen_random_uuid(), "id", 'Sede dell''autoscuola', true, false, NOW(), NOW()
FROM "Company"
ON CONFLICT DO NOTHING;
