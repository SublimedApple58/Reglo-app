-- AlterTable
ALTER TABLE "AutoscuolaGroupLesson" ADD COLUMN     "followVehicleId" UUID,
ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'standard';

-- CreateTable
CREATE TABLE "AutoscuolaGroupLessonVehicle" (
    "groupLessonId" UUID NOT NULL,
    "vehicleId" UUID NOT NULL,

    CONSTRAINT "AutoscuolaGroupLessonVehicle_pkey" PRIMARY KEY ("groupLessonId","vehicleId")
);

-- CreateIndex
CREATE INDEX "AutoscuolaGroupLessonVehicle_vehicleId_idx" ON "AutoscuolaGroupLessonVehicle"("vehicleId");

-- CreateIndex
CREATE INDEX "AutoscuolaGroupLesson_followVehicleId_idx" ON "AutoscuolaGroupLesson"("followVehicleId");

-- AddForeignKey
ALTER TABLE "AutoscuolaGroupLesson" ADD CONSTRAINT "AutoscuolaGroupLesson_followVehicleId_fkey" FOREIGN KEY ("followVehicleId") REFERENCES "AutoscuolaVehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoscuolaGroupLessonVehicle" ADD CONSTRAINT "AutoscuolaGroupLessonVehicle_groupLessonId_fkey" FOREIGN KEY ("groupLessonId") REFERENCES "AutoscuolaGroupLesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoscuolaGroupLessonVehicle" ADD CONSTRAINT "AutoscuolaGroupLessonVehicle_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "AutoscuolaVehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
