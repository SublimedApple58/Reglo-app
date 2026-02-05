-- CreateTable
CREATE TABLE "AutoscuolaWeeklyAvailability" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "companyId" UUID NOT NULL,
    "ownerType" TEXT NOT NULL,
    "ownerId" UUID NOT NULL,
    "daysOfWeek" INTEGER[] NOT NULL,
    "startMinutes" INTEGER NOT NULL,
    "endMinutes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "AutoscuolaWeeklyAvailability_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AutoscuolaWeeklyAvailability_companyId_idx" ON "AutoscuolaWeeklyAvailability"("companyId");

-- CreateIndex
CREATE INDEX "AutoscuolaWeeklyAvailability_ownerType_ownerId_idx" ON "AutoscuolaWeeklyAvailability"("ownerType", "ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "AutoscuolaWeeklyAvailability_companyId_ownerType_ownerId_key" ON "AutoscuolaWeeklyAvailability"("companyId", "ownerType", "ownerId");

-- AddForeignKey
ALTER TABLE "AutoscuolaWeeklyAvailability" ADD CONSTRAINT "AutoscuolaWeeklyAvailability_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
