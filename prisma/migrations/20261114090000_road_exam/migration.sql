-- R4 Road Exam (solo aggiunte): sessione in modalità esame e percorsi d'esame per esaminatore.
ALTER TABLE "RoadSession" ADD COLUMN "mode" TEXT NOT NULL DEFAULT 'lesson';
ALTER TABLE "RoadSession" ADD COLUMN "examiners" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "RoadSession" ADD COLUMN "startedById" UUID;
CREATE INDEX "RoadSession_companyId_startedById_status_idx" ON "RoadSession"("companyId", "startedById", "status");

ALTER TABLE "RoadExamRoute" ADD COLUMN "examiners" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "RoadExamRoute" ADD COLUMN "origin" TEXT NOT NULL DEFAULT 'drawn';
ALTER TABLE "RoadExamRoute" ADD COLUMN "examAt" TIMESTAMP(6);
