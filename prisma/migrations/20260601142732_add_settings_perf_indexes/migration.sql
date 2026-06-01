-- CreateIndex
CREATE INDEX "AutoscuolaAppointment_companyId_studentId_paymentRequired_p_idx" ON "AutoscuolaAppointment"("companyId", "studentId", "paymentRequired", "paymentStatus");

-- CreateIndex
CREATE INDEX "CompanyMember_companyId_autoscuolaRole_idx" ON "CompanyMember"("companyId", "autoscuolaRole");
