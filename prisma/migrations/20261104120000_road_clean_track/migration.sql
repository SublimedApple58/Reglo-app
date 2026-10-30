-- REG-665: traccia pulita e agganciata alla strada + soste
ALTER TABLE "RoadSession" ADD COLUMN "cleanTrack" JSONB;
