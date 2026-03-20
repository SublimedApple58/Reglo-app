-- Add ranges column to AutoscuolaWeeklyAvailability
ALTER TABLE "AutoscuolaWeeklyAvailability" ADD COLUMN IF NOT EXISTS "ranges" JSON;

-- Backfill ranges from existing flat columns
UPDATE "AutoscuolaWeeklyAvailability"
SET "ranges" = CASE
  WHEN "startMinutes2" IS NOT NULL AND "endMinutes2" IS NOT NULL
  THEN json_build_array(
    json_build_object('startMinutes', "startMinutes", 'endMinutes', "endMinutes"),
    json_build_object('startMinutes', "startMinutes2", 'endMinutes', "endMinutes2")
  )
  ELSE json_build_array(
    json_build_object('startMinutes', "startMinutes", 'endMinutes', "endMinutes")
  )
END
WHERE "ranges" IS NULL;

-- CreateTable (if not exists)
CREATE TABLE IF NOT EXISTS "AutoscuolaDailyAvailabilityOverride" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "companyId" UUID NOT NULL,
    "ownerType" TEXT NOT NULL,
    "ownerId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "ranges" JSON NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AutoscuolaDailyAvailabilityOverride_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AutoscuolaDailyAvailabilityOverride_company_owner_idx" ON "AutoscuolaDailyAvailabilityOverride"("companyId", "ownerType", "ownerId");
CREATE INDEX IF NOT EXISTS "AutoscuolaDailyAvailabilityOverride_owner_date_idx" ON "AutoscuolaDailyAvailabilityOverride"("ownerId", "date");
CREATE UNIQUE INDEX IF NOT EXISTS "AutoscuolaDailyAvailabilityOverride_company_owner_date_key" ON "AutoscuolaDailyAvailabilityOverride"("companyId", "ownerType", "ownerId", "date");

DO $$ BEGIN
  ALTER TABLE "AutoscuolaDailyAvailabilityOverride" ADD CONSTRAINT "AutoscuolaDailyAvailabilityOverride_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
