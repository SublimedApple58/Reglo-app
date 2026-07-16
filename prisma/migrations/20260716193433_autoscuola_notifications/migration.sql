-- CreateTable
CREATE TABLE "AutoscuolaNotification" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "companyId" UUID NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'student_cancellation',
    "appointmentId" UUID,
    "studentId" UUID,
    "studentName" TEXT,
    "startsAt" TIMESTAMP(6),
    "instructorName" TEXT,
    "lessonType" TEXT,
    "readAt" TIMESTAMP(6),
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutoscuolaNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AutoscuolaNotification_companyId_createdAt_idx" ON "AutoscuolaNotification"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "AutoscuolaNotification_companyId_readAt_idx" ON "AutoscuolaNotification"("companyId", "readAt");

-- AddForeignKey
ALTER TABLE "AutoscuolaNotification" ADD CONSTRAINT "AutoscuolaNotification_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
