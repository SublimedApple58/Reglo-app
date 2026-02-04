-- CreateTable
CREATE TABLE "AutoscuolaInstructor" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "companyId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutoscuolaInstructor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutoscuolaVehicle" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "companyId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "plate" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutoscuolaVehicle_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "AutoscuolaAppointment" DROP COLUMN "instructorName",
ADD COLUMN     "instructorId" UUID,
ADD COLUMN     "vehicleId" UUID;

-- CreateIndex
CREATE INDEX "AutoscuolaInstructor_companyId_idx" ON "AutoscuolaInstructor"("companyId");

-- CreateIndex
CREATE INDEX "AutoscuolaVehicle_companyId_idx" ON "AutoscuolaVehicle"("companyId");

-- CreateIndex
CREATE INDEX "AutoscuolaAppointment_instructorId_idx" ON "AutoscuolaAppointment"("instructorId");

-- CreateIndex
CREATE INDEX "AutoscuolaAppointment_vehicleId_idx" ON "AutoscuolaAppointment"("vehicleId");

-- AddForeignKey
ALTER TABLE "AutoscuolaInstructor" ADD CONSTRAINT "AutoscuolaInstructor_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoscuolaVehicle" ADD CONSTRAINT "AutoscuolaVehicle_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoscuolaAppointment" ADD CONSTRAINT "AutoscuolaAppointment_instructorId_fkey" FOREIGN KEY ("instructorId") REFERENCES "AutoscuolaInstructor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoscuolaAppointment" ADD CONSTRAINT "AutoscuolaAppointment_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "AutoscuolaVehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;
