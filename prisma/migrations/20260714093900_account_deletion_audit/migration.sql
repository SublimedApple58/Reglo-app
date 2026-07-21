-- CreateTable
CREATE TABLE "AccountDeletionAudit" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "deletedUserId" UUID NOT NULL,
    "trigger" TEXT NOT NULL,
    "actorUserId" UUID,
    "companyId" UUID,
    "lessonsCancelled" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountDeletionAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AccountDeletionAudit_createdAt_idx" ON "AccountDeletionAudit"("createdAt");

-- CreateIndex
CREATE INDEX "AccountDeletionAudit_trigger_idx" ON "AccountDeletionAudit"("trigger");

-- CreateIndex
CREATE INDEX "AccountDeletionAudit_deletedUserId_idx" ON "AccountDeletionAudit"("deletedUserId");
