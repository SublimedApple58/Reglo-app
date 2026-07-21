-- CreateTable
CREATE TABLE "NewsFeedback" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "companyId" UUID,
    "userId" UUID,
    "userName" TEXT,
    "type" TEXT NOT NULL,
    "modules" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NewsFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NewsFeedback_type_idx" ON "NewsFeedback"("type");

-- CreateIndex
CREATE INDEX "NewsFeedback_createdAt_idx" ON "NewsFeedback"("createdAt");
