-- REG-409 (follow-up): luogo di ritrovo delle guide di GRUPPO.
-- Vive sul container (un gruppo = un evento in un posto solo) e viene copiato
-- su ogni posto partecipante, che è un AutoscuolaAppointment e ha già il campo.
-- Additiva e nullable: le guide di gruppo esistenti restano senza luogo, cioè
-- alla sede, esattamente come si comportavano prima.
ALTER TABLE "AutoscuolaGroupLesson"
  ADD COLUMN "locationId" UUID;

ALTER TABLE "AutoscuolaGroupLesson"
  ADD CONSTRAINT "AutoscuolaGroupLesson_locationId_fkey"
  FOREIGN KEY ("locationId") REFERENCES "AutoscuolaLocation"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "AutoscuolaGroupLesson_locationId_idx"
  ON "AutoscuolaGroupLesson"("locationId");
