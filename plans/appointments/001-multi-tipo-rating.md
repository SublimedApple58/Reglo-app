# Multi-tipo guide + Valutazione a stelle

## What was done

Implemented multi-type lesson support and 1-5 star rating system for driving school appointments.

### Backend
- **Schema**: Added `types String[] @default([])` and `rating Int?` to `AutoscuolaAppointment`
- **Migration**: `20260411090019_add_types_and_rating_to_appointment` with backfill SQL
- **Lesson policy**: Added `validateLessonTypes()` and `isLessonTypesAllowedForInterval()` helpers; updated `getStudentLessonPolicyCoverage()` to check `types[]` array
- **Actions**: `createAutoscuolaAppointment`, `updateAutoscuolaAppointmentStatus`, `updateAutoscuolaAppointmentDetails` all accept `types[]` and `rating`
- **API routes**: PATCH `/appointments/[id]` and `/appointments/[id]/status` pass through `lessonTypes` and `rating`
- **Queries**: All select queries updated to include `types` and `rating` (bootstrap, driving register, filtered appointments)

### Web Frontend
- **Agenda creation dialog**: Single `<Select>` replaced with multi-toggle chip buttons
- **Student detail notes tab**: Multiple type badges rendered + star rating display

### Mobile Frontend
- **Types**: `AutoscuolaAppointment.types`, `rating` added; input types updated with `lessonTypes[]` and `rating`
- **New files**: `src/utils/lessonTypes.ts` (shared helpers), `src/components/StarRating.tsx`
- **IstruttoreHomeScreen**: Multi-select chips for tipo guida, rating picker visible post-checkin, booking drawer multi-select
- **AllievoHomeScreen**: Multi-select chips for booking
- **TitolareHomeScreen**: Multiple type chips + star rating in detail drawer
- **StudentNotesDetailScreen / StudentMyNotesScreen**: Multiple type badges + star rating display

### Backward compatibility
- `type` field (single) always set to `types[0]` for backward compat
- `resolveAppointmentTypes(appt)` helper falls back to `[type]` when `types` is empty
- Backfill SQL copies existing `type` into `types` array for all existing appointments
