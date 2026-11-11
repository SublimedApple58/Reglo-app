# Unire account doppi (stesso allievo, stessa autoscuola)

Procedura operativa su DB (nessuna UI). Caso tipico: l'allievo si registra dall'app con l'email sbagliata (es. `@gmail.con`), l'autoscuola ci carica sopra le guide, poi lui si registra di nuovo con l'email giusta e entra con un account vuoto. Si spostano i dati dall'account sbagliato **A** a quello con cui entra **B**, poi si cancella A.

Primo caso: REG-704 (11/11/2026, Autoscuola New Drive). Script usato: vedi sotto.

## Regole

- Solo su ordine esplicito, con un backup JSON fatto prima, e tutto in **una transazione** (`psql -1 -v ON_ERROR_STOP=1`): se un passo o un controllo fallisce, rollback completo e ci si ferma.
- Si tiene **B** (account usato per l'accesso: token app e push device recenti). Si sposta tutto ciò che è di A; i doppioni vuoti di A (pratica, percorso) si cancellano.
- La fase di lettura va fatta con una connessione forzata in sola lettura:
  `PGOPTIONS='-c default_transaction_read_only=on' psql "$DIRECT_URL" ...` (`DIRECT_URL` da `.env.prod`). Per le query singole va bene anche `pnpm db:prod:query`.

## Fase 1 — mappa (sola lettura)

1. Trova i due `User` (email, nome, telefono) e i loro `CompanyMember`.
2. Elenca le FK verso `User` dal DB vero, non dallo schema locale (può essere indietro):
   ```sql
   select c.conrelid::regclass::text, a.attname, c.confdeltype::text  -- c=cascade r=restrict n=set null
   from pg_constraint c join pg_attribute a on a.attrelid=c.conrelid and a.attnum=any(c.conkey)
   where c.contype='f' and c.confrelid='"User"'::regclass order by 1;
   ```
3. Alcuni riferimenti non hanno FK (es. `AutoscuolaAppointment.cancelledByUserId`, `examOutcomeByUserId`, `agendaDismissedByUserId`, `CompanyMember.examReadyBy`, `AutoscuolaMessageLog.recipient`). Per non perderne nessuno, scansiona **ogni riga di ogni tabella** cercando i due id (e poi gli id di pratica/percorso/saldo di A):
   ```sql
   select count(*) from "<Tabella>" x where x::text like '%<id A>%';   -- ripetuto per tutte le tabelle di pg_stat_user_tables
   ```
   Nel 2026-11 sono ~124 tabelle e la scansione completa dura pochi secondi.
4. Backup JSON delle righe complete trovate in `~/Developer/reglo/backups/reg-<num>-<data>.json` (contiene hash password: resta in locale).

## Fase 2 — cosa fare per tabella

| Dato | Azione | Attenzione |
|------|--------|------------|
| `AutoscuolaAppointment.studentId` | riassegna a B | |
| `AutoscuolaMessageLog.studentId` **e** `recipient` | riassegna a B | `recipient` fa parte della chiave anti-doppione dei promemoria (`ruleId, appointmentId, recipient, channel`): se non lo sposti B può ricevere di nuovo promemoria già inviati |
| `AutoscuolaStudentLessonCreditBalance` | riassegna se B non ce l'ha | unico su `(companyId, studentId)`: se B ce l'ha già, somma i crediti su B, sposta il ledger, cancella quello di A |
| Pagamenti, payment plan/profile, ledger crediti, documenti, booking/swap/waitlist, quiz, gruppi (FK `restrict` su `studentId`) | riassegna a B | se presenti; in REG-704 erano tutti vuoti |
| Colonne autore/attore (`cancelledByUserId`, `examOutcomeByUserId`, `agendaDismissedByUserId`, `actorUserId`, `createdByUserId`, `invitedById`, `examReadyBy`, `assignedToUserId`, `senderUserId`, `ProductFeedback.userId`) | riassegna a B | |
| `AutoscuolaCase` | se B ne ha una equivalente, cancella quella di A; altrimenti riassegna | FK `restrict`: blocca la cancellazione di A |
| `AutoscuolaLicensePath` attivo | cancella quello di A se uguale a quello di B | unico attivo per `(companyId, studentId)`: non si può spostare se B ne ha uno. Prima azzera `CompanyMember.activeLicensePathId` di A |
| Anagrafica (`User.birthDate`, `address`, `CompanyMember.licenseNumber`, `assignedInstructorId`, …) | copia su B solo i campi che B ha vuoti | |
| `CompanyMember`, `MobileAccessToken`, `MobilePushDevice`, `Session`, `Account`, `PasswordResetCode` di A | si cancellano da soli con `DELETE FROM "User"` (cascade) | |

## Fase 3 — script

Schema dello script REG-704 (A e B come variabili psql). Gli `UPDATE` con 0 righe vanno lasciati: rendono esplicito che i riferimenti autore sono stati gestiti.

```sql
\set A '''<id A>'''
\set B '''<id B>'''
UPDATE "AutoscuolaAppointment" SET "studentId" = :B WHERE "studentId" = :A;
UPDATE "AutoscuolaMessageLog" SET "studentId" = :B WHERE "studentId" = :A;
UPDATE "AutoscuolaMessageLog" SET recipient = :B WHERE recipient = :A;
UPDATE "AutoscuolaStudentLessonCreditBalance" SET "studentId" = :B WHERE "studentId" = :A;
-- ...un UPDATE per ogni colonna autore/attore della tabella sopra...
DELETE FROM "AutoscuolaCase" WHERE id = '<case A>' AND "studentId" = :A;
UPDATE "CompanyMember" SET "activeLicensePathId" = NULL WHERE "userId" = :A;
DELETE FROM "AutoscuolaLicensePath" WHERE id = '<path A>' AND "studentId" = :A;
DELETE FROM "User" WHERE id = :A AND email = '<email sbagliata>';

DO $$
DECLARE a text := '<id A>'; b text := '<id B>'; t record; n int;
BEGIN
  FOR t IN SELECT relname FROM pg_stat_user_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('SELECT count(*) FROM %I x WHERE x::text LIKE %L', t.relname, '%' || a || '%') INTO n;
    IF n > 0 THEN RAISE EXCEPTION 'resta l''id di A in % (% righe)', t.relname, n; END IF;
  END LOOP;
  SELECT count(*) INTO n FROM "AutoscuolaAppointment" WHERE "studentId"::text = b;
  IF n <> <guide attese> THEN RAISE EXCEPTION 'B ha % guide', n; END IF;
  -- ...stessi controlli per log, saldo crediti, scheda allievo di B...
END $$;
```

Gotcha: le colonne id sono `uuid`. Nel blocco `DO` le variabili sono `text`, quindi serve `"studentId"::text = b`, altrimenti `operator does not exist: uuid = text` fa fallire i controlli e tutto torna indietro (successo al primo giro di REG-704, senza danni grazie alla transazione).

## Fase 4 — verifica

- Rilettura da una sessione separata: A non esiste, B ha i conteggi attesi.
- Guide visibili in app: `GET /api/autoscuole/appointments` per un allievo forza `studentId = membership.userId` sulla company attiva (`getAutoscuolaAppointmentsFiltered`). Query equivalente:
  ```sql
  select a.* from "User" s
  join "CompanyMember" m on m."userId" = s.id and m."companyId" = s."activeCompanyId" and m."autoscuolaRole" = 'STUDENT'
  join "AutoscuolaAppointment" a on a."companyId" = m."companyId" and a."studentId" = s.id
  where s.id = '<id B>';
  ```
- L'allievo non deve rifare l'accesso: le guide compaiono al prossimo caricamento.
