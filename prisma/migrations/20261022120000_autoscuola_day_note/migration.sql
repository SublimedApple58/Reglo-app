-- REG-632: nota del giorno dell'agenda (additiva).
CREATE TABLE "AutoscuolaDayNote" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "companyId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "text" TEXT NOT NULL,
    "createdBy" UUID,
    "updatedBy" UUID,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "AutoscuolaDayNote_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AutoscuolaDayNote_companyId_date_key" ON "AutoscuolaDayNote"("companyId", "date");

ALTER TABLE "AutoscuolaDayNote" ADD CONSTRAINT "AutoscuolaDayNote_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
