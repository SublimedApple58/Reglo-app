# Availability

## What it does
Instructor and vehicle availability management: weekly schedules, daily overrides, recurring overrides, publication mode.

## Key files
- `lib/actions/autoscuole-availability.actions.ts` — all availability mutations
- `lib/autoscuole/slot-matcher.ts` — reads availability to find bookable slots
- `lib/autoscuole/slot-packing.ts` — pure helpers for anchor-aware slot packing
- `components/pages/Autoscuole/AutoscuoleResourcesPage.tsx` — web instructor/vehicle management (178KB)

## Key functions
- Weekly: `setWeeklyAvailability()`, `deleteWeeklyAvailability()`
- Daily: `setDailyAvailabilityOverride()`, `deleteDailyAvailabilityOverride()`, `getDailyAvailabilityOverrides()`
- Recurring: `setRecurringAvailabilityOverride()` — same override repeated weekly. **Default horizon = 52 weeks** (fix 2026-06-12: the old default, company `availabilityWeeks` ≈ 4, created a rolling gap — the booking horizon advances daily while coverage stayed frozen at save-time+4w, so dates beyond silently fell back to the stale weekly base; the UI says "applica a tutti i [giorno] futuri"). Optional `fromDate` ("YYYY-MM-DD", 2026-06-12): anchors the first occurrence ON/AFTER that date (clamped to today, never the past) — the web dialog passes the selected calendar day so picking Sat 20 does NOT also write Sat 13; mobile callers omit it (weekday-only pickers) and keep anchoring from today. Upserts batched in one `$transaction`, single OR-of-ranges `updateMany` for the approved-flag reset, and now invalidates the AGENDA cache (was missing).
- Publication: `publishInstructorWeek()`, `unpublishInstructorWeek()`, `getInstructorPublishedWeeks()`
- Filter: `getPublicationModeFilter()` — returns closure `(instructorId, date) => boolean` for booking engine gating
- Resolver: `buildAvailabilityResolver()` — checks slots against weekly + daily overrides
- Slot generation: `createAvailabilitySlots()`, `getAllAvailableSlots()`
- Vehicle: `setAutoscuolaVehicleWeeklyAvailability()`
- **Web publication-mode editor (2026-07-07)**: il dialog Disponibilità della `AutoscuoleResourcesPage` è mode-aware (`availabilityMode` dai settings istruttore). In modalità publication mostra `InstructorPublicationEditor` (rail 8 settimane, Pubblica/Ritira via `publishInstructorWeek`/`unpublishInstructorWeek`, righe giorno → `setDailyAvailabilityOverride`, template settimane nuove = ultima pubblicata → base, stessa catena del publish server-side) al posto dei tab Predefinito/Calendario; badge modalità + "Cambia modalità" nell'header (merge settings via `updateAutoscuolaInstructor` — ATTENZIONE: quel campo settings SOSTITUISCE il JSON). Fix incluso: `publishInstructorWeek` materializzava i giorni da `defaultAvail.ranges` piatte → con base per-giorno (`rangesByDay`) pubblicava tutti i giorni come riposo; ora usa `rangesForDay` (valeva anche per il publish mobile). `getAutoscuolaInstructorWeeklyAvailabilities` espone anche `rangesByDay`.
- **Fix 2026-07-07 (fasce che "si cancellavano a caso")**: `setAutoscuolaInstructorWeeklyAvailability` + variante vehicle ora RITORNANO anche `ranges` nel data. Prima la risposta era senza fasce, la web `AutoscuoleResourcesPage` la salvava nella mappa locale → riaprendo il dialog Disponibilità subito dopo un salvataggio si vedeva UNA sola fascia piatta, e risalvando da lì il DB veniva sovrascritto perdendo le altre fasce (riprodotto con 3 fasce su Reglo srl dev).

## DB models
- `AutoscuolaWeeklyAvailability` — recurring base schedule (daysOfWeek, startMinutes, endMinutes, JSON `ranges`, JSON `rangesByDay`)
- `AutoscuolaDailyAvailabilityOverride` — date exceptions with JSON ranges

### Per-weekday base schedule (`rangesByDay`)
The base schedule supports **different ranges per weekday**. `AutoscuolaWeeklyAvailability.rangesByDay` is a nullable JSON map `{ "0": [{startMinutes,endMinutes}], "1": [...], ... }` (0=Sun..6=Sat). When present it is **authoritative**; the flat `daysOfWeek/ranges/startMinutes…` are kept populated with a **representative day** (first active) for legacy/back-compat readers. When absent, the record uses the legacy shared model.

Read accessor: `rangesForDay(record, dayOfWeek)` returns the ranges effective on a weekday for either model. `narrowToDay(record, dayOfWeek)` projects a record to a single date shaped like the legacy resolved record, so **every existing consumer** (`isOwnerAvailable`/`isAvailabilityCovering` copies in slot-matcher, repositioning, swap) keeps working unchanged — both `buildAvailabilityResolver().resolve()` and `resolveEffectiveAvailability()` narrow before returning.

Write: `createAvailabilitySlots()` accepts an optional `scheduleByDay` map; when provided it persists `rangesByDay` and derives the flat fields from the first active day. A shared-hours save (no `scheduleByDay`) clears `rangesByDay` (reverts to legacy). Read: `getDefaultAvailability()` always returns `scheduleByDay` (legacy records are projected by applying the shared ranges to each active day). Daily overrides are unchanged and still win over the base.
- `AutoscuolaAvailabilitySlot` — published bookable slots (open/booked)
- `AutoscuolaInstructorPublishedWeek` — unique on companyId + instructorId + weekStart

## Publication mode
Setting `availabilityMode: "publication"` on instructor JSON settings. Students can only book in published weeks. Owner/admin ignore this gate. Gating applied in `getAllAvailableSlots()`, `createBookingRequest()`, `findBestAutoscuolaSlot()`.

## Anchor-aware slot packing
Implemented in `lib/autoscuole/slot-packing.ts` (pure helpers `computeFreeIntervalsInRange` + `computeAnchorAwareEntryPoints`).

Both `getAllAvailableSlots()` and `getDateAvailabilityMap()` build candidate entry-points by subtracting each instructor's busy intervals from their availability ranges, then asking the helper to emit:
1. The **leading anchor** (start of the free interval), so the lesson packs flush against the previous lesson / window start.
2. The **trailing anchor** (`end - duration`), so the lesson packs flush against the next lesson / window end.
3. **Intermediate grid ticks** (`:00/:30` — or `:00` cascading from `range.startMinutes % 60` when `roundedHoursOnly` is true), but only when the residue on each side is either zero or ≥ `min(bookingSlotDurations)`.

The orphan filter eliminates the classic 15-min orphans that appear when durations are mixed (e.g. a 45-min lesson at 10:00 ends at 10:45; without anchors, the next student would be offered 11:00, leaving 10:45–11:00 unreachable). With anchoring, 10:45 is itself a valid entry-point and 11:00 is suppressed.

`roundedHoursOnly` does not suppress the anchors — that would re-introduce the orphans it is meant to fix. The flag only constrains intermediate ticks.

End-of-day residues smaller than `min(bookingSlotDurations)` are tolerated and not surfaced to the student: the instructor can still use them manually.

Unit tests: `tests/unit/autoscuole/slot-packing.test.ts`.

## Group-lesson containers as busy intervals (fix 2026-06-12)
Scheduled `AutoscuolaGroupLesson` containers block their instructor AND vehicle in
all booking-engine busy-interval builders, **regardless of seat count**. Participant
rows already block via normal appointments, but an EMPTY group lesson (0 seats,
open invites) has no appointment rows and was invisible — students could book a
single guide on top of it (Robatto incident). Shared helper:
`lib/autoscuole/group-lesson-busy.ts` (`fetchGroupLessonBusyRows` +
`addGroupLessonBusyIntervals`), merged in: `getAllAvailableSlots`,
`getDateAvailabilityMap`, `createBookingRequest`, `slot-matcher.findBestAutoscuolaSlot`.
NOT applied to staff manual flows (they may deliberately overbook with their own warnings).

`AutoscuolaInstructorBlock` rows are likewise merged into the busy intervals of all
four sites. `createBookingRequest` was MISSING them until 2026-06-12 (the slot list
excluded blocked times but the final booking-time placement did not, so a student
booking could land inside a "blocca slot" — Robatto incident #2): now it fetches
blocks in the same Promise.all wave and pushes them into `appointmentMaps.intervals`
keyed by `instructorId`.

## Connected features
- **Booking Engine** — slot-matcher reads all availability data; publication filter gates booking
- **Group Lessons** — containers (even empty) are busy intervals for instructor+vehicle (see above)
- **Repositioning** — reposition uses slot-matcher
- **Notifications** — `availability_published` push to assigned students
- **Cache** — invalidates AGENDA segment
- **Instructor Clusters** — `parseInstructorSettings()` provides availabilityMode
