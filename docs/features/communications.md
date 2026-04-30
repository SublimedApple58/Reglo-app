# Communications

## What it does
Message templates, reminder rules, appointment reminders, case deadline notifications, and all background processing jobs.

## Key files
- `lib/autoscuole/communications.ts` — 18 exported functions, central job processor
- `lib/autoscuole/whatsapp.ts` — WhatsApp dispatch
- `lib/actions/autoscuola-communications.actions.ts` — template/rule CRUD
- `trigger/autoscuole-reminders.ts` — cron job calling all processing functions
- `components/pages/Autoscuole/AutoscuoleCommunicationsPage.tsx` — web UI

## Key functions (all called by background job every 1 min)
- `processAutoscuolaAutoCompleteCheckedIn()` — auto-mark completed
- `processAutoscuolaAutoCheckin()` — auto-checkin by time
- `processAutoscuolaAutoPendingReview()` — pending → scheduled transitions
- `processAutoscuolaPenaltyCharges()` → delegates to payments.ts
- `processAutoscuolaLessonSettlement()` → delegates to payments.ts
- `processAutoscuolaPaymentRetries()` → delegates to payments.ts
- `processAutoscuolaInvoiceFinalization()` → delegates to payments.ts
- `processAutoscuolaConfiguredAppointmentReminders()` — template + rule based
- `processAutoscuolaMorningReminders()` — morning notifications
- `processAutoscuolaAppointmentReminders()` — 120/60/30/20/15 min before
- `processAutoscuolaCaseDeadlines()` — pink sheet/medical expiry alerts
- `processAutoscuolaPendingRepositions()` → delegates to repositioning.ts

## Template tokens
`{{student.firstName}}`, `{{student.lastName}}`, `{{appointment.date}}`, `{{case.deadlineLabel}}`, etc.

## Channels
push, email, WhatsApp

## DB models
- `AutoscuolaMessageTemplate` — message bodies
- `AutoscuolaMessageRule` — trigger conditions (appointment type, deadline, offset days)
- `AutoscuolaMessageLog` — sent message audit

## Connected features
- **Payments** — delegates settlement, retry, penalty, invoice processing
- **Notifications** — sends push + WhatsApp + email
- **Repositioning** — processes reposition queue
- **Appointments** — auto-checkin, auto-complete, pending review transitions
- **Cases & Deadlines** — deadline reminder processing
