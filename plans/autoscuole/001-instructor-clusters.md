# Piano: Istruttori Autonomi (Cluster Allievi)

## What was done

Feature flag `instructorClustersEnabled` a livello company. Quando attiva, il titolare marca istruttori come "autonomi", assegna allievi, e configura durate/orari tondi per istruttore. L'allievo assegnato e vincolato a quell'istruttore per prenotare. L'istruttore autonomo puo auto-gestire le proprie impostazioni da app.

## Files modified

### Backend

| File | Changes |
|------|---------|
| `prisma/schema.prisma` | `autonomousMode`, `settings` on AutoscuolaInstructor; `assignedInstructorId` + relation on CompanyMember |
| `prisma/migrations/20260412004408_add_instructor_clusters/` | Migration SQL |
| `lib/autoscuole/instructor-clusters.ts` | **New** — `isInstructorClustersEnabled()`, `parseInstructorSettings()`, `resolveEffectiveBookingSettings()`, `getAssignedStudentIds()` |
| `lib/actions/autoscuole-settings.actions.ts` | `instructorClustersEnabled` in type, schema, resolve, update, return |
| `lib/actions/autoscuole.actions.ts` | `updateInstructorSchema` extended with `autonomousMode`, `settings`, `assignStudentIds`; `updateAutoscuolaInstructor` handles assignment + inactive cleanup; `listAutoscuolaInstructorsReadOnly` includes `_count.assignedStudents`; `listDirectoryStudents`, `getAutoscuolaStudents`, `getAutoscuolaStudentsWithProgress` include `assignedInstructorId`; `createAutoscuolaAppointment` validates instructor lock for students |
| `lib/actions/autoscuole-availability.actions.ts` | `getBookingOptions` returns cluster fields; `getAllAvailableSlots` forces instructor filter + uses resolved durations/roundedHours |
| `app/api/autoscuole/instructor-settings/route.ts` | **New** — GET/PATCH for instructor self-settings |

### Frontend Web

| File | Changes |
|------|---------|
| `components/pages/Autoscuole/AutoscuoleResourcesPage.tsx` | Toggle `instructorClustersEnabled` in settings; cluster panel dialog on instructor cards (autonomous mode, durations, rounded hours, student assignment) |
| `components/pages/Autoscuole/AutoscuoleStudentsPage.tsx` | Badge with assigned instructor name on student rows |

### Frontend Mobile

| File | Changes |
|------|---------|
| `reglo-mobile/src/types/regloApi.ts` | Extended types: `AutoscuolaInstructor.autonomousMode`, `AutoscuolaStudent.assignedInstructorId`, `MobileBookingOptions` cluster fields, `AutoscuolaSettings.instructorClustersEnabled` |
| `reglo-mobile/src/services/regloApi.ts` | `getInstructorSettings()`, `updateInstructorSettings()` endpoints |
| `reglo-mobile/src/screens/IstruttoreHomeScreen.tsx` | Booking drawer student filtering (assigned first, emergency access for others); "I miei allievi" expandable card with WhatsApp/call |
| `reglo-mobile/src/screens/InstructorNotesScreen.tsx` | SectionList split: "I miei allievi" / "Altri allievi" |
| `reglo-mobile/src/screens/InstructorManageScreen.tsx` | Self-settings section: duration chips + rounded hours toggle |
| `reglo-mobile/src/screens/AllievoHomeScreen.tsx` | Assigned instructor card (pink gradient, WhatsApp/call); locked instructor chip in booking |

## Edge Cases

- Feature OFF: zero changes, all data dormant
- Student without assignment: unchanged behavior
- Instructor inactive: `assignedInstructorId` nulled on all students
- Instructor deleted: `onDelete: SetNull` returns students to pool
- Partial settings (e.g. only durations): waterfall merge from company defaults
