-- AlterTable
ALTER TABLE "ConsorzioSchool" ADD COLUMN     "accountingCodeId" UUID;

-- AddForeignKey
ALTER TABLE "ConsorzioSchool" ADD CONSTRAINT "ConsorzioSchool_accountingCodeId_fkey" FOREIGN KEY ("accountingCodeId") REFERENCES "ConsorzioAccountingCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

