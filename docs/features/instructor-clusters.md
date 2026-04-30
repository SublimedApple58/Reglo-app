# Instructor Clusters

## What it does
Group instructors with shared settings, student assignment, autonomous booking mode, availability mode.

## Key files
- `lib/autoscuole/instructor-clusters.ts` — cluster logic, settings parsing
- `lib/actions/autoscuole-settings.actions.ts` — instructor CRUD, cluster config
- `app/api/autoscuole/instructor-settings/route.ts` — mobile settings API

## Key functions
- `parseInstructorSettings()` — parse JSON settings from `AutoscuolaInstructor.settings`
- `isStudentInManualFullCluster()` — check if student's instructor uses manual_full mode
- `buildCompanyBookingDefaults()` — company-wide booking defaults

## Settings fields (JSON on AutoscuolaInstructor.settings)
- `availabilityMode`: "default" | "publication"
- `autonomousMode`: boolean — enables student self-booking
- `weeklyAbsenceEnabled`: boolean
- `bookingSlotDurations`: number[] (30, 45, 60, 90, 120)
- `roundedHoursOnly`: boolean
- `appBookingActors`: who can book
- `bookingCutoffTime`: minutes from midnight
- `weeklyBookingLimit`: max per week
- `restrictedTimeRange`: no-booking window
- Lesson policy limits per type

## DB models
- `AutoscuolaInstructor` — autonomousMode flag, settings JSON
- `CompanyMember` — assignedInstructorId (student-to-instructor link)
- `AutoscuolaInstructorBlock` — unavailability blocks (recurrenceGroupId for recurring)

## Connected features
- **Availability** — availabilityMode controls publication vs default
- **Booking Engine** — governance, durations, actors, limits
- **Swaps** — cluster mode affects swap eligibility
- **Communications** — cluster mode affects reminder behavior
- **Repositioning** — respects cluster constraints when finding slots
