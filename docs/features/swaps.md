# Swaps

## What it does
Peer-to-peer appointment swaps between students. Instructor can also swap two students' appointments.

## Key files
- `lib/actions/autoscuole-swap.actions.ts` — swap mutations

## Key functions
- `createSwapOffer()` — student proposes swap, broadcasts to peers
- `getSwapOffers()` — offers from OTHER students visible to a viewer (excludes own)
- `getMySwapOffers()` — the viewer's OWN active (broadcasted, not expired, upcoming) offers; same shape as `getSwapOffers` so the mobile reuses the type
- `respondSwapOffer()` — peer accepts/declines
- `cancelSwapOffer()` — requesting student withdraws their own broadcasted offer (status → `cancelled`, no credit movement, invalidates AGENDA)
- `getMyAcceptedSwaps()` — accepted offers the viewer created
- `instructorSwapAppointments()` — instructor moves lesson between students

## API routes (mobile)
- `GET /api/autoscuole/swap/offers` — peers' offers
- `GET /api/autoscuole/swap/my-offers` — viewer's own active offers
- `POST /api/autoscuole/swap/create`
- `POST /api/autoscuole/swap/offers/[offerId]/respond`
- `POST /api/autoscuole/swap/offers/[offerId]/cancel` — revoke own offer
- `GET /api/autoscuole/swap/my-accepted`

## DB models
- `AutoscuolaSwapOffer` — status (broadcasted, accepted, declined, cancelled)
- `AutoscuolaSwapResponse` — individual responses

## Credit handling
On accept: `adjustStudentLessonCredits(swap_consume)` for taker, `adjustStudentLessonCredits(swap_refund)` for giver.

## Non-swappable appointments (fix 2026-06-12)
**Group-lesson seats and exams are NOT swappable.** Guarded in `createSwapOffer`
(blocks offering), `respondSwapOffer` (defense-in-depth for stale offers),
`instructorSwapAppointments` (both A and B), and `getSwapOffers` (where-clause
filter `groupLessonId: null` + `type notIn [group_lesson, esame]`). Reason: a
swap reassigns `studentId` directly and would bypass the group-lesson rules
(opt-in, license, seat count, invite flow) — real incident at Autoscuola Robatto
(2026-06-11): a non-opted-in student entered a group lesson by accepting a swap
offer created by a participant on his seat. Freeing a group seat must go through
"Ritira iscrizione" (`withdrawFromGroupLesson`), which re-broadcasts the invite
to eligible students only. Mobile mirrors the rule: `AllievoHomeScreen.openLessonDetail`
sets `canSwap: false` for `groupLessonId`/`group_lesson`/`esame`.

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
- **Mobile** — `SwapOffersScreen` (peers + "Le tue richieste" sections), home swap marker + revoke via `lesson-detail`, `NotificationOverlay`
