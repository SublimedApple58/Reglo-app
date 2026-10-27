-- CreateTable
CREATE TABLE "RoadSession" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "companyId" UUID NOT NULL,
    "appointmentId" UUID NOT NULL,
    "instructorId" UUID,
    "studentId" UUID,
    "vehicleId" UUID,
    "status" TEXT NOT NULL DEFAULT 'active',
    "startedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(6),
    "distanceMeters" INTEGER NOT NULL DEFAULT 0,
    "durationSec" INTEGER NOT NULL DEFAULT 0,
    "pointCount" INTEGER NOT NULL DEFAULT 0,
    "lastSeq" INTEGER NOT NULL DEFAULT -1,
    "lastLat" DOUBLE PRECISION,
    "lastLng" DOUBLE PRECISION,
    "lastSpeed" DOUBLE PRECISION,
    "lastHeading" DOUBLE PRECISION,
    "lastStreet" TEXT,
    "lastPointAt" TIMESTAMP(6),
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoadSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoadPointBatch" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sessionId" UUID NOT NULL,
    "seq" INTEGER NOT NULL,
    "points" JSONB NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoadPointBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoadMarker" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sessionId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "clientId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "note" TEXT,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "street" TEXT,
    "recordedAt" TIMESTAMP(6) NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoadMarker_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RoadSession_appointmentId_key" ON "RoadSession"("appointmentId");

-- CreateIndex
CREATE INDEX "RoadSession_companyId_status_idx" ON "RoadSession"("companyId", "status");

-- CreateIndex
CREATE INDEX "RoadSession_companyId_startedAt_idx" ON "RoadSession"("companyId", "startedAt");

-- CreateIndex
CREATE INDEX "RoadSession_studentId_startedAt_idx" ON "RoadSession"("studentId", "startedAt");

-- CreateIndex
CREATE INDEX "RoadSession_status_startedAt_idx" ON "RoadSession"("status", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RoadPointBatch_sessionId_seq_key" ON "RoadPointBatch"("sessionId", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "RoadMarker_clientId_key" ON "RoadMarker"("clientId");

-- CreateIndex
CREATE INDEX "RoadMarker_sessionId_recordedAt_idx" ON "RoadMarker"("sessionId", "recordedAt");

-- CreateIndex
CREATE INDEX "RoadMarker_companyId_kind_idx" ON "RoadMarker"("companyId", "kind");

-- AddForeignKey
ALTER TABLE "RoadSession" ADD CONSTRAINT "RoadSession_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoadSession" ADD CONSTRAINT "RoadSession_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "AutoscuolaAppointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoadPointBatch" ADD CONSTRAINT "RoadPointBatch_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "RoadSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoadMarker" ADD CONSTRAINT "RoadMarker_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "RoadSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

