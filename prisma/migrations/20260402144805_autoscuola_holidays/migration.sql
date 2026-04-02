-- CreateTable
CREATE TABLE "AutoscuolaHoliday" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "companyId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "label" TEXT,
    "createdBy" UUID,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutoscuolaHoliday_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AutoscuolaHoliday_companyId_date_idx" ON "AutoscuolaHoliday"("companyId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "AutoscuolaHoliday_companyId_date_key" ON "AutoscuolaHoliday"("companyId", "date");

-- AddForeignKey
ALTER TABLE "AutoscuolaHoliday" ADD CONSTRAINT "AutoscuolaHoliday_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
