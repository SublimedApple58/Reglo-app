-- Road novembre R7: segnalazione su un punto preciso o su una zona.
-- Additiva: null = punto (tutte le segnalazioni esistenti restano punti).
ALTER TABLE "RoadMarker" ADD COLUMN "shape" TEXT;
ALTER TABLE "RoadMarker" ADD COLUMN "radiusM" INTEGER;
