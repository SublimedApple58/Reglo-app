-- REG-623: blocco "guida annullata" tolto dall'agenda (solo visivo, additiva).
ALTER TABLE "AutoscuolaAppointment" ADD COLUMN "agendaDismissedAt" TIMESTAMP(6);
ALTER TABLE "AutoscuolaAppointment" ADD COLUMN "agendaDismissedByUserId" UUID;
