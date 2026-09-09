-- AlterTable
ALTER TABLE "ConsorzioGuideRequest" ADD COLUMN     "proposedAt" TIMESTAMP(6),
ADD COLUMN     "proposedByUserId" UUID,
ADD COLUMN     "proposedDurationMinutes" INTEGER,
ADD COLUMN     "proposedStartsAt" TIMESTAMP(6),
ADD COLUMN     "proposedVehicleId" UUID;

-- AddForeignKey
ALTER TABLE "ConsorzioGuideRequest" ADD CONSTRAINT "ConsorzioGuideRequest_proposedVehicleId_fkey" FOREIGN KEY ("proposedVehicleId") REFERENCES "AutoscuolaVehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

