-- Road novembre R7 (solo aggiunte): segnalazione «zona» = tratto della strada percorsa.
-- extentM: 50 | 100 | 200 (null = punto). extent: il tratto [lat, lng][] ricavato dalla traccia.
ALTER TABLE "RoadMarker" ADD COLUMN "extentM" INTEGER;
ALTER TABLE "RoadMarker" ADD COLUMN "extent" JSONB;
