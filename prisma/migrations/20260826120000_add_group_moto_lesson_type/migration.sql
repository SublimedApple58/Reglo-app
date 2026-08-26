-- Structured moto lesson type (birilli vs strada) on GROUP moto lessons (REG-406).
-- Container-level, additive, nullable, no backfill. Mirrors the individual-lesson
-- column added in 20260824164017_add_moto_lesson_type.
ALTER TABLE "AutoscuolaGroupLesson" ADD COLUMN "motoLessonType" TEXT;
