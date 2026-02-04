-- CreateTable
CREATE TABLE "AutoscuolaAvailabilitySlot" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "companyId" UUID NOT NULL,
    "ownerType" TEXT NOT NULL,
    "ownerId" UUID NOT NULL,
    "startsAt" TIMESTAMP(6) NOT NULL,
    "endsAt" TIMESTAMP(6) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutoscuolaAvailabilitySlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutoscuolaBookingRequest" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "companyId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "desiredDate" TIMESTAMP(6) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutoscuolaBookingRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutoscuolaWaitlistOffer" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "companyId" UUID NOT NULL,
    "slotId" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'broadcasted',
    "sentAt" TIMESTAMP(6) NOT NULL,
    "expiresAt" TIMESTAMP(6) NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutoscuolaWaitlistOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutoscuolaWaitlistResponse" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "offerId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'accepted',
    "respondedAt" TIMESTAMP(6) NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutoscuolaWaitlistResponse_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "AutoscuolaAppointment" ADD COLUMN     "slotId" UUID;

-- CreateIndex
CREATE INDEX "AutoscuolaAvailabilitySlot_companyId_idx" ON "AutoscuolaAvailabilitySlot"("companyId");

-- CreateIndex
CREATE INDEX "AutoscuolaAvailabilitySlot_ownerType_ownerId_idx" ON "AutoscuolaAvailabilitySlot"("ownerType", "ownerId");

-- CreateIndex
CREATE INDEX "AutoscuolaAvailabilitySlot_startsAt_idx" ON "AutoscuolaAvailabilitySlot"("startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "AutoscuolaAvailabilitySlot_companyId_ownerType_ownerId_startsAt_key" ON "AutoscuolaAvailabilitySlot"("companyId", "ownerType", "ownerId", "startsAt");

-- CreateIndex
CREATE INDEX "AutoscuolaBookingRequest_companyId_idx" ON "AutoscuolaBookingRequest"("companyId");

-- CreateIndex
CREATE INDEX "AutoscuolaBookingRequest_studentId_idx" ON "AutoscuolaBookingRequest"("studentId");

-- CreateIndex
CREATE INDEX "AutoscuolaBookingRequest_desiredDate_idx" ON "AutoscuolaBookingRequest"("desiredDate");

-- CreateIndex
CREATE INDEX "AutoscuolaWaitlistOffer_companyId_idx" ON "AutoscuolaWaitlistOffer"("companyId");

-- CreateIndex
CREATE INDEX "AutoscuolaWaitlistOffer_slotId_idx" ON "AutoscuolaWaitlistOffer"("slotId");

-- CreateIndex
CREATE INDEX "AutoscuolaWaitlistResponse_offerId_idx" ON "AutoscuolaWaitlistResponse"("offerId");

-- CreateIndex
CREATE INDEX "AutoscuolaWaitlistResponse_studentId_idx" ON "AutoscuolaWaitlistResponse"("studentId");

-- CreateIndex
CREATE INDEX "AutoscuolaAppointment_slotId_idx" ON "AutoscuolaAppointment"("slotId");

-- AddForeignKey
ALTER TABLE "AutoscuolaAvailabilitySlot" ADD CONSTRAINT "AutoscuolaAvailabilitySlot_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoscuolaBookingRequest" ADD CONSTRAINT "AutoscuolaBookingRequest_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoscuolaBookingRequest" ADD CONSTRAINT "AutoscuolaBookingRequest_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "AutoscuolaStudent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoscuolaWaitlistOffer" ADD CONSTRAINT "AutoscuolaWaitlistOffer_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoscuolaWaitlistOffer" ADD CONSTRAINT "AutoscuolaWaitlistOffer_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "AutoscuolaAvailabilitySlot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoscuolaWaitlistResponse" ADD CONSTRAINT "AutoscuolaWaitlistResponse_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "AutoscuolaWaitlistOffer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoscuolaWaitlistResponse" ADD CONSTRAINT "AutoscuolaWaitlistResponse_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "AutoscuolaStudent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoscuolaAppointment" ADD CONSTRAINT "AutoscuolaAppointment_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "AutoscuolaAvailabilitySlot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
