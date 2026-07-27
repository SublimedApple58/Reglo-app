-- Internal "pronto per l'esame" flag on students (non-binding, PRATICA only).
-- AlterTable
ALTER TABLE "CompanyMember" ADD COLUMN "examReady" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CompanyMember" ADD COLUMN "examReadyAt" TIMESTAMP(3);
ALTER TABLE "CompanyMember" ADD COLUMN "examReadyBy" UUID;

-- CreateIndex
CREATE INDEX "CompanyMember_companyId_examReady_idx" ON "CompanyMember"("companyId", "examReady");
