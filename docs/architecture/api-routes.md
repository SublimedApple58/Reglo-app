# API Routes

95+ REST endpoints in `app/api/`.

## /api/autoscuole/ (27 sub-directories)
Main driving school API. Uses `requireServiceAccess()` for auth.

`agenda`, `appointments` (CRUD + cancel, permanent-cancel, reschedule, reposition, approve-override, status, out-of-availability, latest-note), `availability` (default, overrides, overrides/recurring, slots, published-weeks), `available-slots`, `booking-options`, `booking-requests`, `cases`, `date-availability`, `deadlines`, `exam`, `holidays`, `instructor-blocks`, `instructor-bookings` (suggest, confirm, confirm-batch), `instructor-hours`, `instructor-settings`, `instructor-sick-leave`, `instructors`, `notifications` (recovery endpoint for mobile), `overview`, `payments` (bootstrap, appointments, logs, overview, stripe-connect), `settings`, `students` (CRUD + completed-hours), `swap` (create, offers, respond, my-accepted, instructor-swap), `vehicles`, `voice` (calls, knowledge/chunks), `waitlist` (offers, respond), `weekly-absence`

## /api/mobile/ (separate auth)
Mobile app endpoints using `MobileAccessToken`.

`auth/` (login, signup, logout, delete-account, select-company, student-register), `me/`, `profile/`, `push/` (register, unregister), `payments/` (profile, history, setup-intent, confirm-method, remove-method, appointments/[id]/pay-now, appointments/[id]/document), `invites/`

## /api/voice/
Telephony webhooks.

`twilio/` (incoming, status, recording, transfer-fallback), `telnyx/` (call-control, tools), `runtime/` (tool dispatch), `preview/`

## /api/integrations/
OAuth flows: Stripe Connect, Fatture-in-Cloud (clients, entities, payment-methods, vat-types)

## /api/webhooks/
`stripe/` — payment webhook processing

## /api/uploads/
`avatar/`, `company-logo/` — presigned R2 URLs

## /api/auth/
NextAuth route handler

## /api/backoffice/
Voice line assignment
