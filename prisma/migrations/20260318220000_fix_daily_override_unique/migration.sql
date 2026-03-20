-- Ensure indexes exist with correct short names (idempotent)
CREATE UNIQUE INDEX IF NOT EXISTS "AutoscuolaDailyAvailabilityOverride_company_owner_date_key"
  ON "AutoscuolaDailyAvailabilityOverride"("companyId", "ownerType", "ownerId", "date");

CREATE INDEX IF NOT EXISTS "AutoscuolaDailyAvailabilityOverride_company_owner_idx"
  ON "AutoscuolaDailyAvailabilityOverride"("companyId", "ownerType", "ownerId");
