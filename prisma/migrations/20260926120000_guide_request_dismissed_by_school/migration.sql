-- L'autoscuola consorziata può togliere dalla PROPRIA agenda una richiesta
-- ormai chiusa (rifiutata o annullata). Additiva e nullable: le righe esistenti
-- restano visibili, e il consorzio continua a vederle comunque.
ALTER TABLE "ConsorzioGuideRequest" ADD COLUMN "dismissedBySchoolAt" TIMESTAMP(6);
