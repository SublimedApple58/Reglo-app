-- CreateTable
CREATE TABLE "ConsorzioCourseBilling" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "consorzioCompanyId" UUID NOT NULL,
    "schoolId" UUID NOT NULL,
    "studentUserId" UUID NOT NULL,
    "licenseCategory" TEXT NOT NULL,
    "priceAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "billingMonth" TEXT NOT NULL,
    "settledAt" TIMESTAMP(6),
    "invoiceSentAt" TIMESTAMP(6),
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConsorzioCourseBilling_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConsorzioCourseBilling_consorzioCompanyId_billingMonth_idx" ON "ConsorzioCourseBilling"("consorzioCompanyId", "billingMonth");

-- CreateIndex
CREATE UNIQUE INDEX "ConsorzioCourseBilling_consorzioCompanyId_studentUserId_lic_key" ON "ConsorzioCourseBilling"("consorzioCompanyId", "studentUserId", "licenseCategory");

-- AddForeignKey
ALTER TABLE "ConsorzioCourseBilling" ADD CONSTRAINT "ConsorzioCourseBilling_consorzioCompanyId_fkey" FOREIGN KEY ("consorzioCompanyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsorzioCourseBilling" ADD CONSTRAINT "ConsorzioCourseBilling_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "ConsorzioSchool"("id") ON DELETE CASCADE ON UPDATE CASCADE;

