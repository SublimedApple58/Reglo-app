-- CreateTable
CREATE TABLE "FinanceCategory" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "group" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(6),
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceEntry" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "date" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "categoryId" UUID NOT NULL,
    "direction" TEXT NOT NULL,
    "nature" TEXT NOT NULL DEFAULT 'one_off',
    "amountCents" INTEGER NOT NULL,
    "vatRateBps" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'settled',
    "settledOn" DATE,
    "companyId" UUID,
    "invoiceNumber" TEXT,
    "recurringExpenseId" UUID,
    "notes" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecurringExpense" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "categoryId" UUID NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "vatRateBps" INTEGER,
    "cadence" TEXT NOT NULL,
    "startsOn" DATE NOT NULL,
    "endsOn" DATE,
    "dayOfMonth" INTEGER NOT NULL DEFAULT 1,
    "notes" TEXT,
    "archivedAt" TIMESTAMP(6),
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecurringExpense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesAgent" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "email" TEXT,
    "monthlyFixedCents" INTEGER NOT NULL DEFAULT 0,
    "defaultCommissionBps" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(6),
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesAgent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesDeal" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "companyId" UUID,
    "companyName" TEXT NOT NULL,
    "agentId" UUID NOT NULL,
    "closedOn" DATE NOT NULL,
    "contractValueCents" INTEGER NOT NULL,
    "commissionBps" INTEGER NOT NULL,
    "commissionCents" INTEGER NOT NULL,
    "paidOn" DATE,
    "notes" TEXT,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesDeal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyCommercial" (
    "companyId" UUID NOT NULL,
    "vatNumber" TEXT,
    "region" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "acquiredOn" DATE,
    "churnedOn" DATE,
    "agentId" UUID,
    "notes" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyCommercial_pkey" PRIMARY KEY ("companyId")
);

-- CreateTable
CREATE TABLE "FinanceSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "openingBalanceCents" INTEGER,
    "openingDate" DATE,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FinanceCategory_name_direction_key" ON "FinanceCategory"("name", "direction");

-- CreateIndex
CREATE INDEX "FinanceEntry_date_idx" ON "FinanceEntry"("date");

-- CreateIndex
CREATE INDEX "FinanceEntry_settledOn_idx" ON "FinanceEntry"("settledOn");

-- CreateIndex
CREATE INDEX "FinanceEntry_companyId_idx" ON "FinanceEntry"("companyId");

-- CreateIndex
CREATE INDEX "FinanceEntry_recurringExpenseId_idx" ON "FinanceEntry"("recurringExpenseId");

-- CreateIndex
CREATE INDEX "SalesDeal_closedOn_idx" ON "SalesDeal"("closedOn");

-- CreateIndex
CREATE INDEX "SalesDeal_agentId_idx" ON "SalesDeal"("agentId");

-- AddForeignKey
ALTER TABLE "FinanceEntry" ADD CONSTRAINT "FinanceEntry_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "FinanceCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceEntry" ADD CONSTRAINT "FinanceEntry_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceEntry" ADD CONSTRAINT "FinanceEntry_recurringExpenseId_fkey" FOREIGN KEY ("recurringExpenseId") REFERENCES "RecurringExpense"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringExpense" ADD CONSTRAINT "RecurringExpense_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "FinanceCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesDeal" ADD CONSTRAINT "SalesDeal_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesDeal" ADD CONSTRAINT "SalesDeal_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "SalesAgent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyCommercial" ADD CONSTRAINT "CompanyCommercial_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyCommercial" ADD CONSTRAINT "CompanyCommercial_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "SalesAgent"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Categorie di partenza (REG-413). Si possono archiviare o aggiungere dalla sezione.
INSERT INTO "FinanceCategory" ("name", "direction", "group", "sortOrder") VALUES
    ('Canoni autoscuole', 'in', NULL, 10),
    ('Licenze e una tantum', 'in', NULL, 20),
    ('Altre entrate', 'in', NULL, 90),
    ('Stipendi e compensi', 'out', 'persone', 10),
    ('Commissioni sales', 'out', 'persone', 20),
    ('Software e infrastruttura', 'out', 'software', 30),
    ('Marketing', 'out', 'marketing', 40),
    ('Consulenze', 'out', 'consulenze', 50),
    ('Tasse e contributi', 'out', 'tasse', 60),
    ('Versamenti IVA', 'out', 'iva', 70),
    ('Banca e pagamenti', 'out', 'altro', 80),
    ('Altre spese', 'out', 'altro', 90)
ON CONFLICT ("name", "direction") DO NOTHING;

-- Partenza da ottobre 2026 (decisione di Tiziano). Il saldo iniziale resta
-- vuoto finché non lo inserisce lui: nessun numero di esempio.
INSERT INTO "FinanceSettings" ("id", "openingDate", "updatedAt") VALUES ('default', '2026-10-01', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
