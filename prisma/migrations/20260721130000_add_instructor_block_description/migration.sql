-- Add optional free-text description to instructor blocks (used e.g. by theory lessons).
ALTER TABLE "AutoscuolaInstructorBlock" ADD COLUMN "description" TEXT;
