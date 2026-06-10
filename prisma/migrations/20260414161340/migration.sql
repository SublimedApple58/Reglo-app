-- CreateTable
CREATE TABLE "AutoscuolaStudentWeeklyAbsence" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "companyId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "instructorId" UUID NOT NULL,
    "weekStart" DATE NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutoscuolaStudentWeeklyAbsence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AutoscuolaStudentWeeklyAbsence_companyId_instructorId_weekS_idx" ON "AutoscuolaStudentWeeklyAbsence"("companyId", "instructorId", "weekStart");

-- CreateIndex
CREATE UNIQUE INDEX "AutoscuolaStudentWeeklyAbsence_companyId_studentId_weekStar_key" ON "AutoscuolaStudentWeeklyAbsence"("companyId", "studentId", "weekStart");

-- AddForeignKey
ALTER TABLE "AutoscuolaStudentWeeklyAbsence" ADD CONSTRAINT "AutoscuolaStudentWeeklyAbsence_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoscuolaStudentWeeklyAbsence" ADD CONSTRAINT "AutoscuolaStudentWeeklyAbsence_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoscuolaStudentWeeklyAbsence" ADD CONSTRAINT "AutoscuolaStudentWeeklyAbsence_instructorId_fkey" FOREIGN KEY ("instructorId") REFERENCES "AutoscuolaInstructor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
