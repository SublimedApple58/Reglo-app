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

## Preavviso consultabile dopo la decisione (2026-07-20)
Il **preavviso** di un annullamento dell'allievo (tempo fra `startsAt` e `cancelledAt`) è ora visibile in modo permanente nel tab **"Guide"** del dettaglio allievo (`AutoscuoleStudentsPage.tsx`), non solo finché la guida è nella coda `getLateCancellations`/`AutoscuoleLateCancellationsPanel`. Per gli annullamenti `cancellationKind === "manual_cancel"` si mostra la Pill **"Preavviso: Xh Ymin"** (ricalcolata client, **non** persistita come numero) + badge **"Tardiva"** quando `cancelledAt > penaltyCutoffAt`. Il dato `penaltyCutoffAt` è ora ritornato da `getAutoscuolaStudentDrivingRegister`. Vedi `features/appointments.md`.

## Connected features
- **Payments** — penalty charge via Stripe, tracked in AppointmentPayment
- **Appointments** — reads cancellation time vs cutoff; il preavviso ricalcolato + badge "Tardiva" vivono nel dettaglio allievo (`record_cleanup` NON è un annullamento con penale)
- **Communications** — background job triggers processing
