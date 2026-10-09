-- REG-458 / Fase 7 — fusione del doppione D + DE di VERONICA BILIOTTI
-- Consorzio Autoscuole Riunite Car (85635731-4804-48b7-b997-5d48ba20a1bb)
--
-- Stessa logica dei tre C+CQC: si tiene il record con le guide.
--
-- Le due iscrizioni nascono a sei minuti di distanza il 17/09, hanno lo
-- STESSO telefono (3420818681) e nessuna delle due ha mai avuto accesso
-- all'app (niente password, token, dispositivi, sessioni).
--
--   D  (548be4de…) → TENUTO. Una guida su AUTOBUS il 18/09, annullata.
--   DE (f6fa5200…) → DISMESSO. **Completamente vuoto**: nessun appuntamento,
--      nessun pagellino, credito, pagamento, piano, pratica, richiesta guida,
--      log messaggi. Solo l'iscrizione e il percorso nato dal backfill.
--
-- Non c'e' niente da spostare: a differenza dei tre C+CQC qui il record
-- dismesso non porta nemmeno un esame.
--
-- ⚠️ DIFFERENZA dai tre: i codici contabili consorzio sono DIVERSI
--    (D = 015, DE = 529). Il 529 cade in cascata con l'iscrizione DE. Non e'
--    mai stato usato — su DE non esiste una sola guida — ma se il consorzio
--    voleva fatturare la DE sotto 529, quel collegamento va rimesso a mano sul
--    record D quando la DE partira' davvero.
--
-- La riga `User` di DE NON viene cancellata: senza iscrizione sparisce da ogni
-- elenco, e tenerla costa nulla e lascia la traccia.

BEGIN;

DELETE FROM "CompanyMember"
 WHERE "companyId"       = '85635731-4804-48b7-b997-5d48ba20a1bb'
   AND "userId"          = 'f6fa5200-2514-4adb-8441-ee4a46d3a7b1'
   AND "licenseCategory" = 'DE';

DELETE FROM "AutoscuolaLicensePath"
 WHERE id                = 'c2d3f54a-f8c4-4f90-bfc3-ad5c584e7ca5'
   AND "studentId"       = 'f6fa5200-2514-4adb-8441-ee4a46d3a7b1'
   AND "licenseCategory" = 'DE';

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n
    FROM "CompanyMember" m JOIN "User" u ON u.id = m."userId"
   WHERE m."companyId" = '85635731-4804-48b7-b997-5d48ba20a1bb'
     AND m."autoscuolaRole" = 'STUDENT'
     AND lower(u.name) = 'veronica biliotti';
  IF n <> 1 THEN RAISE EXCEPTION 'attesa 1 iscrizione, trovate %', n; END IF;

  SELECT count(*) INTO n
    FROM "AutoscuolaLicensePath"
   WHERE "studentId" = '548be4de-881e-48bf-ad28-4505be22020e' AND status = 'active';
  IF n <> 1 THEN RAISE EXCEPTION 'atteso 1 percorso aperto sulla D, trovati %', n; END IF;

  SELECT count(*) INTO n
    FROM "AutoscuolaLicensePath"
   WHERE "studentId" = 'f6fa5200-2514-4adb-8441-ee4a46d3a7b1';
  IF n <> 0 THEN RAISE EXCEPTION 'restano % percorsi sul record dismesso', n; END IF;

  SELECT count(*) INTO n
    FROM "AutoscuolaAppointment"
   WHERE "studentId" = 'f6fa5200-2514-4adb-8441-ee4a46d3a7b1';
  IF n <> 0 THEN RAISE EXCEPTION 'restano % appuntamenti sul record dismesso', n; END IF;
END $$;

COMMIT;
