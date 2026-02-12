-- AlterTable
ALTER TABLE "AutoscuolaAppointment" ADD COLUMN     "cancelledAt" TIMESTAMP(6),
ADD COLUMN     "invoiceId" TEXT,
ADD COLUMN     "invoiceStatus" TEXT,
ADD COLUMN     "paidAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "paymentRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "paymentStatus" TEXT NOT NULL DEFAULT 'not_required',
ADD COLUMN     "penaltyAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "penaltyCutoffAt" TIMESTAMP(6),
ADD COLUMN     "priceAmount" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "AutoscuolaStudentPaymentProfile" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "companyId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "stripeCustomerId" TEXT NOT NULL,
    "stripeDefaultPaymentMethodId" TEXT,
    "ficClientId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutoscuolaStudentPaymentProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutoscuolaAppointmentPayment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "appointmentId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "profileId" UUID,
    "phase" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(6),
    "stripePaymentIntentId" TEXT,
    "stripeChargeId" TEXT,
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "paidAt" TIMESTAMP(6),
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutoscuolaAppointmentPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AutoscuolaStudentPaymentProfile_companyId_idx" ON "AutoscuolaStudentPaymentProfile"("companyId");

-- CreateIndex
CREATE INDEX "AutoscuolaStudentPaymentProfile_studentId_idx" ON "AutoscuolaStudentPaymentProfile"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "AutoscuolaStudentPaymentProfile_companyId_studentId_key" ON "AutoscuolaStudentPaymentProfile"("companyId", "studentId");

-- CreateIndex
CREATE INDEX "AutoscuolaAppointmentPayment_appointmentId_idx" ON "AutoscuolaAppointmentPayment"("appointmentId");

-- CreateIndex
CREATE INDEX "AutoscuolaAppointmentPayment_companyId_studentId_idx" ON "AutoscuolaAppointmentPayment"("companyId", "studentId");

-- CreateIndex
CREATE INDEX "AutoscuolaAppointmentPayment_status_nextAttemptAt_idx" ON "AutoscuolaAppointmentPayment"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "AutoscuolaAppointmentPayment_phase_idx" ON "AutoscuolaAppointmentPayment"("phase");

-- CreateIndex
CREATE UNIQUE INDEX "AutoscuolaAppointmentPayment_stripePaymentIntentId_key" ON "AutoscuolaAppointmentPayment"("stripePaymentIntentId");

-- CreateIndex
CREATE INDEX "AutoscuolaAppointment_paymentRequired_paymentStatus_idx" ON "AutoscuolaAppointment"("paymentRequired", "paymentStatus");

-- CreateIndex
CREATE INDEX "AutoscuolaAppointment_penaltyCutoffAt_idx" ON "AutoscuolaAppointment"("penaltyCutoffAt");

-- AddForeignKey
ALTER TABLE "AutoscuolaStudentPaymentProfile" ADD CONSTRAINT "AutoscuolaStudentPaymentProfile_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoscuolaStudentPaymentProfile" ADD CONSTRAINT "AutoscuolaStudentPaymentProfile_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoscuolaAppointmentPayment" ADD CONSTRAINT "AutoscuolaAppointmentPayment_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "AutoscuolaAppointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoscuolaAppointmentPayment" ADD CONSTRAINT "AutoscuolaAppointmentPayment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoscuolaAppointmentPayment" ADD CONSTRAINT "AutoscuolaAppointmentPayment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoscuolaAppointmentPayment" ADD CONSTRAINT "AutoscuolaAppointmentPayment_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "AutoscuolaStudentPaymentProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
