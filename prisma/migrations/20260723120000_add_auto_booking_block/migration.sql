-- Blocco automatico prenotazioni per debito allievo.
-- Origine del blocco (manuale del titolare vs automatico per soglia) + watermark
-- anti-conflitto per lo sblocco manuale di un blocco automatico.
-- AlterTable
ALTER TABLE "CompanyMember" ADD COLUMN "bookingBlockReason" TEXT;
ALTER TABLE "CompanyMember" ADD COLUMN "unpaidBlockClearedAtCount" INTEGER;
