-- CreateTable
CREATE TABLE "AutoscuolaStudent" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "companyId" UUID NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "notes" TEXT,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutoscuolaStudent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutoscuolaCase" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "companyId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "category" TEXT,
    "status" TEXT NOT NULL DEFAULT 'iscritto',
    "theoryExamAt" TIMESTAMP(6),
    "drivingExamAt" TIMESTAMP(6),
    "pinkSheetExpiresAt" TIMESTAMP(6),
    "medicalExpiresAt" TIMESTAMP(6),
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutoscuolaCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutoscuolaAppointment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "companyId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "caseId" UUID,
    "type" TEXT NOT NULL,
    "startsAt" TIMESTAMP(6) NOT NULL,
    "endsAt" TIMESTAMP(6),
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "instructorName" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutoscuolaAppointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutoscuolaDocument" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "companyId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'missing',
    "fileUrl" TEXT,
    "expiresAt" TIMESTAMP(6),
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutoscuolaDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutoscuolaPaymentPlan" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "companyId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "caseId" UUID,
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutoscuolaPaymentPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutoscuolaPaymentInstallment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "planId" UUID NOT NULL,
    "dueDate" TIMESTAMP(6) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "paidAt" TIMESTAMP(6),
    "invoiceId" TEXT,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutoscuolaPaymentInstallment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AutoscuolaStudent_companyId_idx" ON "AutoscuolaStudent"("companyId");

-- CreateIndex
CREATE INDEX "AutoscuolaStudent_status_idx" ON "AutoscuolaStudent"("status");

-- CreateIndex
CREATE INDEX "AutoscuolaStudent_lastName_firstName_idx" ON "AutoscuolaStudent"("lastName", "firstName");

-- CreateIndex
CREATE INDEX "AutoscuolaCase_companyId_idx" ON "AutoscuolaCase"("companyId");

-- CreateIndex
CREATE INDEX "AutoscuolaCase_studentId_idx" ON "AutoscuolaCase"("studentId");

-- CreateIndex
CREATE INDEX "AutoscuolaCase_status_idx" ON "AutoscuolaCase"("status");

-- CreateIndex
CREATE INDEX "AutoscuolaAppointment_companyId_idx" ON "AutoscuolaAppointment"("companyId");

-- CreateIndex
CREATE INDEX "AutoscuolaAppointment_studentId_idx" ON "AutoscuolaAppointment"("studentId");

-- CreateIndex
CREATE INDEX "AutoscuolaAppointment_startsAt_idx" ON "AutoscuolaAppointment"("startsAt");

-- CreateIndex
CREATE INDEX "AutoscuolaDocument_companyId_idx" ON "AutoscuolaDocument"("companyId");

-- CreateIndex
CREATE INDEX "AutoscuolaDocument_studentId_idx" ON "AutoscuolaDocument"("studentId");

-- CreateIndex
CREATE INDEX "AutoscuolaPaymentPlan_companyId_idx" ON "AutoscuolaPaymentPlan"("companyId");

-- CreateIndex
CREATE INDEX "AutoscuolaPaymentPlan_studentId_idx" ON "AutoscuolaPaymentPlan"("studentId");

-- CreateIndex
CREATE INDEX "AutoscuolaPaymentInstallment_planId_idx" ON "AutoscuolaPaymentInstallment"("planId");

-- CreateIndex
CREATE INDEX "AutoscuolaPaymentInstallment_dueDate_idx" ON "AutoscuolaPaymentInstallment"("dueDate");

-- AddForeignKey
ALTER TABLE "AutoscuolaStudent" ADD CONSTRAINT "AutoscuolaStudent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoscuolaCase" ADD CONSTRAINT "AutoscuolaCase_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoscuolaCase" ADD CONSTRAINT "AutoscuolaCase_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "AutoscuolaStudent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoscuolaAppointment" ADD CONSTRAINT "AutoscuolaAppointment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoscuolaAppointment" ADD CONSTRAINT "AutoscuolaAppointment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "AutoscuolaStudent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoscuolaAppointment" ADD CONSTRAINT "AutoscuolaAppointment_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "AutoscuolaCase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoscuolaDocument" ADD CONSTRAINT "AutoscuolaDocument_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoscuolaDocument" ADD CONSTRAINT "AutoscuolaDocument_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "AutoscuolaStudent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoscuolaPaymentPlan" ADD CONSTRAINT "AutoscuolaPaymentPlan_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoscuolaPaymentPlan" ADD CONSTRAINT "AutoscuolaPaymentPlan_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "AutoscuolaStudent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoscuolaPaymentPlan" ADD CONSTRAINT "AutoscuolaPaymentPlan_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "AutoscuolaCase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoscuolaPaymentInstallment" ADD CONSTRAINT "AutoscuolaPaymentInstallment_planId_fkey" FOREIGN KEY ("planId") REFERENCES "AutoscuolaPaymentPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
