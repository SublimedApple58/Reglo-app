-- REG-758: avviso «guida fissata» all'allievo (coda raggruppata).
ALTER TABLE "AutoscuolaAppointment" ADD COLUMN "creationNotice" TEXT;

CREATE INDEX "AutoscuolaAppointment_creationNotice_idx" ON "AutoscuolaAppointment"("creationNotice");
