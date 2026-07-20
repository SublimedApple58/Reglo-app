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
1. Un annullamento tardivo popola la coda: (a) allievo che cancella dopo il cutoff (`cancelAutoscuolaAppointment`, mobile) oppure (b) il titolare che sceglie **"Decidi più tardi"** nel dialogo "Annulla guida" (`annulFutureAppointment` con `lateOutcome = "defer"` → `lateCancellationAction` resta `null`). L'istruttore non-titolare è sempre forzato a `defer`. No-show pure entrano in coda.
2. Background job processes penalties → charges Stripe via `processAutoscuolaPenaltyCharges()`
3. Il titolare risolve manualmente via `resolveLateCancellation()` dal pannello (`AutoscuoleLateCancellationsPanel.tsx`).

> Nota: nel dialogo "Annulla guida" il titolare può già decidere subito l'esito (`penalize`/`waive`) senza passare dalla coda — vedi `features/appointments.md`. La coda tardive è solo per i casi lasciati in sospeso (`defer`) o generati dall'allievo/no-show.

## Restituzione credito nelle tardive + CTA dinamici (2026-07-20)
Per una guida **a credito** (`creditApplied`), `resolveLateCancellation` ora gestisce davvero il credito:
- **`action: "dismiss"`** ("Non addebitare" / "Restituisci il credito"): se `creditApplied` e non ancora reso (`creditRefundedAt === null`) **restituisce 1 credito** (`adjustStudentLessonCredits` +1, `cancel_refund`) + `creditRefundedAt`, `lateCancellationAction = "dismissed"`. Prima veniva solo archiviata e il credito restava perso → i due CTA erano di fatto identici.
- **`action: "charge"`** ("Trattieni il credito" / "Addebita"): se il credito era già stato reso lo ri-scala (`adjustStudentLessonCredits` −1, `manual_revoke`); in manual mode segna `manualPaymentStatus = "unpaid"`. `lateCancellationAction = "charged"`.
- **CTA dinamici nel pannello** (`AutoscuoleLateCancellationsPanel.tsx`): `getLateCancellations` espone `creditApplied` per riga. Quando `creditApplied` i due bottoni diventano **"Trattieni il credito"** (`charge`) / **"Restituisci il credito"** (`dismiss`); altrimenti restano "Addebita"/"Non addebitare".

## Preavviso consultabile dopo la decisione (2026-07-20)
Il **preavviso** di un annullamento dell'allievo (tempo fra `startsAt` e `cancelledAt`) è ora visibile in modo permanente nel tab **"Guide"** del dettaglio allievo (`AutoscuoleStudentsPage.tsx`), non solo finché la guida è nella coda `getLateCancellations`/`AutoscuoleLateCancellationsPanel`. Per gli annullamenti `cancellationKind === "manual_cancel"` si mostra la Pill **"Preavviso: Xh Ymin"** (ricalcolata client, **non** persistita come numero) + badge **"Tardiva"** quando `cancelledAt > penaltyCutoffAt`. Il dato `penaltyCutoffAt` è ora ritornato da `getAutoscuolaStudentDrivingRegister`. Vedi `features/appointments.md`.

## Connected features
- **Payments** — penalty charge via Stripe, tracked in AppointmentPayment
- **Appointments** — reads cancellation time vs cutoff; il preavviso ricalcolato + badge "Tardiva" vivono nel dettaglio allievo (`record_cleanup` NON è un annullamento con penale)
- **Communications** — background job triggers processing
