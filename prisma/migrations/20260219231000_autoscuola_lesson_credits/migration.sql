-- AlterTable
ALTER TABLE "AutoscuolaAppointment"
ADD COLUMN     "creditApplied" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "creditRefundedAt" TIMESTAMP(6);

-- CreateTable
CREATE TABLE "AutoscuolaStudentLessonCreditBalance" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "companyId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "availableCredits" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutoscuolaStudentLessonCreditBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutoscuolaStudentLessonCreditLedger" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "companyId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "balanceId" UUID NOT NULL,
    "appointmentId" UUID,
    "delta" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "actorUserId" UUID,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutoscuolaStudentLessonCreditLedger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AutoscuolaAppointment_companyId_studentId_creditApplied_idx" ON "AutoscuolaAppointment"("companyId", "studentId", "creditApplied");

-- CreateIndex
CREATE UNIQUE INDEX "AutoscuolaStudentLessonCreditBalance_companyId_studentId_key" ON "AutoscuolaStudentLessonCreditBalance"("companyId", "studentId");

-- CreateIndex
CREATE INDEX "AutoscuolaStudentLessonCreditBalance_companyId_idx" ON "AutoscuolaStudentLessonCreditBalance"("companyId");

-- CreateIndex
CREATE INDEX "AutoscuolaStudentLessonCreditBalance_studentId_idx" ON "AutoscuolaStudentLessonCreditBalance"("studentId");

-- CreateIndex
CREATE INDEX "AutoscuolaStudentLessonCreditLedger_companyId_studentId_createdAt_idx" ON "AutoscuolaStudentLessonCreditLedger"("companyId", "studentId", "createdAt");

-- CreateIndex
CREATE INDEX "AutoscuolaStudentLessonCreditLedger_appointmentId_idx" ON "AutoscuolaStudentLessonCreditLedger"("appointmentId");

-- AddForeignKey
ALTER TABLE "AutoscuolaStudentLessonCreditBalance" ADD CONSTRAINT "AutoscuolaStudentLessonCreditBalance_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoscuolaStudentLessonCreditBalance" ADD CONSTRAINT "AutoscuolaStudentLessonCreditBalance_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoscuolaStudentLessonCreditLedger" ADD CONSTRAINT "AutoscuolaStudentLessonCreditLedger_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoscuolaStudentLessonCreditLedger" ADD CONSTRAINT "AutoscuolaStudentLessonCreditLedger_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoscuolaStudentLessonCreditLedger" ADD CONSTRAINT "AutoscuolaStudentLessonCreditLedger_balanceId_fkey" FOREIGN KEY ("balanceId") REFERENCES "AutoscuolaStudentLessonCreditBalance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoscuolaStudentLessonCreditLedger" ADD CONSTRAINT "AutoscuolaStudentLessonCreditLedger_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "AutoscuolaAppointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoscuolaStudentLessonCreditLedger" ADD CONSTRAINT "AutoscuolaStudentLessonCreditLedger_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
