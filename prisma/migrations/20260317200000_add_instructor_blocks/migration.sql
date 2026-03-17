-- CreateTable
CREATE TABLE "AutoscuolaInstructorBlock" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "companyId" UUID NOT NULL,
    "instructorId" UUID NOT NULL,
    "startsAt" TIMESTAMP(6) NOT NULL,
    "endsAt" TIMESTAMP(6) NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "AutoscuolaInstructorBlock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AutoscuolaInstructorBlock_companyId_instructorId_startsAt_idx" ON "AutoscuolaInstructorBlock"("companyId", "instructorId", "startsAt");

-- CreateIndex
CREATE INDEX "AutoscuolaInstructorBlock_instructorId_startsAt_idx" ON "AutoscuolaInstructorBlock"("instructorId", "startsAt");

-- AddForeignKey
ALTER TABLE "AutoscuolaInstructorBlock" ADD CONSTRAINT "AutoscuolaInstructorBlock_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoscuolaInstructorBlock" ADD CONSTRAINT "AutoscuolaInstructorBlock_instructorId_fkey" FOREIGN KEY ("instructorId") REFERENCES "AutoscuolaInstructor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
