# Repositioning

## What it does
Auto-reschedule cancelled lessons to first available slot. Async queue with retry logic.

## Key files
- `lib/autoscuole/repositioning.ts` — reposition logic
- `lib/autoscuole/slot-matcher.ts` — finds target slots

## Key functions
- `queueOperationalRepositionForAppointment()` — add to reposition queue
- `cancelAndQueueOperationalRepositionByResource()` — cancel + queue for resource changes
- `processAutoscuolaPendingRepositions()` — process queue (up to 50/run, called by background job)

## DB models
- `AutoscuolaAppointmentRepositionTask` — status, attemptCount, nextAttemptAt

## Retry logic
Max attempts configurable, exponential backoff up to 14 days.

## Connected features
- **Booking Engine** — uses `findBestAutoscuolaSlot()` to find targets
- **Availability** — reads weekly, daily overrides, published weeks
- **Notifications** — push to student when repositioned
- **Appointments** — triggered by appointment cancellation
- **Cache** — invalidates AGENDA
