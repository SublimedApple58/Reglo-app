-- CreateTable
CREATE TABLE "AutoscuolaSwapOffer" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "companyId" UUID NOT NULL,
    "appointmentId" UUID NOT NULL,
    "requestingStudentId" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'broadcasted',
    "sentAt" TIMESTAMP(6) NOT NULL,
    "expiresAt" TIMESTAMP(6) NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutoscuolaSwapOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutoscuolaSwapResponse" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "offerId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "respondedAt" TIMESTAMP(6) NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutoscuolaSwapResponse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AutoscuolaSwapOffer_companyId_idx" ON "AutoscuolaSwapOffer"("companyId");

-- CreateIndex
CREATE INDEX "AutoscuolaSwapOffer_appointmentId_idx" ON "AutoscuolaSwapOffer"("appointmentId");

-- CreateIndex
CREATE INDEX "AutoscuolaSwapOffer_status_idx" ON "AutoscuolaSwapOffer"("status");

-- CreateIndex
CREATE INDEX "AutoscuolaSwapResponse_offerId_idx" ON "AutoscuolaSwapResponse"("offerId");

-- CreateIndex
CREATE INDEX "AutoscuolaSwapResponse_studentId_idx" ON "AutoscuolaSwapResponse"("studentId");

-- AddForeignKey
ALTER TABLE "AutoscuolaSwapOffer" ADD CONSTRAINT "AutoscuolaSwapOffer_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoscuolaSwapOffer" ADD CONSTRAINT "AutoscuolaSwapOffer_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "AutoscuolaAppointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoscuolaSwapOffer" ADD CONSTRAINT "AutoscuolaSwapOffer_requestingStudentId_fkey" FOREIGN KEY ("requestingStudentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoscuolaSwapResponse" ADD CONSTRAINT "AutoscuolaSwapResponse_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "AutoscuolaSwapOffer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoscuolaSwapResponse" ADD CONSTRAINT "AutoscuolaSwapResponse_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
