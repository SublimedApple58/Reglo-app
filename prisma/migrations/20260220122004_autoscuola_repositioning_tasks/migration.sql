-- AlterTable
ALTER TABLE "AutoscuolaAppointment" ADD COLUMN     "cancellationKind" TEXT,
ADD COLUMN     "cancellationReason" TEXT,
ADD COLUMN     "replacedByAppointmentId" UUID;

-- CreateTable
CREATE TABLE "AutoscuolaAppointmentRepositionTask" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "companyId" UUID NOT NULL,
    "sourceAppointmentId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reason" TEXT NOT NULL,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(6),
    "lastAttemptAt" TIMESTAMP(6),
    "matchedAppointmentId" UUID,
    "createdByUserId" UUID,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutoscuolaAppointmentRepositionTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AutoscuolaAppointmentRepositionTask_companyId_status_nextAt_idx" ON "AutoscuolaAppointmentRepositionTask"("companyId", "status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "AutoscuolaAppointmentRepositionTask_studentId_status_idx" ON "AutoscuolaAppointmentRepositionTask"("studentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AutoscuolaAppointmentRepositionTask_sourceAppointmentId_key" ON "AutoscuolaAppointmentRepositionTask"("sourceAppointmentId");

-- CreateIndex
CREATE INDEX "AutoscuolaAppointment_replacedByAppointmentId_idx" ON "AutoscuolaAppointment"("replacedByAppointmentId");

-- CreateIndex
CREATE INDEX "AutoscuolaAppointment_companyId_cancellationKind_startsAt_idx" ON "AutoscuolaAppointment"("companyId", "cancellationKind", "startsAt");

-- AddForeignKey
ALTER TABLE "AutoscuolaAppointment" ADD CONSTRAINT "AutoscuolaAppointment_replacedByAppointmentId_fkey" FOREIGN KEY ("replacedByAppointmentId") REFERENCES "AutoscuolaAppointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoscuolaAppointmentRepositionTask" ADD CONSTRAINT "AutoscuolaAppointmentRepositionTask_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoscuolaAppointmentRepositionTask" ADD CONSTRAINT "AutoscuolaAppointmentRepositionTask_sourceAppointmentId_fkey" FOREIGN KEY ("sourceAppointmentId") REFERENCES "AutoscuolaAppointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoscuolaAppointmentRepositionTask" ADD CONSTRAINT "AutoscuolaAppointmentRepositionTask_matchedAppointmentId_fkey" FOREIGN KEY ("matchedAppointmentId") REFERENCES "AutoscuolaAppointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoscuolaAppointmentRepositionTask" ADD CONSTRAINT "AutoscuolaAppointmentRepositionTask_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoscuolaAppointmentRepositionTask" ADD CONSTRAINT "AutoscuolaAppointmentRepositionTask_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
