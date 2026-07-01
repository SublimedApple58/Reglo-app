# Feature Index — Reglo (Web + Backend)

> 🧪 **Lavori su staging?** → [STAGING.md](STAGING.md) — account di test, comandi (`ship:staging`, `migrate:staging`, seed), accesso, mobile, setup dev.

## Features

| Feature | Doc | Primary files |
|---------|-----|--------------|
| Appointments | [appointments.md](features/appointments.md) | `autoscuole.actions.ts` |
| Availability | [availability.md](features/availability.md) | `autoscuole-availability.actions.ts` |
| Booking Engine | [booking-engine.md](features/booking-engine.md) | `slot-matcher.ts`, `booking-governance.ts` |
| Vehicles | [vehicles.md](features/vehicles.md) | `autoscuole.actions.ts` (vehicle CRUD), `fixed-vehicle.ts`, `slot-matcher.ts` |
| Group lessons | [group-lessons.md](features/group-lessons.md) | `autoscuole.actions.ts` (group-lesson CRUD), `autoscuole-availability.actions.ts` (invites), `group-lessons/` API |
| Payments & Credits | [payments.md](features/payments.md) | `payments.ts`, `stripe-connect.ts` |
| Swaps | [swaps.md](features/swaps.md) | `autoscuole-swap.actions.ts` |
| Holidays | [holidays.md](features/holidays.md) | `autoscuole-holidays.actions.ts` |
| Notifications | [notifications.md](features/notifications.md) | `push.ts`, `notifications/route.ts` |
| Instructor Clusters | [instructor-clusters.md](features/instructor-clusters.md) | `instructor-clusters.ts`, `autoscuole-settings.actions.ts` |
| Instructor Hours | [instructor-hours.md](features/instructor-hours.md) | `autoscuole.actions.ts` (`getInstructorDrivingHours`, `getInstructorDrivingHoursRange`), `instructor-hours/route.ts` |
| Communications | [communications.md](features/communications.md) | `communications.ts`, `whatsapp.ts` |
| Cases & Deadlines | [cases-deadlines.md](features/cases-deadlines.md) | `autoscuole.actions.ts` |
| Repositioning **(retired)** | [repositioning.md](features/repositioning.md) | `repositioning.ts` |
| Penalties | [penalties.md](features/penalties.md) | `payments.ts`, `communications.ts` |
| Voice AI | [voice-ai.md](features/voice-ai.md) | `voice.ts`, `voice-webhook.ts` |
| Quiz Teoria | [quiz-theory.md](features/quiz-theory.md) | `autoscuole-quiz.actions.ts`, `quiz-engine.ts` |
| Password Reset (mobile) | [password-reset.md](features/password-reset.md) | `lib/auth/password-reset.ts`, `lib/mobile-auth-payload.ts`, `app/api/mobile/auth/password-reset/*` |
| Student Phase + Quiz Seats | [student-phase.md](features/student-phase.md) | `autoscuole.actions.ts` (`updateStudentPhase`), `autoscuole-settings.actions.ts` (`grantQuizSeat`, `setAutoAssignQuizOnSignup`, `getQuizSeatsContext`), `backoffice.actions.ts` (`getQuizSeatsUsage`, `deactivateTeoriaWithResolution`), `theory-reminders.ts` |
| Reglo Aula | [reglo-aula.md](features/reglo-aula.md) | `aula.actions.ts`, `lib/aula/{slides,package-store,live-state}.ts`, `app/aula-live/[code]/`, `app/[locale]/aula/` |

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
