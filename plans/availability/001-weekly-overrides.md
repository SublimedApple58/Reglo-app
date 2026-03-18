# Weekly Availability Overrides

## What was done

Per-week availability overrides for instructors and vehicles, allowing different availability settings for specific weeks (up to 12 weeks ahead), with full-week replacement semantics.

## Files Modified

### Database
- `prisma/schema.prisma` — Added `AutoscuolaWeeklyAvailabilityOverride` model with `weekStart` field
- `prisma/migrations/20260318100000_add_weekly_availability_override/migration.sql`

### Backend
- `lib/actions/autoscuole-availability.actions.ts` — Added resolution helpers (`getWeekStart`, `resolveEffectiveAvailability`, `buildAvailabilityResolver`), CRUD actions (`setWeeklyAvailabilityOverride`, `deleteWeeklyAvailabilityOverride`, `getWeeklyAvailabilityOverrides`), updated `getAvailabilitySlots` and `createAvailabilitySlots` to be override-aware
- `lib/actions/autoscuole.actions.ts` — Updated `setAutoscuolaInstructorWeeklyAvailability` conflict-check to be date-aware (skip weeks with overrides)
- `lib/autoscuole/slot-matcher.ts` — Updated `findBestAutoscuolaSlot` to use `buildAvailabilityResolver` for per-day availability resolution
- `lib/autoscuole/repositioning.ts` — Updated `findOperationalCandidate` to use `buildAvailabilityResolver`
- `app/api/autoscuole/availability/overrides/route.ts` — New API route (GET/POST/DELETE)

### Web UI
- `components/pages/Autoscuole/AutoscuoleResourcesPage.tsx` — Added week selector strip to both instructor and vehicle availability dialogs, with override badge dots and "Ripristina predefinito" button

### Mobile
- `reglo-mobile/src/types/regloApi.ts` — Added `WeeklyAvailabilityOverride`, `SetWeeklyAvailabilityOverrideInput`, `DeleteWeeklyAvailabilityOverrideInput` types
- `reglo-mobile/src/services/regloApi.ts` — Added `setWeeklyAvailabilityOverride`, `deleteWeeklyAvailabilityOverride`, `getWeeklyAvailabilityOverrides` API methods
- `reglo-mobile/src/screens/OwnerInstructorScreen.tsx` — Added week selector to availability BottomSheet, override save/reset logic
- `reglo-mobile/src/screens/InstructorManageScreen.tsx` — Added week selector to `AvailabilityEditor` component, override save/reset logic

## Key Design Decisions
- Override replaces the ENTIRE week (full replacement, not merge)
- `buildAvailabilityResolver` batch-fetches overrides + defaults in 2 queries, then provides O(1) per-owner-per-day lookups
- Conflict check runs automatically when override is created/deleted
- Overrides older than 2 weeks are filtered from GET queries
- Max 12 weeks in advance enforced server-side
