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
- `AutoscuolaInstructor` — autonomousMode flag, settings JSON, **inviteCode** (6 char, unique)
- `CompanyMember` — assignedInstructorId (student-to-instructor link)
- `AutoscuolaInstructorBlock` — unavailability blocks (recurrenceGroupId for recurring)

## Instructor invite code
Codice personale a 6 caratteri (`AutoscuolaInstructor.inviteCode`, charset senza 0/O/1/I): un allievo che si registra con questo codice (campo unico "Codice di invito" in signup, condiviso con `Company.inviteCode`) viene iscritto all'autoscuola **e assegnato all'istruttore** (`assignedInstructorId` settato nella stessa transazione di `student-register`).
- **Lookup company-first** in `app/api/mobile/auth/student-register/route.ts`: prima `Company.inviteCode`, poi `AutoscuolaInstructor.inviteCode`. Il codice istruttore è accettato **solo se** `status=active && autonomousMode=true`, altrimenti 404 "Codice di invito non valido" (stesso errore di codice inesistente).
- **Unicità cross-tabella** garantita alla generazione: `lib/autoscuole/invite-codes.ts` (`generateInstructorInviteCode`, `ensureInstructorInviteCode` race-safe con updateMany+retry P2002, check su Company) e check speculare in `getCompanyInviteCode`.
- **Esposizione**: GET `/api/autoscuole/instructor-settings` restituisce `inviteCode` (lazy-gen se mancante); mobile lo mostra in "Il mio gruppo" (solo se autonomo); web lo mostra al titolare nella card istruttore (subtitle) e nel panel "Gestione autonoma" (banner giallo + Copia, `InstructorsTab.tsx`).
- **Backfill**: `scripts/backfill-instructor-invite-codes.ts` (tutti gli istruttori, anche non autonomi — il codice resta inerte finché non sono autonomi). Run: `DOTENV_CONFIG_PATH=.env.dev NODE_OPTIONS=--require=dotenv/config npx ts-node scripts/backfill-instructor-invite-codes.ts` (prod: `.env.prod`). Già eseguito su dev (2026-06-12).

## Connected features
- **Availability** — availabilityMode controls publication vs default
- **Booking Engine** — governance, durations, actors, limits
- **Swaps** — cluster mode affects swap eligibility
- **Communications** — cluster mode affects reminder behavior
- **Repositioning** — respects cluster constraints when finding slots
