-- REG-500: far scrivere su AutoscuolaMessageLog anche i promemoria automatici.
--
-- Finora ruleId e templateId erano obbligatori, quindi solo i messaggi nati da
-- una regola configurata potevano essere registrati. I promemoria (X minuti
-- prima, mattutino, giorno prima, slot liberi) non hanno né regola né template:
-- i loro fallimenti finivano in un console.error e non li vedeva nessuno.
--
-- Tutto additivo: nessuna riga esistente cambia.
ALTER TABLE "AutoscuolaMessageLog" ALTER COLUMN "ruleId" DROP NOT NULL;
ALTER TABLE "AutoscuolaMessageLog" ALTER COLUMN "templateId" DROP NOT NULL;
ALTER TABLE "AutoscuolaMessageLog" ADD COLUMN "kind" TEXT;
ALTER TABLE "AutoscuolaMessageLog" ADD COLUMN "providerMessageId" TEXT;

-- Le righe dei promemoria non hanno ruleId: senza indice, il pannello
-- "ultimi invii" per azienda scansionerebbe la tabella.
CREATE INDEX IF NOT EXISTS "AutoscuolaMessageLog_companyId_sentAt_idx"
  ON "AutoscuolaMessageLog" ("companyId", "sentAt" DESC);
