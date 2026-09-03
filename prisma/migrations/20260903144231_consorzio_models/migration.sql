-- AlterTable
ALTER TABLE "AutoscuolaNotification" ADD COLUMN     "meta" JSONB;

-- AlterTable
ALTER TABLE "CompanyMember" ADD COLUMN     "consorzioSchoolId" UUID;

-- CreateTable
CREATE TABLE "ConsorzioSchool" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "consorzioCompanyId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT,
    "ownerName" TEXT,
    "address" TEXT,
    "vatNumber" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "joinedAt" TIMESTAMP(6),
    "linkedCompanyId" UUID,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConsorzioSchool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsorzioAccountingCode" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "consorzioCompanyId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(6),
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsorzioAccountingCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsorzioMemberAccountingCode" (
    "codeId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "userId" UUID NOT NULL,

    CONSTRAINT "ConsorzioMemberAccountingCode_pkey" PRIMARY KEY ("codeId","companyId","userId")
);

-- CreateTable
CREATE TABLE "ConsorzioAppointmentAccountingCode" (
    "codeId" UUID NOT NULL,
    "appointmentId" UUID NOT NULL,

    CONSTRAINT "ConsorzioAppointmentAccountingCode_pkey" PRIMARY KEY ("codeId","appointmentId")
);

-- CreateTable
CREATE TABLE "ConsorzioGuideRequest" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "consorzioCompanyId" UUID NOT NULL,
    "schoolId" UUID NOT NULL,
    "studentUserId" UUID NOT NULL,
    "requestedStartsAt" TIMESTAMP(6) NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "vehicleId" UUID,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "appointmentId" UUID,
    "movedToStartsAt" TIMESTAMP(6),
    "respondedAt" TIMESTAMP(6),
    "respondedByUserId" UUID,
    "note" TEXT,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConsorzioGuideRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsorzioLessonBilling" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "appointmentId" UUID NOT NULL,
    "consorzioCompanyId" UUID NOT NULL,
    "schoolId" UUID NOT NULL,
    "priceAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "settledAt" TIMESTAMP(6),
    "invoiceSentAt" TIMESTAMP(6),
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConsorzioLessonBilling_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConsorzioSchool_consorzioCompanyId_status_idx" ON "ConsorzioSchool"("consorzioCompanyId", "status");

-- CreateIndex
CREATE INDEX "ConsorzioSchool_linkedCompanyId_idx" ON "ConsorzioSchool"("linkedCompanyId");

-- CreateIndex
CREATE INDEX "ConsorzioAccountingCode_consorzioCompanyId_archivedAt_idx" ON "ConsorzioAccountingCode"("consorzioCompanyId", "archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ConsorzioAccountingCode_consorzioCompanyId_code_key" ON "ConsorzioAccountingCode"("consorzioCompanyId", "code");

-- CreateIndex
CREATE INDEX "ConsorzioMemberAccountingCode_companyId_userId_idx" ON "ConsorzioMemberAccountingCode"("companyId", "userId");

-- CreateIndex
CREATE INDEX "ConsorzioAppointmentAccountingCode_appointmentId_idx" ON "ConsorzioAppointmentAccountingCode"("appointmentId");

-- CreateIndex
CREATE INDEX "ConsorzioGuideRequest_consorzioCompanyId_status_requestedSt_idx" ON "ConsorzioGuideRequest"("consorzioCompanyId", "status", "requestedStartsAt");

-- CreateIndex
CREATE INDEX "ConsorzioGuideRequest_schoolId_idx" ON "ConsorzioGuideRequest"("schoolId");

-- CreateIndex
CREATE INDEX "ConsorzioGuideRequest_appointmentId_idx" ON "ConsorzioGuideRequest"("appointmentId");

-- CreateIndex
CREATE UNIQUE INDEX "ConsorzioLessonBilling_appointmentId_key" ON "ConsorzioLessonBilling"("appointmentId");

-- CreateIndex
CREATE INDEX "ConsorzioLessonBilling_consorzioCompanyId_schoolId_idx" ON "ConsorzioLessonBilling"("consorzioCompanyId", "schoolId");

-- CreateIndex
CREATE INDEX "ConsorzioLessonBilling_schoolId_settledAt_idx" ON "ConsorzioLessonBilling"("schoolId", "settledAt");

-- AddForeignKey
ALTER TABLE "CompanyMember" ADD CONSTRAINT "CompanyMember_consorzioSchoolId_fkey" FOREIGN KEY ("consorzioSchoolId") REFERENCES "ConsorzioSchool"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsorzioSchool" ADD CONSTRAINT "ConsorzioSchool_consorzioCompanyId_fkey" FOREIGN KEY ("consorzioCompanyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsorzioSchool" ADD CONSTRAINT "ConsorzioSchool_linkedCompanyId_fkey" FOREIGN KEY ("linkedCompanyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsorzioAccountingCode" ADD CONSTRAINT "ConsorzioAccountingCode_consorzioCompanyId_fkey" FOREIGN KEY ("consorzioCompanyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsorzioMemberAccountingCode" ADD CONSTRAINT "ConsorzioMemberAccountingCode_codeId_fkey" FOREIGN KEY ("codeId") REFERENCES "ConsorzioAccountingCode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsorzioMemberAccountingCode" ADD CONSTRAINT "ConsorzioMemberAccountingCode_companyId_userId_fkey" FOREIGN KEY ("companyId", "userId") REFERENCES "CompanyMember"("companyId", "userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsorzioAppointmentAccountingCode" ADD CONSTRAINT "ConsorzioAppointmentAccountingCode_codeId_fkey" FOREIGN KEY ("codeId") REFERENCES "ConsorzioAccountingCode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsorzioAppointmentAccountingCode" ADD CONSTRAINT "ConsorzioAppointmentAccountingCode_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "AutoscuolaAppointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsorzioGuideRequest" ADD CONSTRAINT "ConsorzioGuideRequest_consorzioCompanyId_fkey" FOREIGN KEY ("consorzioCompanyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsorzioGuideRequest" ADD CONSTRAINT "ConsorzioGuideRequest_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "ConsorzioSchool"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsorzioGuideRequest" ADD CONSTRAINT "ConsorzioGuideRequest_studentUserId_fkey" FOREIGN KEY ("studentUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsorzioGuideRequest" ADD CONSTRAINT "ConsorzioGuideRequest_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "AutoscuolaVehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsorzioGuideRequest" ADD CONSTRAINT "ConsorzioGuideRequest_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "AutoscuolaAppointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsorzioLessonBilling" ADD CONSTRAINT "ConsorzioLessonBilling_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "AutoscuolaAppointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsorzioLessonBilling" ADD CONSTRAINT "ConsorzioLessonBilling_consorzioCompanyId_fkey" FOREIGN KEY ("consorzioCompanyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsorzioLessonBilling" ADD CONSTRAINT "ConsorzioLessonBilling_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "ConsorzioSchool"("id") ON DELETE CASCADE ON UPDATE CASCADE;

