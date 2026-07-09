-- CreateTable
CREATE TABLE "CompanyPlan" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "companyId" UUID NOT NULL,
    "billingPeriod" TEXT NOT NULL DEFAULT 'annual',
    "renewsAt" TIMESTAMP(6),
    "instructorSeats" INTEGER NOT NULL DEFAULT 1,
    "instructorSeatPriceCents" INTEGER NOT NULL DEFAULT 0,
    "teoriaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "teoriaSeats" INTEGER NOT NULL DEFAULT 0,
    "teoriaPriceCents" INTEGER NOT NULL DEFAULT 0,
    "voiceEnabled" BOOLEAN NOT NULL DEFAULT false,
    "voicePriceCents" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyPlan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CompanyPlan_companyId_key" ON "CompanyPlan"("companyId");

-- AddForeignKey
ALTER TABLE "CompanyPlan" ADD CONSTRAINT "CompanyPlan_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
