-- Add indexes for deadline queries on AutoscuolaCase
CREATE INDEX "AutoscuolaCase_companyId_pinkSheetExpiresAt_idx" ON "AutoscuolaCase"("companyId", "pinkSheetExpiresAt");
CREATE INDEX "AutoscuolaCase_companyId_medicalExpiresAt_idx" ON "AutoscuolaCase"("companyId", "medicalExpiresAt");

-- Add compound indexes on AutoscuolaPaymentInstallment for overdue-payment queries
CREATE INDEX "AutoscuolaPaymentInstallment_planId_status_dueDate_idx" ON "AutoscuolaPaymentInstallment"("planId", "status", "dueDate");
CREATE INDEX "AutoscuolaPaymentInstallment_status_dueDate_idx" ON "AutoscuolaPaymentInstallment"("status", "dueDate");
