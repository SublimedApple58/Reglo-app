-- AlterTable
ALTER TABLE "AutoscuolaInstructor" ADD COLUMN     "autonomousMode" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "settings" JSON;

-- AlterTable
ALTER TABLE "CompanyMember" ADD COLUMN     "assignedInstructorId" UUID;

-- CreateIndex
CREATE INDEX "CompanyMember_assignedInstructorId_idx" ON "CompanyMember"("assignedInstructorId");

-- AddForeignKey
ALTER TABLE "CompanyMember" ADD CONSTRAINT "CompanyMember_assignedInstructorId_fkey" FOREIGN KEY ("assignedInstructorId") REFERENCES "AutoscuolaInstructor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
