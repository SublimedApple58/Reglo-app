-- REG-699: rientro stimato dal telefono durante la guida (vista «Dal vivo»). Solo additiva.
ALTER TABLE "RoadSession" ADD COLUMN "lastEtaAt" TIMESTAMP(6);
