# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Reglo is a document orchestration and driving school management platform built with Next.js 15 (App Router), React 19, and TypeScript (strict). The app is localized (next-intl) and uses JWT auth via NextAuth 5 (Credentials provider). The primary domain is **Autoscuole** (driving schools) — a complex vertical with 30+ Prisma models covering scheduling, payments, credits, messaging, and a voice AI assistant.

## Commands

| Command | Purpose |
|---------|---------|
| `pnpm dev` | Dev server + Trigger.dev worker (uses `.env.dev`) |
| `pnpm build` | Production build (dev env) |
| `pnpm build:prod` | Production build (prod env) |
| `pnpm lint` | ESLint |
| `pnpm test` | All Jest tests (unit + integration) |
| `pnpm test:unit` | Unit tests only |
| `pnpm test:integration` | Integration tests (runs in band) |
| `pnpm test:e2e` | Playwright E2E tests |
| `pnpm test:watch` | Jest watch mode |
| `pnpm migrate:dev` | Prisma migrate (dev DB) |
| `pnpm migrate:prod` | Prisma migrate deploy (prod DB) |
| `pnpm studio:dev` | Prisma Studio (dev DB) |
| `pnpm email` | React Email dev server on port 3001 |
| `pnpm trigger:dev` | Trigger.dev worker standalone |
| `pnpm voice:runtime` | Voice runtime server (separate Node process) |

Run a single test file: `pnpm test -- path/to/file.test.ts`

After schema changes: `npx prisma generate` (also runs automatically on `pnpm install`).

## Architecture

### Routing & Pages
- `app/[locale]/` — all routes are locale-scoped via next-intl
- `app/[locale]/(sidebar)/` — authenticated pages with sidebar layout (home, autoscuole, compilazioni, workflows, assistant)
- `app/[locale]/(auth)/` — NextAuth route handlers
- `app/[locale]/admin/` and `app/[locale]/backoffice/` — internal admin areas
- `app/api/` — REST endpoints for mobile, voice, webhooks, file uploads, and integrations

### Data Mutations: Server Actions
All mutations go through server actions in `lib/actions/*.actions.ts` — not REST endpoints. Each action file uses Zod for input validation and returns errors via `formatError()`. Actions check service access before proceeding.

### Database
- **PostgreSQL** on Neon (serverless) with `@prisma/adapter-neon`
- Schema: `prisma/schema.prisma` (~1000 LOC, 48 models)
- Two connection strings: `DATABASE_URL` (pooled) and `DIRECT_URL` (direct) in env files
- Prisma client singleton in `db/prisma.ts` with extensions for Decimal → string conversion
- UUIDs for PKs, `@db.Timestamp(6)` for timestamps

### Auth
- NextAuth 5 (beta) with JWT strategy, 30-day token lifetime
- Credentials provider (email/password) + auto-provisioned global admin from env vars
- Route protection via regex in `auth.config.ts`
- Mobile auth uses long-lived `MobileAccessToken` (separate from NextAuth)
- Admin/backoffice auth in `lib/backoffice-auth.ts`

### Autoscuole Domain (`lib/autoscuole/`)
The largest domain module — 15+ specialized submodules handling:
- Availability slot generation & weekly schedules
- Appointment booking, repositioning, and cancellation
- Lesson credit ledger (balance tracking, policies)
- Payment plans & Stripe Connect settlement
- WhatsApp/SMS messaging rules & templates
- Voice AI secretary (Twilio + OpenAI Realtime, separate runtime in `voice-runtime/`)
- Push notifications for mobile app

### Background Jobs
Trigger.dev 4.4.0 handles scheduled/cron workflows in `lib/workflows/`. Deployed separately via `pnpm trigger:deploy:dev` or `pnpm trigger:deploy:prod`.

### UI & Design System
- Radix UI primitives + Tailwind CSS 4 + Class Variance Authority (CVA) for variants
- Shared components in `components/ui/` (shadcn/ui pattern)
- Design tokens via CSS variables (see `tailwind.config.ts`)
- Color rule: 70% neutrals, 20% pink (`#EC4899`), 10% yellow accent (`#FACC15`)
- Full design system reference in `DESIGN_SYSTEM.md`
- Icons: `@tabler/icons-react` and `lucide-react`

### Integrations
Stripe (payments + Connect), Resend (email), Slack, Notion, AWS S3, Cloudflare R2, Twilio (voice), Upstash Redis (caching).

### Environment
- `.env.dev` and `.env.prod` — all scripts select env via `DOTENV_CONFIG_PATH`
- Never commit `.env.*` files

## Conventions

- TypeScript strict mode, 2-space indentation
- `@/*` path alias for all workspace imports
- Server actions for mutations, server components for data fetching
- Revalidation via `revalidatePath()` / `revalidateTag()`
- Jotai atoms in `atoms/` for lightweight client state
- Tests in `tests/` directory, mock external services
- Kebab-case file names, PascalCase component exports
- Short imperative commit messages, single-change scope
- Run `pnpm lint` before PRs

## Notifications Architecture

Push notifications must always be recoverable server-side. When adding a new notification type, follow this checklist:

### 1. Backend push (real-time)
Send via `sendAutoscuolaPushToUsers()` in `lib/autoscuole/push.ts`. The push `data` payload MUST include a `kind` string (e.g., `appointment_rescheduled`) that the mobile app uses to route the notification.

### 2. Server-side recovery endpoint
Add a query to `app/api/autoscuole/notifications/route.ts` so the mobile app can recover the notification when it comes back online (sync on foreground via `syncServerNotifications()`). The query reads from existing DB state (e.g., `cancelledAt >= since`, `rescheduledAt >= since`, `status = 'proposal'`). If no existing field supports the query, add a nullable timestamp to the model (like `rescheduledAt` on `AutoscuolaAppointment`).

### 3. Mobile push intent handler (inbox persistence)
In `reglo-mobile/src/components/NotificationOverlay.tsx`, add a handler in the `subscribePushIntent` callback (student block and/or instructor block depending on recipient). The handler must create a `PersistedNotification` and merge it into the local inbox via `mergeFromApi()` + `saveInbox()`. This ensures the notification appears in `NotificationInboxScreen` immediately when the push arrives while the app is in foreground.

### 4. Mobile inbox rendering
In `reglo-mobile/src/screens/NotificationInboxScreen.tsx`, add the new `kind` to:
- `ICON_MAP` — icon from Ionicons
- `getTitle()` — switch case returning Italian title
- `getSubtitle()` — switch case returning formatted subtitle
- `ICON_COLOR_MAP` (optional) — custom icon color
- `isInteractive()` — if the notification is tappable

### 5. Mobile types
Add the new kind + data type to `reglo-mobile/src/types/notifications.ts` in both the `NotificationItem` discriminated union and as a standalone exported type.

### Current notification kinds

| Kind | Recipients | Server recovery | Inbox persistence |
|------|-----------|----------------|-------------------|
| `appointment_proposal` / `proposal` | Student | Appointments with `status='proposal'` | Via live data merge |
| `appointment_cancelled` | Student | `cancelledAt >= since` (non-sick) | Push handler |
| `appointment_rescheduled` | Student + Instructor | `rescheduledAt >= since` | Push handler |
| `swap` / `swap_offer` | Student | Active swap offers `status='broadcasted'` | Via live data merge |
| `swap_accepted` / `confirmation` | Student | — (client-side only) | Via `setConfirmations` |
| `slot_fill_offer` / `waitlist` | Student | Active waitlist offers | Via live data merge |
| `sick_leave_cancelled` | Student + Instructor | `cancellationReason='instructor_sick'` | Push handler |
| `holiday_declared` | Student | `AutoscuolaHoliday.createdAt >= since` | Push handler |
| `weekly_absence` | Instructor | `AutoscuolaStudentWeeklyAbsence` | Push handler |
| `available_slots` | Student | — (transient) | Push handler |
| `appointment_reminder_*` | Both | — (time-based, no recovery needed) | — |
| `broadcast` / `test_push` | Various | — (fire-and-forget) | — |

## Agent Instructions

- Before planning, ask relevant technical questions to remove ambiguity.
- Organize plans into independent high-level steps.
- When backend changes require running scripts or migrations, explicitly say so.
- Before asking a question, check if the answer is already in the documentation.
