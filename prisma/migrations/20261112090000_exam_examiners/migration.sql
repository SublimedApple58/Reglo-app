-- REG-640: esaminatori dell'esame, nomi liberi di persone esterne. Solo colonna nuova con default.
ALTER TABLE "AutoscuolaAppointment" ADD COLUMN "examiners" TEXT[] DEFAULT ARRAY[]::TEXT[];
