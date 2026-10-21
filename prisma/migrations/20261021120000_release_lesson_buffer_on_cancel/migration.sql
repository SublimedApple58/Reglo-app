-- REG-628: annullando una guida si libera la sua pausa automatica (REG-484).
--
-- La pausa è un blocco istruttore `reason = 'lesson_buffer'` che parte
-- esattamente alla fine della guida. Le guide si annullano da troppe strade
-- (app allievo, segreteria, cambia stato, istruttore da app, annullamenti
-- operativi e di massa, festivi, job Trigger.dev, cancellazione account):
-- il trigger le copre tutte, anche quelle future.
--
-- Si tocca SOLO quella pausa: mai i blocchi messi a mano (altro `reason`),
-- e mai se un'altra guida attiva dello stesso istruttore finisce alla stessa
-- ora (il sostituto che l'ha riusata, fix aa25e00).
CREATE OR REPLACE FUNCTION "autoscuola_release_lesson_buffer"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."instructorId" IS NULL OR OLD."endsAt" IS NULL THEN
    RETURN NULL;
  END IF;
  -- Già annullata: la pausa era già stata liberata (o è del sostituto).
  IF lower(OLD."status") = 'cancelled' THEN
    RETURN NULL;
  END IF;
  IF TG_OP = 'UPDATE' AND lower(NEW."status") <> 'cancelled' THEN
    RETURN NULL;
  END IF;

  DELETE FROM "AutoscuolaInstructorBlock" b
  WHERE b."companyId" = OLD."companyId"
    AND b."instructorId" = OLD."instructorId"
    AND b."reason" = 'lesson_buffer'
    AND b."startsAt" = OLD."endsAt"
    AND NOT EXISTS (
      SELECT 1 FROM "AutoscuolaAppointment" a
      WHERE a."companyId" = OLD."companyId"
        AND a."instructorId" = OLD."instructorId"
        AND a."endsAt" = OLD."endsAt"
        AND a."id" <> OLD."id"
        AND lower(a."status") <> 'cancelled'
    );
  RETURN NULL;
END;
$$;

CREATE TRIGGER "autoscuola_appointment_release_lesson_buffer"
AFTER UPDATE OF "status" OR DELETE ON "AutoscuolaAppointment"
FOR EACH ROW EXECUTE FUNCTION "autoscuola_release_lesson_buffer"();
