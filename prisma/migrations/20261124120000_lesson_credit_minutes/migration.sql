-- AlterTable
ALTER TABLE "AutoscuolaAppointment" ADD COLUMN     "creditAmount" INTEGER,
ADD COLUMN     "creditUnit" TEXT;

-- AlterTable
ALTER TABLE "AutoscuolaStudentLessonCreditBalance" ADD COLUMN     "unit" TEXT NOT NULL DEFAULT 'lessons';

-- AlterTable
ALTER TABLE "AutoscuolaStudentLessonCreditLedger" ADD COLUMN     "unit" TEXT NOT NULL DEFAULT 'lessons';

-- CreateTable
CREATE TABLE "AutoscuolaCreditUnitSwitch" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "companyId" UUID NOT NULL,
    "fromUnit" TEXT NOT NULL,
    "toUnit" TEXT NOT NULL,
    "minutesPerLesson" INTEGER NOT NULL,
    "remainderPolicy" TEXT,
    "studentsCount" INTEGER NOT NULL DEFAULT 0,
    "actorUserId" UUID,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutoscuolaCreditUnitSwitch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AutoscuolaCreditUnitSwitch_companyId_createdAt_idx" ON "AutoscuolaCreditUnitSwitch"("companyId", "createdAt");

-- AddForeignKey
ALTER TABLE "AutoscuolaCreditUnitSwitch" ADD CONSTRAINT "AutoscuolaCreditUnitSwitch_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoscuolaCreditUnitSwitch" ADD CONSTRAINT "AutoscuolaCreditUnitSwitch_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

