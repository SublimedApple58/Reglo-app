-- AlterTable
ALTER TABLE "RenewalRequest" ADD COLUMN     "resumeToken" TEXT,
ADD COLUMN     "resumeTokenExpiresAt" TIMESTAMP(6);

-- CreateIndex
CREATE UNIQUE INDEX "RenewalRequest_resumeToken_key" ON "RenewalRequest"("resumeToken");

