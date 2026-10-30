-- REG-677: ripassi «Meglio / No» sui punti critici dell'allievo (solo additiva).
CREATE TABLE "RoadHotspotCheck" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "companyId" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "studentId" UUID,
    "clientId" TEXT NOT NULL,
    "hotspotKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "outcome" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(6) NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoadHotspotCheck_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RoadHotspotCheck_clientId_key" ON "RoadHotspotCheck"("clientId");

CREATE INDEX "RoadHotspotCheck_sessionId_recordedAt_idx" ON "RoadHotspotCheck"("sessionId", "recordedAt");

CREATE INDEX "RoadHotspotCheck_companyId_studentId_recordedAt_idx" ON "RoadHotspotCheck"("companyId", "studentId", "recordedAt");

ALTER TABLE "RoadHotspotCheck" ADD CONSTRAINT "RoadHotspotCheck_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "RoadSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
