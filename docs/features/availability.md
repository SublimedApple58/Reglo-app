# Availability

## What it does
Instructor and vehicle availability management: weekly schedules, daily overrides, recurring overrides, publication mode.

## Key files
- `lib/actions/autoscuole-availability.actions.ts` — all availability mutations
- `lib/autoscuole/slot-matcher.ts` — reads availability to find bookable slots
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

## Connected features
- **Booking Engine** — slot-matcher reads all availability data; publication filter gates booking
- **Repositioning** — reposition uses slot-matcher
- **Notifications** — `availability_published` push to assigned students
- **Cache** — invalidates AGENDA segment
- **Instructor Clusters** — `parseInstructorSettings()` provides availabilityMode
