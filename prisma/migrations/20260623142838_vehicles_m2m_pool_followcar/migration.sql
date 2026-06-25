-- DropIndex
DROP INDEX "AutoscuolaVehicle_assignedInstructorId_key";

-- CreateTable
CREATE TABLE "AutoscuolaVehiclePoolMember" (
    "vehicleId" UUID NOT NULL,
    "instructorId" UUID NOT NULL,

    CONSTRAINT "AutoscuolaVehiclePoolMember_pkey" PRIMARY KEY ("vehicleId","instructorId")
);

-- CreateTable
CREATE TABLE "AutoscuolaInstructorPreferredVehicle" (
    "instructorId" UUID NOT NULL,
    "licenseCategory" TEXT NOT NULL,
    "vehicleId" UUID NOT NULL,

    CONSTRAINT "AutoscuolaInstructorPreferredVehicle_pkey" PRIMARY KEY ("instructorId","licenseCategory")
);

-- CreateTable
CREATE TABLE "AutoscuolaAppointmentVehicle" (
    "appointmentId" UUID NOT NULL,
    "vehicleId" UUID NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'primary',

    CONSTRAINT "AutoscuolaAppointmentVehicle_pkey" PRIMARY KEY ("appointmentId","vehicleId")
);

-- CreateIndex
CREATE INDEX "AutoscuolaVehiclePoolMember_instructorId_idx" ON "AutoscuolaVehiclePoolMember"("instructorId");

-- CreateIndex
CREATE INDEX "AutoscuolaInstructorPreferredVehicle_vehicleId_idx" ON "AutoscuolaInstructorPreferredVehicle"("vehicleId");

-- CreateIndex
CREATE INDEX "AutoscuolaAppointmentVehicle_vehicleId_idx" ON "AutoscuolaAppointmentVehicle"("vehicleId");

-- AddForeignKey
ALTER TABLE "AutoscuolaVehiclePoolMember" ADD CONSTRAINT "AutoscuolaVehiclePoolMember_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "AutoscuolaVehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoscuolaVehiclePoolMember" ADD CONSTRAINT "AutoscuolaVehiclePoolMember_instructorId_fkey" FOREIGN KEY ("instructorId") REFERENCES "AutoscuolaInstructor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoscuolaInstructorPreferredVehicle" ADD CONSTRAINT "AutoscuolaInstructorPreferredVehicle_instructorId_fkey" FOREIGN KEY ("instructorId") REFERENCES "AutoscuolaInstructor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoscuolaInstructorPreferredVehicle" ADD CONSTRAINT "AutoscuolaInstructorPreferredVehicle_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "AutoscuolaVehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoscuolaAppointmentVehicle" ADD CONSTRAINT "AutoscuolaAppointmentVehicle_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "AutoscuolaAppointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoscuolaAppointmentVehicle" ADD CONSTRAINT "AutoscuolaAppointmentVehicle_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "AutoscuolaVehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
