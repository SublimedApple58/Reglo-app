-- AlterTable
ALTER TABLE "AutoscuolaVehicle" ADD COLUMN     "licenseCategory" TEXT NOT NULL DEFAULT 'B',
ADD COLUMN     "transmission" TEXT NOT NULL DEFAULT 'manual';

-- AlterTable
ALTER TABLE "CompanyMember" ADD COLUMN     "licenseCategory" TEXT,
ADD COLUMN     "transmission" TEXT;

-- Backfill: existing students all pursue B manual today (per product decision).
-- Vehicles already get B/manual from the column default above; this is explicit.
UPDATE "AutoscuolaVehicle" SET "licenseCategory" = 'B', "transmission" = 'manual'
WHERE "licenseCategory" IS NULL OR "transmission" IS NULL;

UPDATE "CompanyMember" SET "licenseCategory" = 'B', "transmission" = 'manual'
WHERE "autoscuolaRole" = 'STUDENT';
