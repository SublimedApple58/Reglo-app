-- CreateTable
CREATE TABLE "AutoscuolaVoiceLine" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "companyId" UUID NOT NULL,
    "displayNumber" TEXT NOT NULL,
    "twilioNumber" TEXT NOT NULL,
    "twilioPhoneSid" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ready',
    "routingMode" TEXT NOT NULL DEFAULT 'twilio',
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutoscuolaVoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutoscuolaVoiceCall" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "companyId" UUID NOT NULL,
    "lineId" UUID NOT NULL,
    "twilioCallSid" TEXT NOT NULL,
    "fromNumber" TEXT NOT NULL,
    "toNumber" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'received',
    "studentId" UUID,
    "appointmentId" UUID,
    "startedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(6),
    "durationSec" INTEGER,
    "outcome" TEXT,
    "summary" TEXT,
    "recordingSid" TEXT,
    "recordingUrl" TEXT,
    "transcriptText" TEXT,
    "needsCallback" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutoscuolaVoiceCall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutoscuolaVoiceCallTurn" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "callId" UUID NOT NULL,
    "speaker" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutoscuolaVoiceCallTurn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutoscuolaVoiceCallbackTask" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "companyId" UUID NOT NULL,
    "callId" UUID NOT NULL,
    "studentId" UUID,
    "phoneNumber" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "assignedToUserId" UUID,
    "nextAttemptAt" TIMESTAMP(6),
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutoscuolaVoiceCallbackTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutoscuolaVoiceKnowledgeChunk" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "scope" TEXT NOT NULL,
    "companyId" UUID,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "tags" TEXT[],
    "language" TEXT NOT NULL DEFAULT 'it-IT',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutoscuolaVoiceKnowledgeChunk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AutoscuolaVoiceLine_companyId_idx" ON "AutoscuolaVoiceLine"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "AutoscuolaVoiceLine_twilioPhoneSid_key" ON "AutoscuolaVoiceLine"("twilioPhoneSid");

-- CreateIndex
CREATE UNIQUE INDEX "AutoscuolaVoiceCall_twilioCallSid_key" ON "AutoscuolaVoiceCall"("twilioCallSid");

-- CreateIndex
CREATE INDEX "AutoscuolaVoiceCall_companyId_status_startedAt_idx" ON "AutoscuolaVoiceCall"("companyId", "status", "startedAt");

-- CreateIndex
CREATE INDEX "AutoscuolaVoiceCall_lineId_idx" ON "AutoscuolaVoiceCall"("lineId");

-- CreateIndex
CREATE INDEX "AutoscuolaVoiceCall_studentId_idx" ON "AutoscuolaVoiceCall"("studentId");

-- CreateIndex
CREATE INDEX "AutoscuolaVoiceCall_appointmentId_idx" ON "AutoscuolaVoiceCall"("appointmentId");

-- CreateIndex
CREATE INDEX "AutoscuolaVoiceCallTurn_callId_createdAt_idx" ON "AutoscuolaVoiceCallTurn"("callId", "createdAt");

-- CreateIndex
CREATE INDEX "AutoscuolaVoiceCallbackTask_companyId_status_nextAttemptAt_idx" ON "AutoscuolaVoiceCallbackTask"("companyId", "status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "AutoscuolaVoiceCallbackTask_studentId_idx" ON "AutoscuolaVoiceCallbackTask"("studentId");

-- CreateIndex
CREATE INDEX "AutoscuolaVoiceKnowledgeChunk_scope_companyId_language_acti_idx" ON "AutoscuolaVoiceKnowledgeChunk"("scope", "companyId", "language", "active");

-- AddForeignKey
ALTER TABLE "AutoscuolaVoiceLine" ADD CONSTRAINT "AutoscuolaVoiceLine_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoscuolaVoiceCall" ADD CONSTRAINT "AutoscuolaVoiceCall_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoscuolaVoiceCall" ADD CONSTRAINT "AutoscuolaVoiceCall_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "AutoscuolaVoiceLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoscuolaVoiceCall" ADD CONSTRAINT "AutoscuolaVoiceCall_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoscuolaVoiceCall" ADD CONSTRAINT "AutoscuolaVoiceCall_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "AutoscuolaAppointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoscuolaVoiceCallTurn" ADD CONSTRAINT "AutoscuolaVoiceCallTurn_callId_fkey" FOREIGN KEY ("callId") REFERENCES "AutoscuolaVoiceCall"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoscuolaVoiceCallbackTask" ADD CONSTRAINT "AutoscuolaVoiceCallbackTask_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoscuolaVoiceCallbackTask" ADD CONSTRAINT "AutoscuolaVoiceCallbackTask_callId_fkey" FOREIGN KEY ("callId") REFERENCES "AutoscuolaVoiceCall"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoscuolaVoiceCallbackTask" ADD CONSTRAINT "AutoscuolaVoiceCallbackTask_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoscuolaVoiceKnowledgeChunk" ADD CONSTRAINT "AutoscuolaVoiceKnowledgeChunk_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
