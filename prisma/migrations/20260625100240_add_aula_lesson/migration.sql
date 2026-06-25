-- CreateTable
CREATE TABLE "AulaLesson" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "companyId" UUID,
    "chapterId" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isTemplate" BOOLEAN NOT NULL DEFAULT false,
    "sourceLessonId" UUID,
    "packageR2Key" TEXT NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AulaLesson_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AulaLesson_companyId_idx" ON "AulaLesson"("companyId");

-- CreateIndex
CREATE INDEX "AulaLesson_chapterId_idx" ON "AulaLesson"("chapterId");

-- CreateIndex
CREATE INDEX "AulaLesson_isTemplate_idx" ON "AulaLesson"("isTemplate");
