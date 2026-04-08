-- AlterTable
ALTER TABLE "AutoscuolaInstructorBlock" ADD COLUMN     "recurrenceGroupId" UUID;

-- CreateIndex
CREATE INDEX "AutoscuolaInstructorBlock_recurrenceGroupId_idx" ON "AutoscuolaInstructorBlock"("recurrenceGroupId");
