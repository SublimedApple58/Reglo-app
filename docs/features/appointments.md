# Appointments

## What it does
Full lesson/exam lifecycle: create, propose, confirm, check-in, complete, cancel, reschedule, reposition.

## Key files
- `lib/actions/autoscuole.actions.ts` — all appointment mutations (largest action file)
- `lib/autoscuole/lesson-policy.ts` — lesson type validation, time/day restrictions
- `lib/autoscuole/exam-priority.ts` — 14-day priority window before exam date
- `components/pages/Autoscuole/AutoscuoleAgendaPage.tsx` — web agenda UI (170KB)

## Key functions
- `createAutoscuolaAppointment()` — single lesson
- `createAutoscuolaAppointmentBatch()` — batch (exams)
- `cancelAutoscuolaAppointment()` — cancel with refund + reposition queue
- `rescheduleAutoscuolaAppointment()` — reschedule with audit trail (`rescheduledAt`, `rescheduledFromStartsAt`)
- `updateAutoscuolaAppointmentStatus()` — lifecycle transitions (proposal → scheduled → checked_in → completed)
- `updateAutoscuolaAppointmentDetails()` — edit notes, rating, lesson types
- `approveAvailabilityOverride()` — approve out-of-availability booking
- `createExamEvent()`, `addExamStudent()`, `removeExamStudent()`, `cancelExamEvent()`
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
