-- REG-706: codice di invito per luogo (additiva, nessun backfill: si genera
-- alla prima apertura del modale «Chiave di accesso»).
ALTER TABLE "AutoscuolaLocation" ADD COLUMN "inviteCode" TEXT;

CREATE UNIQUE INDEX "AutoscuolaLocation_inviteCode_key" ON "AutoscuolaLocation"("inviteCode");
