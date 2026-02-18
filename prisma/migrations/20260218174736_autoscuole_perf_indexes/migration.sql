-- CreateIndex
CREATE INDEX "AutoscuolaAppointment_companyId_startsAt_idx" ON "AutoscuolaAppointment"("companyId", "startsAt");

-- CreateIndex
CREATE INDEX "AutoscuolaAppointment_companyId_status_startsAt_idx" ON "AutoscuolaAppointment"("companyId", "status", "startsAt");

-- CreateIndex
CREATE INDEX "AutoscuolaAppointment_companyId_instructorId_startsAt_idx" ON "AutoscuolaAppointment"("companyId", "instructorId", "startsAt");

-- CreateIndex
CREATE INDEX "AutoscuolaAppointment_companyId_studentId_startsAt_idx" ON "AutoscuolaAppointment"("companyId", "studentId", "startsAt");

-- CreateIndex
CREATE INDEX "AutoscuolaAppointment_companyId_paymentRequired_startsAt_idx" ON "AutoscuolaAppointment"("companyId", "paymentRequired", "startsAt");

-- CreateIndex
CREATE INDEX "AutoscuolaAppointmentPayment_companyId_appointmentId_create_idx" ON "AutoscuolaAppointmentPayment"("companyId", "appointmentId", "createdAt");

-- CreateIndex
CREATE INDEX "AutoscuolaAppointmentPayment_appointmentId_status_idx" ON "AutoscuolaAppointmentPayment"("appointmentId", "status");
