-- CreateEnum
CREATE TYPE "QuizSessionMode" AS ENUM ('EXAM', 'CHAPTER', 'REVIEW');

-- CreateTable
CREATE TABLE "QuizChapter" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "chapterNumber" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuizChapter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuizHint" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "externalId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "descriptionHtml" TEXT NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuizHint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuizQuestion" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "externalId" INTEGER NOT NULL,
    "argumentId" TEXT NOT NULL,
    "chapterId" UUID NOT NULL,
    "hintId" UUID,
    "imageKey" TEXT,
    "questionText" TEXT NOT NULL,
    "correctAnswer" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuizQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuizSession" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "companyId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "mode" "QuizSessionMode" NOT NULL,
    "chapterId" UUID,
    "questionIds" UUID[],
    "status" TEXT NOT NULL DEFAULT 'in_progress',
    "totalQuestions" INTEGER NOT NULL,
    "correctCount" INTEGER NOT NULL DEFAULT 0,
    "wrongCount" INTEGER NOT NULL DEFAULT 0,
    "passed" BOOLEAN,
    "startedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(6),
    "timeLimitSec" INTEGER,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuizSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuizAnswer" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sessionId" UUID NOT NULL,
    "questionId" UUID NOT NULL,
    "studentAnswer" BOOLEAN NOT NULL,
    "isCorrect" BOOLEAN NOT NULL,
    "answeredAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuizAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuizStudentQuestionStat" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "companyId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "questionId" UUID NOT NULL,
    "timesAnswered" INTEGER NOT NULL DEFAULT 0,
    "timesCorrect" INTEGER NOT NULL DEFAULT 0,
    "lastAnsweredAt" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "QuizStudentQuestionStat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "QuizChapter_chapterNumber_key" ON "QuizChapter"("chapterNumber");

-- CreateIndex
CREATE UNIQUE INDEX "QuizHint_externalId_key" ON "QuizHint"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "QuizQuestion_externalId_key" ON "QuizQuestion"("externalId");

-- CreateIndex
CREATE INDEX "QuizQuestion_chapterId_idx" ON "QuizQuestion"("chapterId");

-- CreateIndex
CREATE INDEX "QuizQuestion_hintId_idx" ON "QuizQuestion"("hintId");

-- CreateIndex
CREATE INDEX "QuizQuestion_argumentId_idx" ON "QuizQuestion"("argumentId");

-- CreateIndex
CREATE INDEX "QuizSession_companyId_studentId_idx" ON "QuizSession"("companyId", "studentId");

-- CreateIndex
CREATE INDEX "QuizSession_companyId_studentId_mode_idx" ON "QuizSession"("companyId", "studentId", "mode");

-- CreateIndex
CREATE INDEX "QuizSession_studentId_status_idx" ON "QuizSession"("studentId", "status");

-- CreateIndex
CREATE INDEX "QuizAnswer_sessionId_idx" ON "QuizAnswer"("sessionId");

-- CreateIndex
CREATE INDEX "QuizAnswer_questionId_idx" ON "QuizAnswer"("questionId");

-- CreateIndex
CREATE INDEX "QuizStudentQuestionStat_companyId_studentId_idx" ON "QuizStudentQuestionStat"("companyId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "QuizStudentQuestionStat_companyId_studentId_questionId_key" ON "QuizStudentQuestionStat"("companyId", "studentId", "questionId");

-- AddForeignKey
ALTER TABLE "QuizQuestion" ADD CONSTRAINT "QuizQuestion_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "QuizChapter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizQuestion" ADD CONSTRAINT "QuizQuestion_hintId_fkey" FOREIGN KEY ("hintId") REFERENCES "QuizHint"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizSession" ADD CONSTRAINT "QuizSession_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizSession" ADD CONSTRAINT "QuizSession_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizSession" ADD CONSTRAINT "QuizSession_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "QuizChapter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizAnswer" ADD CONSTRAINT "QuizAnswer_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "QuizSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizAnswer" ADD CONSTRAINT "QuizAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "QuizQuestion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizStudentQuestionStat" ADD CONSTRAINT "QuizStudentQuestionStat_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "QuizQuestion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
