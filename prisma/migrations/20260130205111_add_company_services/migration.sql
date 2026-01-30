-- CreateEnum
CREATE TYPE "ServiceKey" AS ENUM ('DOC_MANAGER', 'WORKFLOWS', 'AI_ASSISTANT', 'AUTOSCUOLE');

-- CreateEnum
CREATE TYPE "CompanyServiceStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateTable
CREATE TABLE "CompanyService" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "companyId" UUID NOT NULL,
    "serviceKey" "ServiceKey" NOT NULL,
    "status" "CompanyServiceStatus" NOT NULL DEFAULT 'ACTIVE',
    "limits" JSON,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyService_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompanyService_companyId_idx" ON "CompanyService"("companyId");

-- CreateIndex
CREATE INDEX "CompanyService_serviceKey_idx" ON "CompanyService"("serviceKey");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyService_companyId_serviceKey_key" ON "CompanyService"("companyId", "serviceKey");

-- AddForeignKey
ALTER TABLE "CompanyService" ADD CONSTRAINT "CompanyService_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
