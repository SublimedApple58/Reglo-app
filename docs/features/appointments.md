# Appointments

## What it does
Full lesson/exam lifecycle: create, propose, confirm, check-in, complete, cancel, reschedule, reposition.

## Key files
- `lib/actions/autoscuole.actions.ts` — all appointment mutations (largest action file)
- `lib/autoscuole/lesson-policy.ts` — lesson type validation, time/day restrictions
- `lib/autoscuole/exam-priority.ts` — 14-day priority window before exam date
- `components/pages/Autoscuole/AutoscuoleAgendaPage.tsx` — web agenda UI (170KB)

## Web agenda — slot click (Google Calendar style, 2026-07-07)
Click su uno slot vuoto (tutte e 3 le viste: classica, istruttori-settimana, istruttori-giorno) → **blocco fantasma** da 1h sullo slot (neutro: bianco, bordo tratteggiato grigio, `renderSlotGhost`, motion pop-in/out) + popover (`slotMenu` state, portal su body) ancorato di fianco alla colonna all'altezza del fantasma, con data/ora dello slot (snap al blocco da 30', `Math.floor`) + istruttore quando la colonna è per-istruttore. Voci = stesse di "+ Nuovo": Appuntamento, Esame, Evento bloccante, Guida di gruppo (se abilitata) — ognuna apre il dialog già precompilato (giorno/ora/istruttore); il fantasma sparisce alla scelta. `GroupLessonCreateDialog` accetta `defaultTime`/`defaultInstructorId` per questo. Prima esisteva solo il click diretto → wizard Appuntamento (viste classica e istruttori-giorno) con un calcolo dell'offset che sbagliava l'orario quando la griglia era scrollata (`+ scrollTop - 40`); ora `clientY - rect.top` puro, corretto a ogni scroll. Chiusura: click fuori, Escape, wheel. Regola design: superfici nuove NEUTRE, niente fucsia dominante (preview approvata `~/Desktop/Reglo-Preview-Prenotazione-GCal.html`).

## Key functions
- `createAutoscuolaAppointment()` — single lesson
- `createAutoscuolaAppointmentBatch()` — batch (exams)
- `cancelAutoscuolaAppointment()` — cancel with refund + reposition queue
- `rescheduleAutoscuolaAppointment()` — reschedule with audit trail (`rescheduledAt`, `rescheduledFromStartsAt`). Owner/admin can also re-time PAST/concluded guides (checked_in/completed/no_show) and move them to other past slots ("record fix", 2026-06-12); a pure past→past fix sends NO student notification. Instructors keep the strict set (scheduled/confirmed/proposal, future only). Cancelled frozen for everyone.
- `updateAutoscuolaAppointmentStatus()` — lifecycle transitions (proposal → scheduled → checked_in → completed)
- `updateAutoscuolaAppointmentDetails()` — edit notes, rating, lesson types, location, instructor, and **vehicle** (`vehicleId`, null = unassign; validated company-owned + active). Web `EditAppointmentDialog` exposes the vehicle select (2026-06-12) and opens on past/completed guides too (gate `canRescheduleAppointment` = status ≠ cancelled); instructor change stays blocked on concluded guides (select disabled + BE guard)
- `approveAvailabilityOverride()` — approve out-of-availability booking
- `createExamEvent()`, `addExamStudent()`, `removeExamStudent()`, `cancelExamEvent()`
- `getAutoscuolaAppointmentsFiltered()` — lista agenda (light/full); annota ogni guida con `mandatoryLesson` (prime 6 guide individuali **da esattamente 60 minuti** non annullate dell'allievo, `REQUIRED_LESSONS_COUNT`; guide di altra durata non sono obbligatorie e non consumano slot — criterio 2026-06-12) ed `examNextDay` (esame il giorno dopo, da `case.drivingExamAt` o appuntamento esame) via `buildAppointmentGridFlags` — usati dai colori della vista griglia mobile
- `setExamPriorityOverride()` — manual exam priority toggle
- `getLateCancellations()`, `resolveLateCancellation()` — late cancel management

## DB models
- `AutoscuolaAppointment` — status, startsAt/endsAt, instructorId, vehicleId, studentId, rating, notes, cancellationReason/Kind, rescheduledAt, availabilityOverrideApproved, lateCancellationAction, invoiceId/invoiceStatus
- `AutoscuolaCase` — tracks lesson progress per student

## Appointment statuses
`proposal` → `scheduled` → `checked_in` → `completed` (or `cancelled` at any stage)

## Lesson types
manovre, urbano, extraurbano, notturna, autostrada, parcheggio, altro

## Connected features
- **Payments** — cancel refunds credits, confirm consumes credits, settlement charges Stripe
- **Repositioning** — cancel queues auto-reposition
- **Notifications** — push on every status change
- **Cache** — invalidates AGENDA + PAYMENTS segments
- **Communications** — case status notifications, auto-checkin/auto-complete via background job
- **Booking Engine** — booking creates appointments via slot matcher
- **Penalties** — late cancellation triggers penalty charge
