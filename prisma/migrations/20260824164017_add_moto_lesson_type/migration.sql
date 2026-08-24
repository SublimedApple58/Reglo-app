-- Structured moto lesson type (birilli vs strada) on individual moto lessons.
-- Additive, nullable, no backfill.
ALTER TABLE "AutoscuolaAppointment" ADD COLUMN "motoLessonType" TEXT;
