-- CreateTable
CREATE TABLE "MobilePushDevice" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "companyId" UUID,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "deviceId" TEXT,
    "appVersion" TEXT,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL,
    "lastSeenAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disabledAt" TIMESTAMP(6),

    CONSTRAINT "MobilePushDevice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MobilePushDevice_token_key" ON "MobilePushDevice"("token");

-- CreateIndex
CREATE INDEX "MobilePushDevice_userId_idx" ON "MobilePushDevice"("userId");

-- CreateIndex
CREATE INDEX "MobilePushDevice_companyId_idx" ON "MobilePushDevice"("companyId");

-- CreateIndex
CREATE INDEX "MobilePushDevice_disabledAt_idx" ON "MobilePushDevice"("disabledAt");

-- AddForeignKey
ALTER TABLE "MobilePushDevice" ADD CONSTRAINT "MobilePushDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MobilePushDevice" ADD CONSTRAINT "MobilePushDevice_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
