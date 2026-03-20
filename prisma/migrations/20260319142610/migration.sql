-- AlterTable
ALTER TABLE "AutoscuolaInstructorBlock" ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMP(3);

-- RenameIndex
ALTER INDEX "AutoscuolaDailyAvailabilityOverride_owner_date_idx" RENAME TO "AutoscuolaDailyAvailabilityOverride_ownerId_date_idx";
