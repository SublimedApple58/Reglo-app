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
- Recurring: `setRecurringAvailabilityOverride()` — same override for multiple weeks
- Publication: `publishInstructorWeek()`, `unpublishInstructorWeek()`, `getInstructorPublishedWeeks()`
- Filter: `getPublicationModeFilter()` — returns closure `(instructorId, date) => boolean` for booking engine gating
- Resolver: `buildAvailabilityResolver()` — checks slots against weekly + daily overrides
- Slot generation: `createAvailabilitySlots()`, `getAllAvailableSlots()`
- Vehicle: `setAutoscuolaVehicleWeeklyAvailability()`

## DB models
- `AutoscuolaWeeklyAvailability` — recurring slots (daysOfWeek, startMinutes, endMinutes, splitShift)
- `AutoscuolaDailyAvailabilityOverride` — date exceptions with JSON ranges
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

## Connected features
- **Booking Engine** — slot-matcher reads all availability data; publication filter gates booking
- **Repositioning** — reposition uses slot-matcher
- **Notifications** — `availability_published` push to assigned students
- **Cache** — invalidates AGENDA segment
- **Instructor Clusters** — `parseInstructorSettings()` provides availabilityMode
