-- AlterTable
ALTER TABLE "AutoscuolaAppointment" ADD COLUMN     "rating" INTEGER,
ADD COLUMN     "types" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Backfill: copy existing type into types array
UPDATE "AutoscuolaAppointment"
SET "types" = ARRAY["type"]
WHERE "type" IS NOT NULL AND "type" != '' AND (array_length("types", 1) IS NULL);
