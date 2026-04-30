# Penalties

## What it does
Late cancellation and no-show tracking with automatic penalty charges.

## Key files
- `lib/autoscuole/payments.ts` — `processAutoscuolaPenaltyCharges()`
- `lib/autoscuole/communications.ts` — triggers penalty processing in background job
- `lib/actions/autoscuole.actions.ts` — `getLateCancellations()`, `resolveLateCancellation()`
- `components/pages/Autoscuole/AutoscuoleLateCancellationsPanel.tsx` — web UI

## Settings
- `penaltyCutoffHours`: 1, 2, 4, 6, 12, 24, 48 hours before lesson
- `penaltyPercent`: 25%, 50%, 75%, 100% of lesson price

## Flow
1. Student cancels within cutoff window → `lateCancellationAction` set on appointment
2. Background job processes penalties → charges Stripe via `processAutoscuolaPenaltyCharges()`
3. Admin can manually resolve via `resolveLateCancellation()`

## Connected features
- **Payments** — penalty charge via Stripe, tracked in AppointmentPayment
- **Appointments** — reads cancellation time vs cutoff
- **Communications** — background job triggers processing
