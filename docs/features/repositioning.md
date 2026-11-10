# Repositioning — REMOVED (codice cancellato il 2026-06-09)

> **Stato: rimosso.** Il motore di riposizionamento (`lib/autoscuole/repositioning.ts`)
> e la route `/api/autoscuole/appointments/[id]/reposition` sono stati cancellati
> nel commit `938b92a` (2026-06-09). Non esiste più il flag `REPOSITIONING_ENABLED`:
> le sezioni qui sotto descrivono il comportamento storico, utile solo per capire
> i dati vecchi (`status: "proposal"`, `AutoscuolaAppointmentRepositionTask`).
> Le cancellazioni operative oggi stanno in `lib/autoscuole/operational-cancellation.ts`
> (`operationallyCancelAppointment`, `operationallyCancelAppointmentsByResource`,
> `annulFutureAppointment`). Per riempire i posti liberati vedi
> `features/student-booking-exceptions.md` (slot liberato, ultimo minuto, guide di gruppo).

## Why it was retired
The engine auto-rescheduled cancelled lessons onto a new slot as a `proposal`.
In practice this caused lessons to "reappear" on new dates every time the school
deleted them (e.g. Autoscuola Robatto: an owner-deleted lesson kept being
re-created on other dates, and it also bypassed the "Prenotazioni aperte dal"
gate — that gate is only enforced in `createBookingRequest`, not here or in swaps).
Decision: every operational cancellation should just cancel the lesson.

## Current behaviour (cancel-only)
The kill-switch is the module constant `REPOSITIONING_ENABLED = false` in
`lib/autoscuole/repositioning.ts` (typed `boolean` so the legacy matching code
stays compiled but dead).

- `queueOperationalRepositionForAppointment()` — now: cancel the lesson
  (`cancellationKind: "operational_cancel"`), release its slots, **refund the
  lesson credit if the lesson was still upcoming** (`refundLessonCreditIfEligible`,
  `cancelledByAutoscuola: true`), and send the **reason-specific** cancellation
  notification (`notifyOperationalCancellationPending`). No task, no proposal.
- `cancelAndQueueOperationalRepositionByResource()` — unchanged caller; inherits
  cancel-only because it loops over the function above.
- `attemptOperationalRepositionTask()` — early-returns under the flag, closing
  any still-pending task (`status: cancelled`) without producing a proposal.
- `processAutoscuolaPendingRepositions()` (cron, `trigger/autoscuole-reminders.ts`)
  — early-returns under the flag, draining all `pending` tasks to `cancelled`.

All callers therefore cancel only, for every reason
(`owner_delete`, `instructor_inactive`, `vehicle_inactive`, `instructor_sick`,
`directory_instructor_removed`, …).

## Entry points that used to reposition (now plain cancel)
- `deleteAutoscuolaAppointment()` and `cancelAndRepositionAutoscuolaAppointment()`
  in `lib/actions/autoscuole.actions.ts` (the latter is the `/api/autoscuole/
  appointments/[id]/reposition` endpoint the mobile instructor app calls).
- Resource cascades: `updateAutoscuolaInstructor` (inactive),
  `updateAutoscuolaVehicle` / `deactivateAutoscuolaVehicle`, `deleteUser`,
  `instructor-sick-leave` route.
- Removed UI CTAs: web "Cancella e riposiziona" (`AutoscuoleAgendaPage.tsx`,
  `OutOfAvailabilitySheet.tsx`); mobile OOB "Riposiziona"
  (`IstruttoreHomeScreen.tsx`, `TitolareHomeScreen.tsx`). The plain
  "Elimina definitivamente" / "Cancella" paths remain.

## DB models
- `AutoscuolaAppointmentRepositionTask` — retained; no new rows are created and
  any `pending` row is closed to `cancelled` by the cron/attempt no-ops.
- Appointment `status: "proposal"` is no longer produced. A one-off script,
  `scripts/retire-repositioning.mjs` (dry-run by default, `--apply` to execute),
  cancelled the leftover live proposals + pending tasks on prod.

## Re-enabling
Non più possibile con un flag: il codice è stato cancellato. Riportarlo vorrebbe
dire recuperarlo dalla storia git (prima di `938b92a`), con i problemi descritti sopra.

## Connected features
- **Appointments** — cancellation entry points
- **Payments** — credit refund on cancel (`refundLessonCreditIfEligible`)
- **Notifications** — reason-specific cancellation push/email
- **Booking Engine** — (storico) usava lo slot matcher; codice rimosso
- **Cache** — invalidates AGENDA / PAYMENTS
