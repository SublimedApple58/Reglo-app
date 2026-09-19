-- REG-442 — blocco prenotazioni in bulk con scadenza opzionale.
-- Colonna additiva e nullable: i blocchi esistenti restano indefiniti (NULL).
-- Nessun indice: la scadenza si legge sempre insieme alla riga del membro
-- (sweep scoped per company) o una volta a notte dal cron.
ALTER TABLE "CompanyMember" ADD COLUMN "bookingBlockUntil" TIMESTAMP(3);
