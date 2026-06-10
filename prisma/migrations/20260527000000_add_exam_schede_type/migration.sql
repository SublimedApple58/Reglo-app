-- AlterEnum
ALTER TYPE "QuizSessionMode" ADD VALUE 'SCHEDA_ESAME';

-- AlterTable: add type column with default, make chapterId nullable
ALTER TABLE "QuizScheda" ADD COLUMN "type" TEXT NOT NULL DEFAULT 'CHAPTER';
ALTER TABLE "QuizScheda" ALTER COLUMN "chapterId" DROP NOT NULL;

-- DropForeignKey (will re-add as optional)
ALTER TABLE "QuizScheda" DROP CONSTRAINT "QuizScheda_chapterId_fkey";

-- AddForeignKey (optional)
ALTER TABLE "QuizScheda" ADD CONSTRAINT "QuizScheda_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "QuizChapter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Drop old unique constraint
DROP INDEX "QuizScheda_chapterId_schedaNumber_key";

-- Create new composite unique for CHAPTER schede (chapterId is NOT NULL)
CREATE UNIQUE INDEX "QuizScheda_type_chapterId_schedaNumber_key" ON "QuizScheda"("type", "chapterId", "schedaNumber");

-- Create partial unique index for EXAM schede (chapterId IS NULL)
CREATE UNIQUE INDEX "QuizScheda_exam_schedaNumber_key" ON "QuizScheda"("schedaNumber") WHERE "type" = 'EXAM';

-- CreateIndex for type
CREATE INDEX "QuizScheda_type_idx" ON "QuizScheda"("type");
