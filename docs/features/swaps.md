# Swaps

## What it does
Peer-to-peer appointment swaps between students. Instructor can also swap two students' appointments.

## Key files
- `lib/actions/autoscuole-swap.actions.ts` — swap mutations

## Key functions
- `createSwapOffer()` — student proposes swap, broadcasts to peers
- `respondToSwapOffer()` — peer accepts/declines
- `cancelSwapOffer()` — withdraw proposal
- `instructorSwapAppointments()` — instructor moves lesson between students

## DB models
- `AutoscuolaSwapOffer` — status (broadcasted, accepted, declined, cancelled)
- `AutoscuolaSwapResponse` — individual responses

## Credit handling
On accept: `adjustStudentLessonCredits(swap_consume)` for taker, `adjustStudentLessonCredits(swap_refund)` for giver.

## Booking gate note
`respondSwapOffer()` reassigns the appointment to the accepting student **without**
checking the `bookingMinStartDate` gate ("Prenotazioni aperte dal"). A student can
therefore acquire an appointment dated before the gate by accepting a swap, even
when app self-booking is closed (the gate is only enforced in `createBookingRequest`).
Add the check here if full gate coverage is required. See [booking-engine.md](booking-engine.md).

## Connected features
- **Payments** — credit adjust for both students
- **Instructor Clusters** — `isStudentInManualFullCluster()` determines eligibility
- **Notifications** — push to both students (swap_offer, swap_accepted)
- **Cache** — invalidates PAYMENTS
- **Mobile** — `SwapOffersScreen` (15s polling), `NotificationOverlay`
