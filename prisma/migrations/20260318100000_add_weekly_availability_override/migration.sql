-- CreateTable
CREATE TABLE "AutoscuolaWeeklyAvailabilityOverride" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "companyId" UUID NOT NULL,
    "ownerType" TEXT NOT NULL,
    "ownerId" UUID NOT NULL,
    "weekStart" DATE NOT NULL,
    "daysOfWeek" INTEGER[],
    "startMinutes" INTEGER NOT NULL,
    "endMinutes" INTEGER NOT NULL,
    "startMinutes2" INTEGER,
    "endMinutes2" INTEGER,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutoscuolaWeeklyAvailabilityOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AutoscuolaWeeklyAvailabilityOverride_companyId_ownerType_own_idx" ON "AutoscuolaWeeklyAvailabilityOverride"("companyId", "ownerType", "ownerId");

-- CreateIndex
CREATE INDEX "AutoscuolaWeeklyAvailabilityOverride_ownerId_weekStart_idx" ON "AutoscuolaWeeklyAvailabilityOverride"("ownerId", "weekStart");

-- CreateIndex
CREATE UNIQUE INDEX "AutoscuolaWeeklyAvailabilityOverride_companyId_ownerType_own_key" ON "AutoscuolaWeeklyAvailabilityOverride"("companyId", "ownerType", "ownerId", "weekStart");

-- AddForeignKey
ALTER TABLE "AutoscuolaWeeklyAvailabilityOverride" ADD CONSTRAINT "AutoscuolaWeeklyAvailabilityOverride_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
