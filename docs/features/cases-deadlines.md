# Cases & Deadlines

> ⚠️ **DEPRECATO (REG-458).** `AutoscuolaCase` non è il percorso patente: quello
> è `AutoscuolaLicensePath` ([license-paths.md](license-paths.md)). Il modello
> qui descritto non è mai stato adottato — in produzione 1071 righe su 1073 sono
> `category: null, status: "iscritto"` senza una sola scadenza valorizzata, e
> **nessun** appuntamento ha mai avuto `caseId` (0 su 13.610). Le pagine
> **Pratiche** e **Scadenze** sono spente: le route fanno `notFound()`.
>
> Resta in piedi perché sei punti vivi lo leggono ancora (`exam-priority.ts`,
> `theory-reminders.ts`, `lesson-policy.ts`, `processAutoscuolaCaseDeadlines`,
> `/api/autoscuole/me`, `student-register`) e perché `theoryExamAt` è l'unico
> posto dove sta la data dell'esame di teoria. **Non aggiungerci niente.**

## What it does
Student driving course lifecycle, deadline tracking (pink sheet expiry, medical certification, exam dates).

## Key files
- `lib/actions/autoscuole.actions.ts` — case CRUD, status changes
- `lib/autoscuole/communications.ts` — deadline reminder processing
- `components/pages/Autoscuole/AutoscuoleCasesPage.tsx` — web UI
- `components/pages/Autoscuole/AutoscuoleDeadlinesPage.tsx` — deadline tracking UI

## Case status lifecycle
`iscritto` → `foglio_rosa` → `teoria_prenotata` → `teoria_superata` → `guida` → `esame_prenotato` → `esame_superato`

## Key functions
- `createAutoscuolaCase()`, `updateAutoscuolaCaseStatus()`
- `getAutoscuolaStudentDrivingRegister()` — completed lessons, required, remaining, by type
- `processAutoscuolaCaseDeadlines()` — background job for deadline reminders

## DB models
- `AutoscuolaCase` — status, pinkSheetExpiresAt, medicalExpiresAt, drivingExamAt, theoryExamAt

## Connected features
- **Appointments** — appointments track lesson progress per case
- **Communications** — deadline reminders (pink sheet, medical expiry)
- **Notifications** — push on case status change
