-- REG-705: luoghi assegnati agli allievi (N:N). Additiva.
CREATE TABLE "CompanyMemberLocation" (
    "companyId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "locationId" UUID NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyMemberLocation_pkey" PRIMARY KEY ("companyId","userId","locationId")
);

CREATE INDEX "CompanyMemberLocation_locationId_idx" ON "CompanyMemberLocation"("locationId");

ALTER TABLE "CompanyMemberLocation" ADD CONSTRAINT "CompanyMemberLocation_companyId_userId_fkey" FOREIGN KEY ("companyId", "userId") REFERENCES "CompanyMember"("companyId", "userId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CompanyMemberLocation" ADD CONSTRAINT "CompanyMemberLocation_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "AutoscuolaLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: chi ha già un luogo di default (REG-392) parte con quel luogo.
-- Solo allievi, solo luoghi attivi della stessa autoscuola.
INSERT INTO "CompanyMemberLocation" ("companyId", "userId", "locationId")
SELECT m."companyId", m."userId", m."defaultLocationId"
FROM "CompanyMember" m
JOIN "AutoscuolaLocation" l
  ON l."id" = m."defaultLocationId"
 AND l."companyId" = m."companyId"
 AND l."archivedAt" IS NULL
WHERE m."autoscuolaRole" = 'STUDENT'
  AND m."defaultLocationId" IS NOT NULL
ON CONFLICT DO NOTHING;
