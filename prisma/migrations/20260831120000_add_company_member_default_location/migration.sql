-- REG-392: default driving-lesson location per student (CompanyMember).
-- Additive, nullable, no backfill. onDelete: SetNull mirrors the Prisma relation.

-- AlterTable
ALTER TABLE "CompanyMember" ADD COLUMN "defaultLocationId" UUID;

-- AddForeignKey
ALTER TABLE "CompanyMember" ADD CONSTRAINT "CompanyMember_defaultLocationId_fkey" FOREIGN KEY ("defaultLocationId") REFERENCES "AutoscuolaLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
