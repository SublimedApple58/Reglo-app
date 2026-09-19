# Background Jobs

## Stack
Trigger.dev 4.4.0. Config: `trigger.config.ts` (max duration 60s, 3 retries, 5s backoff).

## Files
- `trigger/autoscuole-reminders.ts` — main cron job (every 1 min)
- `trigger/autoscuole-empty-slot-notifications.ts` — periodic slot fill broadcasts
- `trigger/prisma.ts` — Prisma client helper

## Deploy
`pnpm trigger:deploy:prod` — **the only deploy script, and it always goes to
production.** There is one Trigger.dev project, so there is no staging
environment for jobs: `trigger:deploy:dev` and `trigger:deploy:staging` used to
exist and deployed to the very same place (REG-498, removed 2026-09-19).

Consequence for the release flow: a new or changed job reaches production only
at the prod step, **together with the migration it needs**. Deploying jobs while
a required column exists only on dev/staging is exactly how they break.

For local work use `pnpm trigger:dev` (or `pnpm dev`, which runs it alongside
Next): that runs the worker against the Trigger.dev `dev` environment and
deploys nothing.

## autoscuole-reminders.ts — job chain (every 1 min)
All processing delegated to `lib/autoscuole/communications.ts`:

1. **Auto-complete**: checked_in appointments past end time → completed
2. **Auto-checkin**: scheduled appointments near start time → checked_in
3. **Pending review**: transitions for edge-case bookings
4. **Penalty charges**: late cancellation fees → `payments.ts`
5. **Lesson settlement**: consume credits + charge Stripe → `payments.ts`
6. **Payment retries**: 3 attempts, 4h/8h exponential backoff → `payments.ts`
7. **Invoice finalization**: push to Fatture-in-Cloud → `payments.ts`
8. **Repositioning queue**: up to 50/run → `repositioning.ts` → `slot-matcher.ts`
9. **Configured reminders**: template + rule based (push/WhatsApp/email)
10. **Morning reminders**: day-of notifications
11. **Appointment reminders**: 120/60/30/20/15 min before
12. **Case deadlines**: pink sheet/medical expiry alerts
13. **Voice cleanup**: call retention (hourly)
