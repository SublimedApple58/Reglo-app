-- REG-668: giro modificato di una guida futura (solo additiva).
CREATE TABLE "RoadLessonPlan" (
    "appointmentId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "stops" JSONB NOT NULL,
    "minutes" INTEGER NOT NULL DEFAULT 0,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoadLessonPlan_pkey" PRIMARY KEY ("appointmentId")
);

CREATE INDEX "RoadLessonPlan_companyId_idx" ON "RoadLessonPlan"("companyId");

ALTER TABLE "RoadLessonPlan" ADD CONSTRAINT "RoadLessonPlan_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RoadLessonPlan" ADD CONSTRAINT "RoadLessonPlan_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "AutoscuolaAppointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
