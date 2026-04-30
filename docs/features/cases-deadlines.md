# Cases & Deadlines

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
