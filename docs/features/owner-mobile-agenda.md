# App titolare: backend dell'agenda «Tutti» (REG-795, 26/11/2026)

Backend del primo rilascio della nuova app mobile del titolare (REG-794). L'app
mostra l'agenda «Tutti» a colonne-istruttore. Il titolare, anche se non è
istruttore, agisce sulle guide come dal web.

## Disponibilità di tutti gli istruttori

`GET /api/autoscuole/agenda/availability?from=YYYY-MM-DD&to=YYYY-MM-DD`
(`app/api/autoscuole/agenda/availability/route.ts`).

- È un involucro sottile di `getInstructorAvailabilityForAgenda`, la stessa
  funzione dell'agenda web. Le fasce sono quindi identiche: settimana tipo,
  settimane pubblicate, eccezioni e, a funzione accesa, luogo con `locationId`
  e `inWeekly`.
- **Accesso**: solo titolare (`OWNER`), istruttore titolare (`INSTRUCTOR_OWNER`)
  o admin. Per gli altri ruoli risponde 403. La company è quella della sessione.
- **Intervallo**: giorni `YYYY-MM-DD` con `to` escluso, come li passa il web,
  da 1 a 42 giorni; fuori da questi limiti risponde 400.
- **Risposta**: `{ success, data: [{ instructorId, instructorName, days: { "YYYY-MM-DD": [{ startMinutes, endMinutes, locationName?, locationId?, inWeekly? }] } }] }`.
  Contiene solo gli istruttori attivi con un account. Un giorno senza fasce non
  compare tra le chiavi.
- **Mobile**: la usa `useSchoolAvailability`, al posto del ripiego su
  `availability/slots`.

## Permessi del titolare sulle guide (audit)

Le rotte mobile delle azioni sulle guide sono `/api/autoscuole/*`, con
`requireServiceAccess` e le stesse azioni del web. OWNER e INSTRUCTOR_OWNER
hanno `role: "admin"` (`deriveCompanyMemberRole`). Le restrizioni «solo le tue
guide» sono scritte come `isInstructor && role !== "admin"`, quindi il
titolare passa ovunque. Ogni lettura è filtrata per `companyId`.

| Azione (rotta) | Titolare | Istruttore | Note |
|---|---|---|---|
| Crea guida per un altro istruttore (`POST appointments`) | sì | solo per sé | `instructorId` verificato nella company |
| Sposta (`reschedule`) | sì, anche le passate (correzione) | solo le sue | |
| Annulla (`annul`, `cancel`) | sì, e decide l'esito del tardivo | solo le sue | |
| Elimina (`permanent-cancel`) | sì | solo le sue | **guardia aggiunta in REG-795** |
| Check-in / assente (`status`) | sì, senza finestra oraria | sue o da co-istruttore, da 10' prima | |
| Dettagli, cambio istruttore, pagellino (`PATCH appointments/[id]`) | sì; cambio sulle concluse entro 30 giorni | solo le sue | |
| Esito d'esame (`exam-outcome`) | sì | sì | |
| Presenze nelle guide di gruppo | sì | sue o da co-istruttore | |
| Malattia, ferie e blocchi per un altro istruttore | sì | solo per sé | |
| Crea esame per un istruttore (`POST exam`) | sì, salva `instructorId` | sì | istruttore fuori dalla company → 404 |

Test: `tests/unit/autoscuole/owner-lesson-access.test.ts`,
`tests/integration/api/autoscuole-agenda-availability.test.ts`,
`tests/integration/api/autoscuole-exam-instructor.test.ts`.

**Lacuna nota, fuori scope**: `updateAutoscuolaAppointmentDetails` non esclude
l'allievo. Un account `STUDENT` che chiamasse `PATCH appointments/[id]` a mano
potrebbe modificare note, tipo e voto di una guida della sua autoscuola.
Dall'app l'allievo non ha questa azione. Da chiudere in un task a parte, dopo
aver verificato chi chiama la rotta (`StudentNotesDetailScreen` mobile).

## Esami creati dal fantasma

Il backend accettava e salvava già `instructorId`, sia nel ramo del titolare
(`createExamEvent`) sia in quello dell'istruttore della rotta (anche
INSTRUCTOR_OWNER). Era il mobile a non mandarlo: `CreateExamScreen` deve
passare l'istruttore della colonna.
