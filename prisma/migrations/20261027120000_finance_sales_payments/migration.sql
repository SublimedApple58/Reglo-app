-- REG-413 fase 4: il pagamento di fisso e commissioni dei sales diventa un
-- movimento vero, legato al sales (fisso) o al contratto (commissione).

-- AlterTable
ALTER TABLE "FinanceEntry" ADD COLUMN "salesAgentId" UUID,
ADD COLUMN "salesDealId" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "FinanceEntry_salesDealId_key" ON "FinanceEntry"("salesDealId");

-- CreateIndex
CREATE INDEX "FinanceEntry_salesAgentId_idx" ON "FinanceEntry"("salesAgentId");

-- AddForeignKey
ALTER TABLE "FinanceEntry" ADD CONSTRAINT "FinanceEntry_salesAgentId_fkey" FOREIGN KEY ("salesAgentId") REFERENCES "SalesAgent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceEntry" ADD CONSTRAINT "FinanceEntry_salesDealId_fkey" FOREIGN KEY ("salesDealId") REFERENCES "SalesDeal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
