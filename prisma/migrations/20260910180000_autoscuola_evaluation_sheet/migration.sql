-- CreateTable
CREATE TABLE "AutoscuolaEvaluationItem" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "companyId" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "scaleMax" INTEGER NOT NULL DEFAULT 5,
    "position" INTEGER NOT NULL,
    "archivedAt" TIMESTAMP(6),
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutoscuolaEvaluationItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutoscuolaAppointmentEvaluation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "appointmentId" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "score" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutoscuolaAppointmentEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AutoscuolaEvaluationItem_companyId_position_idx" ON "AutoscuolaEvaluationItem"("companyId", "position");

-- CreateIndex
CREATE INDEX "AutoscuolaAppointmentEvaluation_itemId_idx" ON "AutoscuolaAppointmentEvaluation"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "AutoscuolaAppointmentEvaluation_appointmentId_itemId_key" ON "AutoscuolaAppointmentEvaluation"("appointmentId", "itemId");

-- AddForeignKey
ALTER TABLE "AutoscuolaEvaluationItem" ADD CONSTRAINT "AutoscuolaEvaluationItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoscuolaAppointmentEvaluation" ADD CONSTRAINT "AutoscuolaAppointmentEvaluation_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "AutoscuolaAppointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoscuolaAppointmentEvaluation" ADD CONSTRAINT "AutoscuolaAppointmentEvaluation_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "AutoscuolaEvaluationItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

