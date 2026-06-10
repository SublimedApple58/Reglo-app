-- AlterEnum
ALTER TYPE "QuizSessionMode" ADD VALUE 'SCHEDA';

-- AlterTable
ALTER TABLE "QuizSession" ADD COLUMN     "schedaId" UUID;

-- CreateTable
CREATE TABLE "QuizScheda" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "chapterId" UUID NOT NULL,
    "schedaNumber" INTEGER NOT NULL,
    "questionIds" UUID[],
    "totalQuestions" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuizScheda_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QuizScheda_chapterId_idx" ON "QuizScheda"("chapterId");

-- CreateIndex
CREATE UNIQUE INDEX "QuizScheda_chapterId_schedaNumber_key" ON "QuizScheda"("chapterId", "schedaNumber");

-- CreateIndex
CREATE INDEX "QuizSession_companyId_studentId_schedaId_idx" ON "QuizSession"("companyId", "studentId", "schedaId");

-- AddForeignKey
ALTER TABLE "QuizScheda" ADD CONSTRAINT "QuizScheda_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "QuizChapter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizSession" ADD CONSTRAINT "QuizSession_schedaId_fkey" FOREIGN KEY ("schedaId") REFERENCES "QuizScheda"("id") ON DELETE SET NULL ON UPDATE CASCADE;
