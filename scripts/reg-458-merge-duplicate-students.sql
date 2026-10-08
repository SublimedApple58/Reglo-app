-- REG-458 / Fase 7 — fusione dei 3 doppioni C+CQC
-- Consorzio Autoscuole Riunite Car (85635731-4804-48b7-b997-5d48ba20a1bb)
-- MD SOJIB e NICO MACELLONI (Gerardo Pontedera), ONKAR SINGH (Gerardo Peccioli)
--
-- Giacomo Chiappe NON e' incluso: decisione di Tiziano, resta intoccato.
--
-- Per ciascuno dei tre: il record **CQC** porta tutte le guide vere (AUTOCARRO
-- ROSSO, istruttore Alessio Bini) ed e' il percorso corrente, resta come sta.
-- Il record **C** non contiene nessuna guida: contiene SOLO l'esame senza orario
-- del 3 ottobre. Quell'esame passa sul record CQC e il record C viene dismesso.
--
-- Verificato in sola lettura prima di scrivere, sui 3 account C:
--   3 appuntamenti (i tre esami), 3 percorsi, 3 membership, 6 righe di log messaggi.
--   ZERO su tutto il resto: pagellini, crediti, pagamenti, piani, documenti,
--   pratiche, richieste guida, assenze, scambi, chiamate, quiz,
--   token mobile, dispositivi push, sessioni web.
--   Il codice contabile consorzio e' IDENTICO sui due record di ogni persona
--   (030 / 030 / 012): quello che cade in cascata col membro C e' un doppione.
--
-- La riga `User` dei tre account C NON viene cancellata: senza membership
-- spariscono da ogni elenco, e tenerla costa nulla e lascia la traccia.
--
-- Ogni UPDATE/DELETE e' vincolato anche al valore vecchio: rilanciare il file
-- non fa danni, e un id sbagliato non tocca la riga di qualcun altro.

BEGIN;

-- ============================================================ 1/3  MD SOJIB
-- C   user 43034926-16fe-4a9f-9738-1c6610b4d57b  → dismesso
-- CQC user 4d383558-7c6c-495d-a0b9-5ac8bc6e6cd3  → tenuto (5 guide, 22/09→02/10)

UPDATE "AutoscuolaAppointment"
   SET "studentId" = '4d383558-7c6c-495d-a0b9-5ac8bc6e6cd3',
       "updatedAt" = now()
 WHERE id          = '154ccc36-5066-44e3-9b00-7c4e49afd1ed'
   AND "studentId" = '43034926-16fe-4a9f-9738-1c6610b4d57b';

UPDATE "AutoscuolaMessageLog"
   SET "studentId" = '4d383558-7c6c-495d-a0b9-5ac8bc6e6cd3'
 WHERE "studentId" = '43034926-16fe-4a9f-9738-1c6610b4d57b';

DELETE FROM "CompanyMember"
 WHERE "companyId"       = '85635731-4804-48b7-b997-5d48ba20a1bb'
   AND "userId"          = '43034926-16fe-4a9f-9738-1c6610b4d57b'
   AND "licenseCategory" = 'C';

DELETE FROM "AutoscuolaLicensePath"
 WHERE id                = '6cd88f7b-9bf5-40d5-b99f-4772bba91a3b'
   AND "studentId"       = '43034926-16fe-4a9f-9738-1c6610b4d57b'
   AND "licenseCategory" = 'C';

-- ======================================================= 2/3  NICO MACELLONI
-- C   user d3291c4c-68bd-400d-8ca1-54e7cf13e1b0  → dismesso
-- CQC user a50c1437-371c-46b8-9150-f0d62fc882f8  → tenuto (5 guide, 23/09→01/10)

UPDATE "AutoscuolaAppointment"
   SET "studentId" = 'a50c1437-371c-46b8-9150-f0d62fc882f8',
       "updatedAt" = now()
 WHERE id          = 'dbaff9cf-17da-44e1-8381-549c684c69eb'
   AND "studentId" = 'd3291c4c-68bd-400d-8ca1-54e7cf13e1b0';

UPDATE "AutoscuolaMessageLog"
   SET "studentId" = 'a50c1437-371c-46b8-9150-f0d62fc882f8'
 WHERE "studentId" = 'd3291c4c-68bd-400d-8ca1-54e7cf13e1b0';

DELETE FROM "CompanyMember"
 WHERE "companyId"       = '85635731-4804-48b7-b997-5d48ba20a1bb'
   AND "userId"          = 'd3291c4c-68bd-400d-8ca1-54e7cf13e1b0'
   AND "licenseCategory" = 'C';

DELETE FROM "AutoscuolaLicensePath"
 WHERE id                = 'c9ff7a37-995f-404b-b6ae-80d3516618ab'
   AND "studentId"       = 'd3291c4c-68bd-400d-8ca1-54e7cf13e1b0'
   AND "licenseCategory" = 'C';

-- ========================================================== 3/3  ONKAR SINGH
-- C   user e37c6dba-5e99-4c0b-a8f6-318588b1f526  → dismesso
-- CQC user 7ea6f879-bd0d-45c8-b896-918488e981c1  → tenuto (1 guida, 28/09)

UPDATE "AutoscuolaAppointment"
   SET "studentId" = '7ea6f879-bd0d-45c8-b896-918488e981c1',
       "updatedAt" = now()
 WHERE id          = '485f2898-1ada-4956-921b-c73885842b19'
   AND "studentId" = 'e37c6dba-5e99-4c0b-a8f6-318588b1f526';

UPDATE "AutoscuolaMessageLog"
   SET "studentId" = '7ea6f879-bd0d-45c8-b896-918488e981c1'
 WHERE "studentId" = 'e37c6dba-5e99-4c0b-a8f6-318588b1f526';

DELETE FROM "CompanyMember"
 WHERE "companyId"       = '85635731-4804-48b7-b997-5d48ba20a1bb'
   AND "userId"          = 'e37c6dba-5e99-4c0b-a8f6-318588b1f526'
   AND "licenseCategory" = 'C';

DELETE FROM "AutoscuolaLicensePath"
 WHERE id                = 'f0dd453d-a71b-4f47-965a-3c4f919bbc7e'
   AND "studentId"       = 'e37c6dba-5e99-4c0b-a8f6-318588b1f526'
   AND "licenseCategory" = 'C';

-- ================================================ rete di sicurezza: se uno
-- qualsiasi di questi conti non torna, la transazione ABORTA e non scrive nulla.

DO $$
DECLARE n int;
BEGIN
  -- i tre nomi devono comparire una volta sola nel consorzio
  SELECT count(*) INTO n
    FROM "CompanyMember" m JOIN "User" u ON u.id = m."userId"
   WHERE m."companyId" = '85635731-4804-48b7-b997-5d48ba20a1bb'
     AND m."autoscuolaRole" = 'STUDENT'
     AND lower(u.name) IN ('md sojib','nico macelloni','onkar singh');
  IF n <> 3 THEN
    RAISE EXCEPTION 'attese 3 iscrizioni dopo la fusione, trovate %', n;
  END IF;

  -- 6 + 6 + 2 = 14 appuntamenti sui tre record tenuti (guide + esame)
  SELECT count(*) INTO n
    FROM "AutoscuolaAppointment"
   WHERE "studentId" IN ('4d383558-7c6c-495d-a0b9-5ac8bc6e6cd3',
                         'a50c1437-371c-46b8-9150-f0d62fc882f8',
                         '7ea6f879-bd0d-45c8-b896-918488e981c1');
  IF n <> 14 THEN
    RAISE EXCEPTION 'attesi 14 appuntamenti sui record tenuti, trovati %', n;
  END IF;

  -- un solo percorso, aperto, per ciascuno dei tre
  SELECT count(*) INTO n
    FROM "AutoscuolaLicensePath"
   WHERE "studentId" IN ('4d383558-7c6c-495d-a0b9-5ac8bc6e6cd3',
                         'a50c1437-371c-46b8-9150-f0d62fc882f8',
                         '7ea6f879-bd0d-45c8-b896-918488e981c1')
     AND status = 'active';
  IF n <> 3 THEN
    RAISE EXCEPTION 'atteso 1 percorso aperto a testa, trovati % in tutto', n;
  END IF;

  -- nessun appuntamento e nessun percorso rimasto sui tre account dismessi
  SELECT count(*) INTO n
    FROM "AutoscuolaAppointment"
   WHERE "studentId" IN ('43034926-16fe-4a9f-9738-1c6610b4d57b',
                         'd3291c4c-68bd-400d-8ca1-54e7cf13e1b0',
                         'e37c6dba-5e99-4c0b-a8f6-318588b1f526');
  IF n <> 0 THEN
    RAISE EXCEPTION 'restano % appuntamenti sugli account dismessi', n;
  END IF;

  SELECT count(*) INTO n
    FROM "AutoscuolaLicensePath"
   WHERE "studentId" IN ('43034926-16fe-4a9f-9738-1c6610b4d57b',
                         'd3291c4c-68bd-400d-8ca1-54e7cf13e1b0',
                         'e37c6dba-5e99-4c0b-a8f6-318588b1f526');
  IF n <> 0 THEN
    RAISE EXCEPTION 'restano % percorsi sugli account dismessi', n;
  END IF;
END $$;

COMMIT;
