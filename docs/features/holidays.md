# Holidays

## What it does
Company holiday management with optional bulk appointment cancellation.

## Key files
- `lib/actions/autoscuole-holidays.actions.ts`

## Key functions
- `getHolidays()` — list holidays in date range
- `createHoliday()` — add holiday, optionally cancel all appointments on that date
- `deleteHoliday()` — remove holiday

## DB models
- `AutoscuolaHoliday` — companyId, date, label (optional), createdBy

## Bulk cancellation flow
When `cancelAppointments: true`: finds all non-cancelled appointments for the day, cancels each, calls `refundLessonCreditIfEligible()` per appointment, sends push + email per student (grouped: one notification per student regardless of appointment count).

## Connected features
- **Appointments** — bulk cancel appointments on holiday
- **Payments** — `refundLessonCreditIfEligible()` for each cancelled appointment
- **Notifications** — push + email to affected students (`holiday_declared` kind)
- **Booking Engine** — slot-matcher excludes holiday dates
- **Cache** — invalidates AGENDA + PAYMENTS
