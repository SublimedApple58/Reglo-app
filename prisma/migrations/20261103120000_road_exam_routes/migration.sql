-- REG-641 Reglo Road: percorsi d'esame dell'autoscuola + giro della prossima guida (solo additiva)

-- CreateTable
CREATE TABLE "RoadExamRoute" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "companyId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "examSite" TEXT,
    "licenseCategories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "waypoints" JSONB NOT NULL,
    "path" JSONB NOT NULL,
    "lengthMeters" INTEGER NOT NULL DEFAULT 0,
    "sourceSessionId" UUID,
    "createdById" UUID,
    "archivedAt" TIMESTAMP(6),
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoadExamRoute_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RoadExamRoute_companyId_archivedAt_idx" ON "RoadExamRoute"("companyId", "archivedAt");

-- AddForeignKey
ALTER TABLE "RoadExamRoute" ADD CONSTRAINT "RoadExamRoute_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "RoadSession" ADD COLUMN "plan" JSONB,
ADD COLUMN "planReached" JSONB;
