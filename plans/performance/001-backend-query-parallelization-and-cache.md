# Performance Optimization — Backend Query Parallelization & Settings Cache

## What was done

### Phase 1A: Parallelized instructor-settings route
- `app/api/autoscuole/instructor-settings/route.ts`: Combined `companyService.findFirst()` and `autoscuolaInstructor.findFirst()` into `Promise.all` (batch 1). Combined `publishedWeeks`, `studentMembers`, and `autonomousInstructors` into a second `Promise.all` (batch 2). Eliminated 3 sequential DB round trips.

### Phase 1B: Fixed getBookingOptions
- `lib/actions/autoscuole-availability.actions.ts`: Replaced `getBookingGovernanceForCompany()` (which re-fetched `companyService`) with `parseBookingGovernanceFromLimits(limits)` using already-fetched limits. Parallelized `resolveEffectiveBookingSettings()` and `getStudentLessonPolicyCoverage()` via `Promise.all`.

### Phase 1C: Parallelized getDateAvailabilityMap
- `lib/actions/autoscuole-availability.actions.ts`: Combined `autoscuolaAppointment.findMany()` and `autoscuolaInstructorBlock.findMany()` into `Promise.all`.

### Phase 1D: Settings cache
- Created `lib/autoscuole/cached-service.ts` with `getCachedCompanyServiceLimits()` (5-minute TTL via Redis).
- Added `SETTINGS` segment to `lib/autoscuole/cache.ts`.
- Updated `lib/actions/autoscuole-settings.actions.ts` to invalidate SETTINGS on save.
- Updated `lib/autoscuole/booking-governance.ts` to use cached limits.
- Adopted cached limits in `getBookingOptions`, `getAllAvailableSlots`, and `getDateAvailabilityMap`.

## Files changed
- `app/api/autoscuole/instructor-settings/route.ts`
- `lib/actions/autoscuole-availability.actions.ts`
- `lib/autoscuole/cache.ts`
- `lib/autoscuole/cached-service.ts` (new)
- `lib/autoscuole/booking-governance.ts`
- `lib/actions/autoscuole-settings.actions.ts`
