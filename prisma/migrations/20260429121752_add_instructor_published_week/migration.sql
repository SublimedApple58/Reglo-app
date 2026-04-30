-- CreateTable
CREATE TABLE "AutoscuolaInstructorPublishedWeek" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "companyId" UUID NOT NULL,
    "instructorId" UUID NOT NULL,
    "weekStart" DATE NOT NULL,
    "publishedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutoscuolaInstructorPublishedWeek_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AutoscuolaInstructorPublishedWeek_companyId_instructorId_idx" ON "AutoscuolaInstructorPublishedWeek"("companyId", "instructorId");

-- CreateIndex
CREATE UNIQUE INDEX "AutoscuolaInstructorPublishedWeek_companyId_instructorId_we_key" ON "AutoscuolaInstructorPublishedWeek"("companyId", "instructorId", "weekStart");

-- AddForeignKey
ALTER TABLE "AutoscuolaInstructorPublishedWeek" ADD CONSTRAINT "AutoscuolaInstructorPublishedWeek_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoscuolaInstructorPublishedWeek" ADD CONSTRAINT "AutoscuolaInstructorPublishedWeek_instructorId_fkey" FOREIGN KEY ("instructorId") REFERENCES "AutoscuolaInstructor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
