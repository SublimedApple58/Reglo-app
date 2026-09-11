-- Voce "non valutabile" su una singola guida (seguito di REG-443).
-- Additiva: le righe esistenti restano con score valorizzato e flag false.
-- AlterTable
ALTER TABLE "AutoscuolaAppointmentEvaluation" ADD COLUMN     "notApplicable" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "score" DROP NOT NULL;
