-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "renewalPublicSlug" TEXT;

-- CreateTable
CREATE TABLE "RenewalMedico" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "companyId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "visitDurationMinutes" INTEGER NOT NULL DEFAULT 20,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RenewalMedico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RenewalMedicoAvailability" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "companyId" UUID NOT NULL,
    "medicoId" UUID NOT NULL,
    "daysOfWeek" INTEGER[],
    "startMinutes" INTEGER NOT NULL,
    "endMinutes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RenewalMedicoAvailability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RenewalRequest" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "companyId" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'submitted',
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "codiceFiscale" TEXT,
    "licenseNumber" TEXT,
    "licenseExpiresAt" DATE,
    "birthDate" DATE,
    "reviewNotes" TEXT,
    "resumeToken" TEXT,
    "resumeTokenExpiresAt" TIMESTAMP(6),
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RenewalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RenewalDocument" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "requestId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "fileKey" TEXT NOT NULL,
    "contentType" TEXT,
    "status" TEXT NOT NULL DEFAULT 'uploaded',
    "softCheckResult" JSON,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RenewalDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RenewalVisitBooking" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "companyId" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "medicoId" UUID NOT NULL,
    "startAt" TIMESTAMP(6) NOT NULL,
    "endAt" TIMESTAMP(6) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'confirmed',
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RenewalVisitBooking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RenewalChatMessage" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "requestId" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RenewalChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RenewalFaq" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "companyId" UUID NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RenewalFaq_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RenewalMedico_companyId_idx" ON "RenewalMedico"("companyId");

-- CreateIndex
CREATE INDEX "RenewalMedicoAvailability_companyId_idx" ON "RenewalMedicoAvailability"("companyId");

-- CreateIndex
CREATE INDEX "RenewalMedicoAvailability_medicoId_idx" ON "RenewalMedicoAvailability"("medicoId");

-- CreateIndex
CREATE UNIQUE INDEX "RenewalRequest_resumeToken_key" ON "RenewalRequest"("resumeToken");

-- CreateIndex
CREATE INDEX "RenewalRequest_companyId_idx" ON "RenewalRequest"("companyId");

-- CreateIndex
CREATE INDEX "RenewalRequest_companyId_status_idx" ON "RenewalRequest"("companyId", "status");

-- CreateIndex
CREATE INDEX "RenewalDocument_requestId_idx" ON "RenewalDocument"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "RenewalVisitBooking_requestId_key" ON "RenewalVisitBooking"("requestId");

-- CreateIndex
CREATE INDEX "RenewalVisitBooking_companyId_idx" ON "RenewalVisitBooking"("companyId");

-- CreateIndex
CREATE INDEX "RenewalVisitBooking_companyId_startAt_idx" ON "RenewalVisitBooking"("companyId", "startAt");

-- CreateIndex
CREATE UNIQUE INDEX "RenewalVisitBooking_medicoId_startAt_key" ON "RenewalVisitBooking"("medicoId", "startAt");

-- CreateIndex
CREATE INDEX "RenewalChatMessage_requestId_idx" ON "RenewalChatMessage"("requestId");

-- CreateIndex
CREATE INDEX "RenewalFaq_companyId_idx" ON "RenewalFaq"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Company_renewalPublicSlug_key" ON "Company"("renewalPublicSlug");

-- AddForeignKey
ALTER TABLE "RenewalMedico" ADD CONSTRAINT "RenewalMedico_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RenewalMedicoAvailability" ADD CONSTRAINT "RenewalMedicoAvailability_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RenewalMedicoAvailability" ADD CONSTRAINT "RenewalMedicoAvailability_medicoId_fkey" FOREIGN KEY ("medicoId") REFERENCES "RenewalMedico"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RenewalRequest" ADD CONSTRAINT "RenewalRequest_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RenewalDocument" ADD CONSTRAINT "RenewalDocument_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "RenewalRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RenewalVisitBooking" ADD CONSTRAINT "RenewalVisitBooking_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RenewalVisitBooking" ADD CONSTRAINT "RenewalVisitBooking_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "RenewalRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RenewalVisitBooking" ADD CONSTRAINT "RenewalVisitBooking_medicoId_fkey" FOREIGN KEY ("medicoId") REFERENCES "RenewalMedico"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RenewalChatMessage" ADD CONSTRAINT "RenewalChatMessage_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "RenewalRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RenewalFaq" ADD CONSTRAINT "RenewalFaq_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

