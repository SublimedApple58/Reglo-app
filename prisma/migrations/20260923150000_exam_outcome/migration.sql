-- Esito esame (idoneo | respinto) sulla riga dell'appuntamento.
-- Un esame è già una riga per allievo, quindi l'esito è naturalmente per
-- partecipante e un esame ripetuto conserva il proprio esito precedente.
ALTER TABLE "AutoscuolaAppointment"
  ADD COLUMN "examOutcome" TEXT,
  ADD COLUMN "examOutcomeAt" TIMESTAMP(6),
  ADD COLUMN "examOutcomeByUserId" UUID;

-- Numero di patente sull'ALLIEVO: è un attributo della persona, non dell'esame.
ALTER TABLE "CompanyMember"
  ADD COLUMN "licenseNumber" TEXT,
  ADD COLUMN "licenseObtainedAt" TIMESTAMP(6);
