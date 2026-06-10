-- AlterTable
ALTER TABLE "AutoscuolaAppointment" ADD COLUMN     "groupLessonId" UUID;

-- AlterTable
ALTER TABLE "CompanyMember" ADD COLUMN     "groupLessonsOptIn" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "AutoscuolaGroupLesson" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "companyId" UUID NOT NULL,
    "instructorId" UUID,
    "vehicleId" UUID,
    "startsAt" TIMESTAMP(6) NOT NULL,
    "endsAt" TIMESTAMP(6),
    "capacity" INTEGER NOT NULL DEFAULT 3,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "priceAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdByUserId" UUID,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutoscuolaGroupLesson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutoscuolaGroupLessonInvite" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "companyId" UUID NOT NULL,
    "groupLessonId" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'broadcasted',
    "sentAt" TIMESTAMP(6) NOT NULL,
    "expiresAt" TIMESTAMP(6) NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutoscuolaGroupLessonInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutoscuolaGroupLessonInviteResponse" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "inviteId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'accepted',
    "respondedAt" TIMESTAMP(6) NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutoscuolaGroupLessonInviteResponse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AutoscuolaGroupLesson_companyId_idx" ON "AutoscuolaGroupLesson"("companyId");

-- CreateIndex
CREATE INDEX "AutoscuolaGroupLesson_companyId_startsAt_idx" ON "AutoscuolaGroupLesson"("companyId", "startsAt");

-- CreateIndex
CREATE INDEX "AutoscuolaGroupLesson_instructorId_idx" ON "AutoscuolaGroupLesson"("instructorId");

-- CreateIndex
CREATE INDEX "AutoscuolaGroupLesson_vehicleId_idx" ON "AutoscuolaGroupLesson"("vehicleId");

-- CreateIndex
CREATE INDEX "AutoscuolaGroupLessonInvite_companyId_idx" ON "AutoscuolaGroupLessonInvite"("companyId");

-- CreateIndex
CREATE INDEX "AutoscuolaGroupLessonInvite_groupLessonId_idx" ON "AutoscuolaGroupLessonInvite"("groupLessonId");

-- CreateIndex
CREATE INDEX "AutoscuolaGroupLessonInvite_status_idx" ON "AutoscuolaGroupLessonInvite"("status");

-- CreateIndex
CREATE INDEX "AutoscuolaGroupLessonInviteResponse_inviteId_idx" ON "AutoscuolaGroupLessonInviteResponse"("inviteId");

-- CreateIndex
CREATE INDEX "AutoscuolaGroupLessonInviteResponse_studentId_idx" ON "AutoscuolaGroupLessonInviteResponse"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "AutoscuolaGroupLessonInviteResponse_inviteId_studentId_key" ON "AutoscuolaGroupLessonInviteResponse"("inviteId", "studentId");

-- CreateIndex
CREATE INDEX "AutoscuolaAppointment_groupLessonId_idx" ON "AutoscuolaAppointment"("groupLessonId");

-- AddForeignKey
ALTER TABLE "AutoscuolaAppointment" ADD CONSTRAINT "AutoscuolaAppointment_groupLessonId_fkey" FOREIGN KEY ("groupLessonId") REFERENCES "AutoscuolaGroupLesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoscuolaGroupLesson" ADD CONSTRAINT "AutoscuolaGroupLesson_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoscuolaGroupLesson" ADD CONSTRAINT "AutoscuolaGroupLesson_instructorId_fkey" FOREIGN KEY ("instructorId") REFERENCES "AutoscuolaInstructor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoscuolaGroupLesson" ADD CONSTRAINT "AutoscuolaGroupLesson_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "AutoscuolaVehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoscuolaGroupLesson" ADD CONSTRAINT "AutoscuolaGroupLesson_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoscuolaGroupLessonInvite" ADD CONSTRAINT "AutoscuolaGroupLessonInvite_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoscuolaGroupLessonInvite" ADD CONSTRAINT "AutoscuolaGroupLessonInvite_groupLessonId_fkey" FOREIGN KEY ("groupLessonId") REFERENCES "AutoscuolaGroupLesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoscuolaGroupLessonInviteResponse" ADD CONSTRAINT "AutoscuolaGroupLessonInviteResponse_inviteId_fkey" FOREIGN KEY ("inviteId") REFERENCES "AutoscuolaGroupLessonInvite"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoscuolaGroupLessonInviteResponse" ADD CONSTRAINT "AutoscuolaGroupLessonInviteResponse_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

