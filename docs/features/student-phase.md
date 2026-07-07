# Student Phase + Quiz Seats (modello SaaS commerciale)

Differenzia gli allievi in **AWAITING** → **TEORIA** → **PRATICA** → **PATENTATO**. La fase determina cosa l'allievo vede in app e blocca lato server le azioni non coerenti. Sostituisce il modello legacy `quizEnabled: boolean` con un modello a **posti quiz a vita** (licenze nominali) configurabile dall'autoscuola e gestito dal backoffice.

## Modello dati

`prisma/schema.prisma`:

- `enum AutoscuolaStudentPhase { AWAITING, TEORIA, PRATICA, PATENTATO }`
- `CompanyMember.studentPhase: AutoscuolaStudentPhase @default(PRATICA)` — per non-studenti il valore è ignorato.
- `CompanyMember.quizSeatGrantedAt: DateTime?` — `null` = mai, datato = seat consumato a vita (non rilasciabile).
- `CompanyMember.phaseClassifiedAt: DateTime?` — `null` = ancora "default migration"; valorizzato quando il titolare (o il sistema durante l'auto-assegnazione) classifica esplicitamente la fase.
- `CompanyService.limits` (JSONB, key `AUTOSCUOLE`) include i nuovi campi:
  - `phasesEnabled: ('TEORIA' | 'PRATICA')[]` — fasi attive del percorso. Default `['PRATICA']` (legacy). Almeno una è obbligatoria.
  - `quizSeats: number` — licenze acquistate. Default `0`. Contatore di seat consumati derivato dalla `COUNT` su `CompanyMember.quizSeatGrantedAt IS NOT NULL`. Solo crescente.
  - `autoAssignQuizOnSignup: boolean` — se `true`, ogni neo-iscritto riceve un seat alla registrazione (se disponibile) e parte in TEORIA. Default `false`.
- Indici: `(companyId, studentPhase)` + `(companyId, quizSeatGrantedAt)` per dashboard titolare e counter.
- La data esame teoria continua a riusare `AutoscuolaCase.theoryExamAt` (no duplicazione).

Migrazioni:
- `prisma/migrations/20260513000000_add_student_phase` (legacy, enum 3-stati)
- `prisma/migrations/20260514000000_add_awaiting_to_student_phase` (ALTER TYPE isolato)
- `prisma/migrations/20260514000001_quiz_seats_phase_classified_and_limits_backfill` (campi seat/classification + backfill JSON: `phasesEnabled=['PRATICA']`, `autoAssignQuizOnSignup=false`, `quizSeats=100` per autoscuole con legacy `quizEnabled=true`, `0` altrove; rimuove `quizEnabled`)

## File chiave

| Scope | File |
|------|------|
| Schema | `prisma/schema.prisma` |
| ServiceLimits type | `lib/services.ts` |
| Server action update fase | `lib/actions/autoscuole.actions.ts` → `updateStudentPhase` |
| Server actions runtime quiz seats | `lib/actions/autoscuole-settings.actions.ts` → `getQuizSeatsContext`, `grantQuizSeat`, `setAutoAssignQuizOnSignup` |
| Server actions backoffice | `lib/actions/backoffice.actions.ts` → `getQuizSeatsUsage`, `getTeoriaAffectedStudents`, `deactivateTeoriaWithResolution` |
| Booking guard | `lib/actions/autoscuole-availability.actions.ts` → `ensureStudentCanBookFromApp` |
| Endpoint mobile | `app/api/autoscuole/me/route.ts` (`GET`) |
| Endpoint mobile signup | `app/api/mobile/auth/student-register/route.ts` (POST, decide phase + seat) |
| Push reminders TEORIA | `lib/autoscuole/theory-reminders.ts` |
| Cron orchestrator | `trigger/autoscuole-reminders.ts` |
| Web dialog cambio fase titolare | `components/pages/Autoscuole/dialogs/ChangeStudentPhaseDialog.tsx` |
| Web allievi (banner + tab In attesa/Teoria/Pratica/Patentati; redesign Airbnb 2026-07 con detail panel destro) | `components/pages/Autoscuole/AutoscuoleStudentsPage.tsx` |
| Web settings (auto-assign toggle) | `components/pages/Autoscuole/tabs/SettingsTab.tsx` |
| Backoffice card licenze + fasi | `components/pages/Backoffice/BackofficeCompaniesPage.tsx` |
| Backoffice resolve dialog | `components/pages/Backoffice/BackofficeResolveTeoriaDeactivationDialog.tsx` |

## Decisione di fase alla registrazione

`POST /api/mobile/auth/student-register` (dentro la transaction). Il campo `schoolCode` accetta sia il codice autoscuola sia il **codice istruttore** (lookup company-first; vedi `instructor-clusters.md`): in quel caso la membership nasce con `assignedInstructorId` valorizzato, ma le regole di fase sono identiche.

```
seatsConsumed = COUNT(CompanyMember WHERE quizSeatGrantedAt != null)

if 'TEORIA' not in phasesEnabled:
  phase = PRATICA (legacy), no seat
elif autoAssignQuizOnSignup and seatsConsumed < quizSeats:
  phase = TEORIA, seat granted (quizSeatGrantedAt = now)
else:
  phase = AWAITING, no seat
```

`phaseClassifiedAt = now` sempre, per non far apparire il badge "Conferma fase" sull'allievo appena creato.

La race fra registrazioni concorrenti è gestita perché `seatsConsumed` viene letto **dentro** la stessa Prisma transaction della `create`.

## Assegnazione manuale licenza (`grantQuizSeat`)

Owner-only. Guard in ordine:

1. `'TEORIA' ∈ phasesEnabled`
2. Seat disponibili (`available > 0`)
3. Studente esiste e `studentPhase === 'AWAITING'` (PRATICA esplicitamente rifiutato)
4. Studente non ha già un seat

Effetto: `quizSeatGrantedAt = now`, `studentPhase = TEORIA`, `phaseClassifiedAt = now`. **I seat sono "a vita"**: non c'è action di revoca.

## Toggle auto-assegnazione (`setAutoAssignQuizOnSignup`)

Owner-only. Aggiorna `limits.autoAssignQuizOnSignup`. Sulla transizione **OFF → ON**, in transaction:

1. Calcola `freeSeats = quizSeats - seatsConsumed`
2. Promuove FIFO i primi `freeSeats` studenti in `AWAITING` (ordinati per `createdAt ASC`) → fase TEORIA + seat consumato

## Disattivazione TEORIA dal backoffice

`getTeoriaAffectedStudents(companyId)` → ritorna gli studenti in `AWAITING/TEORIA`. Se non vuota, l'UI backoffice apre `BackofficeResolveTeoriaDeactivationDialog`:

- Lista scrollabile per allievo
- Bulk action default "Passa a PRATICA" (override "Mantieni in fase attuale" per allievo)
- Conferma → `deactivateTeoriaWithResolution({ companyId, resolutions[] })` che fa `updateMany` su chi va in PRATICA (set `phaseClassifiedAt`). I seat non vengono mai revocati.
- Successivamente il backoffice persiste i nuovi `limits` (senza TEORIA in `phasesEnabled`).

## Validazione transizioni fase (`updateStudentPhase`)

Schema accetta `AWAITING | TEORIA | PRATICA | PATENTATO`. Validazione contro `limits.phasesEnabled`:

- `TEORIA`, `AWAITING` → richiedono `'TEORIA' ∈ phasesEnabled`
- `PRATICA` → richiede `'PRATICA' ∈ phasesEnabled`
- `PATENTATO` → sempre permesso

Se transizione **verso** `AWAITING/TEORIA` e ci sono `AutoscuolaAppointment` futuri non cancellati per lo studente, **rifiuta** ("Cancellale prima di cambiare fase"). Set `phaseClassifiedAt = now`.

## Booking guard

`ensureStudentCanBookFromApp` blocca:
- `AWAITING` → "Il tuo percorso non è ancora stato attivato dall'autoscuola."
- `TEORIA` → "Le lezioni di guida saranno disponibili dopo l'esame di teoria."

PRATICA e PATENTATO sono ammessi.

## Push notifications (TEORIA)

Invariato dal precedente: `processAutoscuolaTheoryReminders` invia `theory_exam_countdown` (T-7/T-3/T-1 alle 10:00) e `theory_quiz_inactivity` (18:00 dopo 5gg di inattività). Aperto a future modifiche per AWAITING (oggi nessun reminder dedicato).

## Endpoint `/api/autoscuole/me`

Risposta (additive, retro-compat):

```ts
{
  phase: AWAITING | TEORIA | PRATICA | PATENTATO,
  theoryExamAt: string | null,
  drivingExamAt: string | null,
  phasesEnabled: ('TEORIA' | 'PRATICA')[],
  hasQuizAccess: boolean,           // derived from quizSeatGrantedAt
  autoAssignQuizOnSignup: boolean,
}
```

Client mobile vecchi che non leggono i campi nuovi continuano a funzionare; il fallback default a `phasesEnabled=['PRATICA']`, `hasQuizAccess=false`.

## Connessioni

- → **Booking Engine**: `ensureStudentCanBookFromApp` blocca AWAITING + TEORIA.
- → **Quiz Teoria**: il tab quiz mobile è visibile **solo** se `phase === TEORIA && hasQuizAccess`.
- → **Cases & Deadlines**: riusa `AutoscuolaCase.theoryExamAt`.
- → **Communications**: cron `autoscuole-reminders.ts` invariato.
- → **Notifications**: kinds `theory_exam_countdown`, `theory_quiz_inactivity` (mobile inbox-only).
- → **Mobile**: 4 home screen condizionali. Vedi `reglo-mobile/docs/features/student-phase.md`.
- → **Backoffice**: card "Fasi attive del percorso" + card "Quiz Teoria — Gestione licenze" + dialog di risoluzione.

## Migrazione studenti esistenti

La migration `20260514000001` ha popolato:
- Tutte le autoscuole con `phasesEnabled = ['PRATICA']` e `autoAssignQuizOnSignup = false`.
- Le autoscuole che avevano `quizEnabled = true` ricevono `quizSeats = 100` (compromesso conservativo finché non si rinegozia commercialmente). Le altre `quizSeats = 0`.
- Nessun seat retroattivo perché in prod non ci sono studenti con `QuizSession` completate al momento della migration.

Gli studenti esistenti restano tutti in `PRATICA` (come prima della migration); il titolare può poi riclassificarli col dialog "Cambia fase".
