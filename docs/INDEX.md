# Feature Index — Reglo (Web + Backend)

## Features

| Feature | Doc | Primary files |
|---------|-----|--------------|
| Appointments | [appointments.md](features/appointments.md) | `autoscuole.actions.ts` |
| Availability | [availability.md](features/availability.md) | `autoscuole-availability.actions.ts` |
| Booking Engine | [booking-engine.md](features/booking-engine.md) | `slot-matcher.ts`, `booking-governance.ts` |
| Payments & Credits | [payments.md](features/payments.md) | `payments.ts`, `stripe-connect.ts` |
| Swaps | [swaps.md](features/swaps.md) | `autoscuole-swap.actions.ts` |
| Holidays | [holidays.md](features/holidays.md) | `autoscuole-holidays.actions.ts` |
| Notifications | [notifications.md](features/notifications.md) | `push.ts`, `notifications/route.ts` |
| Instructor Clusters | [instructor-clusters.md](features/instructor-clusters.md) | `instructor-clusters.ts`, `autoscuole-settings.actions.ts` |
| Communications | [communications.md](features/communications.md) | `communications.ts`, `whatsapp.ts` |
| Cases & Deadlines | [cases-deadlines.md](features/cases-deadlines.md) | `autoscuole.actions.ts` |
| Repositioning | [repositioning.md](features/repositioning.md) | `repositioning.ts` |
| Penalties | [penalties.md](features/penalties.md) | `payments.ts`, `communications.ts` |
| Voice AI | [voice-ai.md](features/voice-ai.md) | `voice.ts`, `voice-webhook.ts` |
| Quiz Teoria | [quiz-theory.md](features/quiz-theory.md) | `autoscuole-quiz.actions.ts`, `quiz-engine.ts` |

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
| API Routes | [api-routes.md](architecture/api-routes.md) |
