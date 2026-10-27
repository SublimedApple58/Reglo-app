-- CreateTable
CREATE TABLE "AutoscuolaAppointmentPaymentEvent" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "companyId" UUID NOT NULL,
    "appointmentId" UUID NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT,
    "actorUserId" UUID,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutoscuolaAppointmentPaymentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AutoscuolaAppointmentPaymentEvent_appointmentId_createdAt_idx" ON "AutoscuolaAppointmentPaymentEvent"("appointmentId", "createdAt");

-- CreateIndex
CREATE INDEX "AutoscuolaAppointmentPaymentEvent_companyId_idx" ON "AutoscuolaAppointmentPaymentEvent"("companyId");

-- AddForeignKey
ALTER TABLE "AutoscuolaAppointmentPaymentEvent" ADD CONSTRAINT "AutoscuolaAppointmentPaymentEvent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoscuolaAppointmentPaymentEvent" ADD CONSTRAINT "AutoscuolaAppointmentPaymentEvent_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "AutoscuolaAppointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoscuolaAppointmentPaymentEvent" ADD CONSTRAINT "AutoscuolaAppointmentPaymentEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

