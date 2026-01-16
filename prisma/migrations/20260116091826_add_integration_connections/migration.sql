-- CreateEnum
CREATE TYPE "IntegrationProvider" AS ENUM ('SLACK', 'FATTURE_IN_CLOUD');

-- CreateTable
CREATE TABLE "IntegrationConnection" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "companyId" UUID NOT NULL,
    "provider" "IntegrationProvider" NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'connected',
    "externalAccountId" TEXT,
    "displayName" TEXT,
    "scope" TEXT,
    "accessTokenCiphertext" TEXT,
    "accessTokenIv" TEXT,
    "accessTokenTag" TEXT,
    "refreshTokenCiphertext" TEXT,
    "refreshTokenIv" TEXT,
    "refreshTokenTag" TEXT,
    "expiresAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationConnection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IntegrationConnection_provider_idx" ON "IntegrationConnection"("provider");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationConnection_companyId_provider_key" ON "IntegrationConnection"("companyId", "provider");

-- AddForeignKey
ALTER TABLE "IntegrationConnection" ADD CONSTRAINT "IntegrationConnection_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
