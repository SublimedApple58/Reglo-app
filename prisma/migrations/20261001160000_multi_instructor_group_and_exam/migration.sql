-- REG-585 — più istruttori sulla stessa guida di gruppo o esame.
--
-- `instructorId` resta sulle tabelle esistenti e continua a significare
-- "istruttore PRINCIPALE" (notifiche, guard "solo le tue guide"): non viene
-- toccato, così tutto il codice che già lo legge continua a funzionare.
-- Qui ci finiscono solo i colleghi AGGIUNTIVI.
--
-- Migrazione additiva: nessuna colonna rimossa, nessun dato riscritto.

CREATE TABLE "AutoscuolaAppointmentInstructor" (
    "appointmentId" UUID NOT NULL,
    "instructorId"  UUID NOT NULL,
    CONSTRAINT "AutoscuolaAppointmentInstructor_pkey" PRIMARY KEY ("appointmentId", "instructorId")
);

CREATE TABLE "AutoscuolaGroupLessonInstructor" (
    "groupLessonId" UUID NOT NULL,
    "instructorId"  UUID NOT NULL,
    CONSTRAINT "AutoscuolaGroupLessonInstructor_pkey" PRIMARY KEY ("groupLessonId", "instructorId")
);

-- L'indice sull'istruttore serve alla query che fa comparire al collega le
-- guide condivise ("quali guide ho, anche da aggiunto?").
CREATE INDEX "AutoscuolaAppointmentInstructor_instructorId_idx" ON "AutoscuolaAppointmentInstructor"("instructorId");
CREATE INDEX "AutoscuolaGroupLessonInstructor_instructorId_idx" ON "AutoscuolaGroupLessonInstructor"("instructorId");

ALTER TABLE "AutoscuolaAppointmentInstructor"
  ADD CONSTRAINT "AutoscuolaAppointmentInstructor_appointmentId_fkey"
  FOREIGN KEY ("appointmentId") REFERENCES "AutoscuolaAppointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AutoscuolaAppointmentInstructor"
  ADD CONSTRAINT "AutoscuolaAppointmentInstructor_instructorId_fkey"
  FOREIGN KEY ("instructorId") REFERENCES "AutoscuolaInstructor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AutoscuolaGroupLessonInstructor"
  ADD CONSTRAINT "AutoscuolaGroupLessonInstructor_groupLessonId_fkey"
  FOREIGN KEY ("groupLessonId") REFERENCES "AutoscuolaGroupLesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AutoscuolaGroupLessonInstructor"
  ADD CONSTRAINT "AutoscuolaGroupLessonInstructor_instructorId_fkey"
  FOREIGN KEY ("instructorId") REFERENCES "AutoscuolaInstructor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
