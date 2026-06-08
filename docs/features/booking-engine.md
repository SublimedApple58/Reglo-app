# Booking Engine

## What it does
Slot matching, booking governance, waitlist broadcasting, instructor booking suggestions.

## Key files
- `lib/autoscuole/slot-matcher.ts` — find compatible slots
- `lib/autoscuole/booking-governance.ts` — booking rules and limits
- `lib/autoscuole/lesson-policy.ts` — lesson type constraints
- `lib/autoscuole/exam-priority.ts` — 14-day exam priority window
- `lib/actions/autoscuole-availability.actions.ts` — booking request flow, waitlist, suggestions

## Key functions
- `findBestAutoscuolaSlot()` — core slot matching (respects instructor, vehicle, student conflicts + lesson policy + governance)
- `getBookingGovernanceForCompany()` — weekly limits, booking actors, instructor booking mode
- `isLessonTypeAllowedForInterval()` — lesson type time/day restrictions
- `hasExamPriority()` — exam priority check (auto-detected from case or manual override)
- `broadcastWaitlistOffer()` — notify waiting students when slots open
- `suggestInstructorBooking()` — auto-suggest slots for instructors
- `getPublicationModeFilter()` — gate booking by publication status
- `getStudentBookingBlockStatus()` — check if student is blocked
- `createBookingRequest()` — student booking desire → slot matching → offer

## Governance settings
- `appBookingActors`: "students_only" | "instructors_only" | "both"
- `instructorBookingMode`: "manual_full" | "manual_engine"
- `weeklyBookingLimit`: max bookings per week
- `bookingCutoffTime`: no booking after this time
- `bookingBlocked` / `weeklyBookingLimitExempt`: per-student flags

## Booking gate coverage (`bookingMinStartDate` — "Prenotazioni aperte dal")
The `serviceLimits.bookingMinStartDate` gate is enforced **only** in
`createBookingRequest()` (student self-booking from the app). It does **not**
cover swap accepts (`respondSwapOffer`) — a student can still acquire an existing
appointment dated before the gate by accepting a swap. Repositioning used to
bypass it too, but repositioning is now retired (see
[repositioning.md](repositioning.md)) so cancellations no longer create
pre-gate appointments. If full gate coverage is ever required, add the
`bookingMinStartDate` check to `respondSwapOffer` as well.

## Connected features
- **Availability** — reads weekly, daily overrides, published weeks, holidays
- **Appointments** — creates appointments when booking confirmed
- **Payments** — captures payment snapshot on booking
- **Instructor Clusters** — respects cluster assignments, autonomous mode, durations
- **Notifications** — waitlist broadcasts
