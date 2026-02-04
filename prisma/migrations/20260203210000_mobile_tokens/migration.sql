-- CreateTable
CREATE TABLE "MobileAccessToken" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "companyId" UUID,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(6),
    "expiresAt" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "MobileAccessToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MobileAccessToken_tokenHash_key" ON "MobileAccessToken"("tokenHash");

-- CreateIndex
CREATE INDEX "MobileAccessToken_userId_idx" ON "MobileAccessToken"("userId");

-- CreateIndex
CREATE INDEX "MobileAccessToken_companyId_idx" ON "MobileAccessToken"("companyId");

-- CreateIndex
CREATE INDEX "MobileAccessToken_expiresAt_idx" ON "MobileAccessToken"("expiresAt");

-- AddForeignKey
ALTER TABLE "MobileAccessToken" ADD CONSTRAINT "MobileAccessToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MobileAccessToken" ADD CONSTRAINT "MobileAccessToken_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
