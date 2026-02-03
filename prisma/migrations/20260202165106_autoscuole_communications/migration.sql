-- CreateTable
CREATE TABLE "AutoscuolaMessageTemplate" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "companyId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutoscuolaMessageTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutoscuolaMessageRule" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "companyId" UUID NOT NULL,
    "templateId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "appointmentType" TEXT,
    "offsetDays" INTEGER NOT NULL DEFAULT 0,
    "channel" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutoscuolaMessageRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutoscuolaMessageLog" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "companyId" UUID NOT NULL,
    "ruleId" UUID NOT NULL,
    "templateId" UUID NOT NULL,
    "appointmentId" UUID,
    "studentId" UUID,
    "channel" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'sent',
    "error" TEXT,
    "payload" JSONB,
    "sentAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutoscuolaMessageLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AutoscuolaMessageTemplate_companyId_idx" ON "AutoscuolaMessageTemplate"("companyId");

-- CreateIndex
CREATE INDEX "AutoscuolaMessageRule_companyId_idx" ON "AutoscuolaMessageRule"("companyId");

-- CreateIndex
CREATE INDEX "AutoscuolaMessageRule_type_idx" ON "AutoscuolaMessageRule"("type");

-- CreateIndex
CREATE INDEX "AutoscuolaMessageLog_companyId_idx" ON "AutoscuolaMessageLog"("companyId");

-- CreateIndex
CREATE INDEX "AutoscuolaMessageLog_ruleId_idx" ON "AutoscuolaMessageLog"("ruleId");

-- CreateIndex
CREATE INDEX "AutoscuolaMessageLog_appointmentId_idx" ON "AutoscuolaMessageLog"("appointmentId");

-- CreateIndex
CREATE UNIQUE INDEX "AutoscuolaMessageLog_ruleId_appointmentId_recipient_channel_key" ON "AutoscuolaMessageLog"("ruleId", "appointmentId", "recipient", "channel");

-- AddForeignKey
ALTER TABLE "AutoscuolaMessageTemplate" ADD CONSTRAINT "AutoscuolaMessageTemplate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoscuolaMessageRule" ADD CONSTRAINT "AutoscuolaMessageRule_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoscuolaMessageRule" ADD CONSTRAINT "AutoscuolaMessageRule_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "AutoscuolaMessageTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoscuolaMessageLog" ADD CONSTRAINT "AutoscuolaMessageLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoscuolaMessageLog" ADD CONSTRAINT "AutoscuolaMessageLog_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "AutoscuolaMessageRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoscuolaMessageLog" ADD CONSTRAINT "AutoscuolaMessageLog_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "AutoscuolaMessageTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoscuolaMessageLog" ADD CONSTRAINT "AutoscuolaMessageLog_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "AutoscuolaAppointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoscuolaMessageLog" ADD CONSTRAINT "AutoscuolaMessageLog_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "AutoscuolaStudent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
