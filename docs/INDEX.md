# Feature Index — Reglo (Web + Backend)

> 🧪 **Lavori su staging?** → [STAGING.md](STAGING.md) — account di test, comandi (`ship:staging`, `migrate:staging`, seed), accesso, mobile, setup dev.

## Features

| Feature | Doc | Primary files |
|---------|-----|--------------|
| Appointments | [appointments.md](features/appointments.md) | `autoscuole.actions.ts` |
| Never-accessed nudge (allievo mai loggato) | [never-accessed-nudge.md](features/never-accessed-nudge.md) | `autoscuole.actions.ts` (`buildNeverAccessedUserIds`), `NeverAccessedNudge.tsx`, `AutoscuoleAgendaPage.tsx`, `AutoscuoleStudentsPage.tsx` |
| Owner notifications (bell annullamenti allievi) | [owner-notifications.md](features/owner-notifications.md) | `AutoscuolaNotification` model, `lib/autoscuole/notifications.ts`, `api/autoscuole/owner-notifications/route.ts`, `OwnerNotificationsBell.tsx`, `autoscuole.actions.ts` (`createStudentCancellationNotification`) |
| Availability | [availability.md](features/availability.md) | `autoscuole-availability.actions.ts` |
| Booking Engine | [booking-engine.md](features/booking-engine.md) | `slot-matcher.ts`, `booking-governance.ts` |
| Vehicles | [vehicles.md](features/vehicles.md) | `autoscuole.actions.ts` (vehicle CRUD), `fixed-vehicle.ts`, `slot-matcher.ts` |
| Group lessons | [group-lessons.md](features/group-lessons.md) | `autoscuole.actions.ts` (group-lesson CRUD), `autoscuole-availability.actions.ts` (invites), `group-lessons/` API |
| Payments & Credits | [payments.md](features/payments.md) | `payments.ts`, `stripe-connect.ts` |
| Swaps | [swaps.md](features/swaps.md) | `autoscuole-swap.actions.ts` |
| Holidays | [holidays.md](features/holidays.md) | `autoscuole-holidays.actions.ts` |
| Locations (Sede e luoghi) | [locations.md](features/locations.md) | `api/autoscuole/locations/*`, `locations/LocationsSection.tsx`, `locations/LocationFormDialog.tsx` |
| Notifications | [notifications.md](features/notifications.md) | `push.ts`, `notifications/route.ts` |
| Instructor Absences (Malattia / Ferie) | [instructor-absences.md](features/instructor-absences.md) | `instructor-sick-leave/route.ts`, `instructor-vacation/route.ts`, `InstructorsTab.tsx` (`MalattiaTab`/`FerieTab`), `operational-cancellation.ts` |
| Lezione teorica (agenda) | [lezione-teorica.md](features/lezione-teorica.md) | `AutoscuoleAgendaPage.tsx` (`blockKind`, `blockTint`/`formatBlockReason`), `autoscuole.actions.ts` (`createInstructorBlock` con `reason:"theory_lesson"`) |
| Instructor Clusters | [instructor-clusters.md](features/instructor-clusters.md) | `instructor-clusters.ts`, `autoscuole-settings.actions.ts` |
| Instructor Hours | [instructor-hours.md](features/instructor-hours.md) | `autoscuole.actions.ts` (`getInstructorDrivingHours`, `getInstructorDrivingHoursRange`), `instructor-hours/route.ts` |
| Instructor Colors | [instructor-colors.md](features/instructor-colors.md) | `lib/autoscuole/instructor-colors.ts`, `color-swatch-picker.tsx`, `InstructorsTab.tsx`, `AutoscuoleAgendaPage.tsx` |
| Communications | [communications.md](features/communications.md) | `communications.ts`, `whatsapp.ts` |
| Cases & Deadlines | [cases-deadlines.md](features/cases-deadlines.md) | `autoscuole.actions.ts` |
| Repositioning **(retired)** | [repositioning.md](features/repositioning.md) | `repositioning.ts` |
| Penalties | [penalties.md](features/penalties.md) | `payments.ts`, `communications.ts` |
| Voice AI | [voice-ai.md](features/voice-ai.md) | `voice.ts`, `voice-webhook.ts` |
| Solo Segretaria (secretary-only) | [secretary-only.md](features/secretary-only.md) | `lib/services.ts` (`secretaryOnly`, `isSecretaryOnly`), `AutoscuoleNav.tsx`, `AutoscuoleTabsPage.tsx`, `AutoscuoleResourcesPage.tsx`, `AutoscuoleShell.tsx`, `BackofficeCompaniesPage.tsx` |
| Quiz Teoria | [quiz-theory.md](features/quiz-theory.md) | `autoscuole-quiz.actions.ts`, `quiz-engine.ts` |
| Password Reset (mobile) | [password-reset.md](features/password-reset.md) | `lib/auth/password-reset.ts`, `lib/mobile-auth-payload.ts`, `app/api/mobile/auth/password-reset/*` |
| Student Phase + Quiz Seats | [student-phase.md](features/student-phase.md) | `autoscuole.actions.ts` (`updateStudentPhase`), `autoscuole-settings.actions.ts` (`grantQuizSeat`, `setAutoAssignQuizOnSignup`, `getQuizSeatsContext`), `backoffice.actions.ts` (`getQuizSeatsUsage`, `deactivateTeoriaWithResolution`), `theory-reminders.ts` |
| Users Directory (delete/anonimizzazione, riuso email, inviti) | [users-directory.md](features/users-directory.md) | `user.actions.ts`, `invite.actions.ts`, `account-deletion.ts` |
| Reglo Aula | [reglo-aula.md](features/reglo-aula.md) | `aula.actions.ts`, `lib/aula/{slides,package-store,live-state}.ts`, `app/aula-live/[code]/`, `app/[locale]/aula/` |
| Support Center + Feedback | [support-center.md](features/support-center.md) | `support.actions.ts`, `AutoscuoleAssistenzaPage.tsx`, `FeedbackDialog.tsx`, `Backoffice{Support,Feedback}Page.tsx` |
| Company Documents (contratto/fatture) | [company-documents.md](features/company-documents.md) | `company-documents.actions.ts`, `api/backoffice/company-documents`, `BackofficeCompanyDocumentsDialog.tsx`, `AutoscuoleAreaPersonalePage.tsx` |
| Company Plan (abbonamento) | [company-plan.md](features/company-plan.md) | `company-plan.actions.ts`, `BackofficeCompanyPlanDialog.tsx`, `AutoscuoleAreaPersonalePage.tsx` |

## Design System

| Doc | Scope |
|-----|-------|
| [design-system.md](design-system.md) | CSS variables, Tailwind tokens, shadows, typography, component catalog, mobile↔web mapping |

## Architecture

| Topic | Doc |
|-------|-----|
| Server Actions pattern | [actions.md](architecture/actions.md) |
| Database & Schema | [database.md](architecture/database.md) |
| Cache system | [cache.md](architecture/cache.md) |
| Background Jobs | [background-jobs.md](architecture/background-jobs.md) |
| Auth & RBAC | [auth.md](architecture/auth.md) |
| Environments (dev/staging/prod) + `APP_ENV` send kill-switch | [environments.md](architecture/environments.md) |
| **Git flow & ambienti** (branch, `ship:staging`, rilascio prod) | [git-flow.md](architecture/git-flow.md) |
| API Routes | [api-routes.md](architecture/api-routes.md) |
| **Performance Playbook** — diagnose & fix slow screens (DB indexing, Redis cache, call schema/batching, per-request overhead, mobile skeletons, TanStack Query, dev-mode) | [performance-playbook.md](architecture/performance-playbook.md) |
