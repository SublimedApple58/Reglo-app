-- REG-725: cambio per patente su ogni luogo ({ "B": "automatic" }).
-- Patente assente nella mappa = entrambi i cambi: i dati esistenti valgono
-- «entrambi», che è il loro significato di oggi. Solo additiva, nessun backfill.
ALTER TABLE "AutoscuolaLocation"
  ADD COLUMN "licenseTransmissions" JSONB NOT NULL DEFAULT '{}';
