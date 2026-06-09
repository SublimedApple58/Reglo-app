-- AlterTable
ALTER TABLE "AutoscuolaVehicle" ADD COLUMN     "assignedInstructorId" UUID,
ADD COLUMN     "followsInstructorAvailability" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX "AutoscuolaVehicle_companyId_assignedInstructorId_idx" ON "AutoscuolaVehicle"("companyId", "assignedInstructorId");

-- CreateIndex
CREATE UNIQUE INDEX "AutoscuolaVehicle_assignedInstructorId_key" ON "AutoscuolaVehicle"("assignedInstructorId");

-- AddForeignKey
ALTER TABLE "AutoscuolaVehicle" ADD CONSTRAINT "AutoscuolaVehicle_assignedInstructorId_fkey" FOREIGN KEY ("assignedInstructorId") REFERENCES "AutoscuolaInstructor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
