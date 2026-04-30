# Disponibilità a Pubblicazione per Istruttori

## What was done

Implemented a publication-based availability mode for instructors. Instead of fixed weekly availability with exceptions, instructors can now set availability week-by-week and publish it when ready. Students can only book in published weeks.

## Data Model

- New `AutoscuolaInstructorPublishedWeek` model with `companyId`, `instructorId`, `weekStart`, `publishedAt`
- Unique constraint on `(companyId, instructorId, weekStart)`
- Relations added to `AutoscuolaInstructor` and `Company`
- Migration: `20260429121752_add_instructor_published_week`

## Setting

- `availabilityMode: "default" | "publication"` in `InstructorSettings` (JSON field on `AutoscuolaInstructor`)
- Can be set for any instructor (not just autonomous) — the `PATCH /api/autoscuole/instructor-settings` guard was relaxed to allow `availabilityMode` without `autonomousMode`

## Backend Actions

- `publishInstructorWeek(weekStart)` — creates daily overrides for missing days (copies from last published week or default availability), upserts published week record, sends push to assigned students
- `unpublishInstructorWeek(weekStart)` — deletes published week, resets `availabilityOverrideApproved` on appointments
- `getInstructorPublishedWeeks(instructorId?, from?, to?)` — query published weeks
- `getPublicationModeFilter(companyId, instructorIds, rangeStart, rangeEnd)` — returns `(instructorId, date) => boolean` checker for booking engine gating

## Booking Engine Gating

Injected in 3 places (student booking paths only):
1. `getAllAvailableSlots()` — filters out unpublished instructors before slot generation
2. `createBookingRequest()` / `findCandidateForDay()` — skips unpublished instructors in candidate loop
3. `findBestAutoscuolaSlot()` in `slot-matcher.ts` — same filter

Owner/admin appointment creation (`createAutoscuolaAppointment`) is NOT affected.

## API Route

- `GET /api/autoscuole/availability/published-weeks` — list published weeks
- `POST /api/autoscuole/availability/published-weeks` — publish week
- `DELETE /api/autoscuole/availability/published-weeks` — unpublish week

## Notifications

- Push notification kind: `availability_published`
- Server recovery in `GET /api/autoscuole/notifications` (student section)
- Mobile inbox: icon `megaphone-outline`, color `#22C55E`, title "Disponibilità pubblicate"
- Mobile push handler in `NotificationOverlay.tsx` (student block)

## Web App

- New select "Modalità disponibilità" in instructor cluster panel (`AutoscuoleResourcesPage.tsx`)
- Options: "Predefinita" / "A pubblicazione"
- Saved in instructor settings JSON

## Mobile App

- Types: `AvailabilityMode`, `InstructorPublishedWeek`, `AvailabilityPublishedData`
- API: `getPublishedWeeks()`, `publishWeek()`, `unpublishWeek()`
- `InstructorAvailabilityScreen` conditionally renders `PublicationModeEditor` when mode is "publication"
- `PublicationModeEditor`: week navigation, 7 day cards with toggle + ranges editor, publish/unpublish CTA
- `SettingsScreen`: availability mode chips in instructor "Operatività" section
