-- Drop the non-unique index that was created with truncated name
DROP INDEX IF EXISTS "AutoscuolaDailyAvailabilityOverride_companyId_ownerType_ownerId";

-- Recreate as proper unique index including date column
CREATE UNIQUE INDEX IF NOT EXISTS "AutoscuolaDailyAvailabilityOverride_company_owner_date_key"
  ON "AutoscuolaDailyAvailabilityOverride"("companyId", "ownerType", "ownerId", "date");

-- Also recreate the non-unique composite index (for queries without date)
CREATE INDEX IF NOT EXISTS "AutoscuolaDailyAvailabilityOverride_company_owner_idx"
  ON "AutoscuolaDailyAvailabilityOverride"("companyId", "ownerType", "ownerId");
