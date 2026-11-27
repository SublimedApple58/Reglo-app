-- REG-802: disponibilità allievo confermate dall'app + rinvio dello step.
-- Solo colonne nullable: nessun effetto sulle righe esistenti.
ALTER TABLE "CompanyMember" ADD COLUMN "availabilityConfirmedAt" TIMESTAMP(6);
ALTER TABLE "CompanyMember" ADD COLUMN "availabilityPromptSnoozedUntil" TIMESTAMP(6);
