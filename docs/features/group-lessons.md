# Guide di gruppo (Group lessons) — backend & web

## What it does
Optional module letting a school run **group driving lessons**: 1 instructor + 1 vehicle + **up to 3 students**, typically 3–4 hours, shown as a prominent, distinct event in the agenda. The lesson container exists **independently of its participants** (open seats): the owner/instructor schedules it, may **pre-add** opted-in students, and may **open the remaining seats to an invite** that eligible students self-enrol into (first-come-first-served until full).

- **Optional**: gated on `CompanyService.limits.groupLessonsEnabled` (toggled in web *Configurazione → Gestione allievi*).
- **Per-student opt-in**: `CompanyMember.groupLessonsOptIn` (default `false`), editable from the web student drawer AND mobile instructor/owner student detail. A student can only be pre-added/invited if opted-in.
- **No credit consumed**: each participant seat is billed as a standalone "da pagare" charge (NOT a lesson credit). Priced like a standard 60' lesson (`limits.lessonPrice60`) — no dedicated price setting.
- **License-aware**: when the Vehicles module is on, only students whose pursued license matches the lesson vehicle (category + transmission) can be pre-added/invited/accept (`vehicleServesLicense`).

## Data model (`prisma/schema.prisma`)
- **`AutoscuolaGroupLesson`** (container): `id, companyId, instructorId?, vehicleId?, startsAt, endsAt?, capacity (default 3), status("scheduled"|"cancelled"), priceAmount, notes, createdByUserId`.
- **`AutoscuolaGroupLessonInvite`** + **`AutoscuolaGroupLessonInviteResponse`** — mirror `AutoscuolaWaitlistOffer`/`...Response`. Status: invite `broadcasted`→`filled`/`cancelled`; response `accepted`/`declined`. `@@unique([inviteId, studentId])` blocks double-accept.
- **`AutoscuolaAppointment.groupLessonId`** (nullable FK, `onDelete: Cascade`): participants are real appointment rows with `type="group_lesson"` → they reuse agenda/overlap/payments/history for free.
- **`CompanyMember.groupLessonsOptIn Boolean @default(false)`**.
- Migration: `20260610120000_add_group_lessons` (additive, no backfill).

## Payment semantics
Participant appointments are written **directly** (NOT via `prepareAppointmentPaymentSnapshot`, which would consume a credit): `creditApplied=false, paymentRequired=true, paymentStatus="pending", manualPaymentStatus="unpaid", priceAmount=getGroupLessonPrice()`. `paymentStatus="pending"` is **inert to Stripe** (the auto-charge job only touches `pending_penalty`/`partial_paid`); the charge surfaces in the payments list (`paymentRequired=true`) and as a manual "da pagare" item. `getGroupLessonPrice` is in `lib/autoscuole/payments.ts`.

## Server actions (`lib/actions/autoscuole.actions.ts`)
- `createGroupLesson({startsAt, endsAt, vehicleId?, instructorId?, capacity?, studentIds?, notes?})` — OWNER+INSTRUCTOR (instructor auto-assigns self). Gated on `groupLessonsEnabled`. Validates instructor/vehicle, students (opted-in + license), overlap; transaction creates the container + one participant appointment per pre-added student.
- `addGroupLessonParticipant` / `removeGroupLessonParticipant` (cancels the seat + drops its pending charge).
- `cancelGroupLesson` — cancels the container, all participant appointments, and open invites.
- `getGroupLessonsForAgenda({from?, to?})` — returns lessons with `filledSeats`/`openSeats`/`participants`, incl. **empty** lessons (used by `GET /api/autoscuole/group-lessons` list). Empty-lesson agenda cards now come from the bootstrap `gl-empty:` synthesis, not this action.
- `getGroupLesson(id)` — single lesson detail (instructor/vehicle/seats/participants). Consumed by the mobile "Gestisci guida di gruppo" modal AND the student "Ritira iscrizione" sheet. **Student-safe**: a non-staff caller (STUDENT) may only read a lesson they're enrolled in, and the other participants are returned **anonymous** (`appointmentId`/`studentId` masked to `""`, `studentName: null`) so seat counts work without leaking identities.
- `updateGroupLesson({groupLessonId, startsAt?, endsAt?, instructorId?, vehicleId?, notes?})` — edits time/instructor/vehicle and **cascades to all participant appointments**; `notes` (nullable, max 2000) updates the container only (instructor operational notes, empty string clears). Consumed by the mobile manage modal (auto-save on instructor/vehicle change, "Sposta" for time, "Note" editor sheet).
- `listEligibleGroupLessonInvitees(groupLessonId)` — opted-in, not-enrolled, license-compatible students (needs an existing lesson).
- `listOptedInGroupLessonStudents()` — opted-in students + license info **without** an existing lesson; used by the web **create** dialog to pre-add eligible students. OWNER/INSTRUCTOR/admin gated.
- `updateStudentGroupLessonOptIn({studentId, optIn})` — OWNER/admin OR any instructor.
- `getAutoscuolaAgendaBootstrapAction` now also returns `groupLessonsEnabled` (next to `vehiclesEnabled`, from `CompanyService.limits`) so the web agenda knows whether to show the "Nuovo → Guida di gruppo" item.
- Helpers: `validateGroupLessonStudents`, `findGroupLessonOverlap`, `GROUP_LESSON_ACTIVE_STATUSES`.

## Invite actions (`lib/actions/autoscuole-availability.actions.ts`)
- `broadcastGroupLessonInvite({companyId, groupLessonId, expiresAt})` — recipients = opted-in + license-compatible + available + no conflict + not enrolled; push `data.kind:"group_lesson_invite"` (also email/whatsapp per `slotFillChannels`).
- `inviteToGroupLesson({groupLessonId, expiresInHours?})` — public wrapper (OWNER+INSTRUCTOR); expiry = min(now+hours, lesson start), default 24h.
- `respondGroupLessonInvite({inviteId, studentId, response})` — **multi-seat accept** in a transaction guarded by `SELECT … FOR UPDATE` on the lesson row + the `[inviteId, studentId]` unique constraint → no overbooking. Creates the participant appointment (da pagare); marks the invite `filled` when the last seat is taken.
- `getGroupLessonInvites({studentId, limit?})` — eligibility-filtered invites for a student (inbox + offline recovery).
- `cancelGroupLessonParticipantAppointment({companyId, appointmentId, actorUserId})` — **shared cancellation helper** (single source of truth) used by instructor removal AND student withdrawal AND the defensive `cancelAutoscuolaAppointment` delegation. Payment behaviour mirrors a normal lesson (decision **A**, 2026-06-10): **before `penaltyCutoffAt`** → frees the seat and zeroes the charge (`paymentRequired:false`, `not_required`, `manualPaymentStatus:null`); **after the cutoff or after the lesson happened** → keeps it "da pagare" and lets the existing **late-cancellations inbox** (`getLateCancellations`/`resolveLateCancellation`) pick it up via `cancellationKind:'manual_cancel'` + `penaltyCutoffAt` (no type filter there). Then, if the lesson is still scheduled/future with open seats, **re-broadcasts** an invite (`broadcastGroupLessonInvite`). If the actor is the student themselves, **pushes the instructor** a `appointment_cancelled` notification.
- `withdrawFromGroupLesson({groupLessonId})` — STUDENT withdraws their own seat (resolves their own active appointment, guards "lesson not started", delegates to the shared helper).

> **Prerequisite (penalty fields at creation):** all 3 seat-creation sites (`createGroupLesson`, `addGroupLessonParticipant`, `respondGroupLessonInvite`) now set `penaltyCutoffAt` (= `startsAt − penaltyCutoffHours`) and `penaltyAmount` via `getGroupLessonPenaltySnapshot` (`lib/autoscuole/payments.ts`), so the early/late distinction and the late-cancellations inbox work. **No migration** — these columns already exist on `AutoscuolaAppointment`.

## API routes (`app/api/autoscuole/group-lessons/`)
- `route.ts` (GET list `?from&to`, POST create), `[id]/route.ts` (**GET** detail → `getGroupLesson`, **PATCH** edit → `updateGroupLesson`, DELETE cancel), `[id]/participants` (POST add, DELETE remove `?studentId`), `[id]/invite` (POST), `[id]/withdraw` (**POST** student self-withdraw → `withdrawFromGroupLesson`), `[id]/eligible-invitees` (GET), `invites/route.ts` (GET recovery `?studentId&limit`), `invites/[inviteId]/respond` (POST). Opt-in: `students/[id]/group-lesson-opt-in` (PATCH).
- Recovery is also aggregated in `app/api/autoscuole/notifications/route.ts` (kind `group_lesson_invite`).

## Settings (`lib/actions/autoscuole-settings.actions.ts`)
`groupLessonsEnabled` (default false) added to the patch schema, `AutoscuolaSettingsData`, resolver and `updateAutoscuolaSettings`. No price setting — `getGroupLessonPrice` always returns `lessonPrice60`.

## Web UI (`components/pages/Autoscuole/`)
- `tabs/StudentsTab.tsx` — "Guide di gruppo" accordion: enable toggle + price input.
- `AutoscuoleStudentsPage.tsx` — per-student opt-in toggle row in the drawer (shown when `groupLessonsEnabled`), via `updateStudentGroupLessonOptIn`; `groupLessonsOptIn` flows from `getAutoscuolaStudents*` and the driving register.
- `AutoscuoleAgendaPage.tsx` — `type==="group_lesson"` appointment cards render in a distinct **teal** style with a "Gruppo" badge. Participant rows are **collapsed to ONE card per `groupLessonId`** (in the `regularAppointments` memo): a representative row whose student label becomes `"Guida di gruppo · N/3"` (no participant name leaks), across all 3 agenda views (classic day / week / instructor grid). **Empty group lessons** (0 participants) have no appointment rows, so `getAutoscuolaAgendaBootstrapAction` **synthesizes one placeholder row per empty, still-scheduled lesson** (`id: gl-empty:<glId>`, placeholder student "Guida di gruppo", honouring the instructor/vehicle/type/status filters, gated on `groupLessonsEnabled`). This is the **single source** consumed by BOTH web and mobile — the `regularAppointments` collapse treats a `gl-empty:` row as `filled=0`. Without this they'd be invisible → un-manageable → orphaned student invites.
- `dialogs/GroupLessonCreateDialog.tsx` — **web create flow** (opened from a new 4th "Nuovo" agenda menu item "Guida di gruppo", gated on `groupLessonsEnabled`). Fields: giorno + ora inizio (prefilled from the focused day), durata (1–4h), istruttore, veicolo (only if `vehiclesEnabled`), pre-add opted-in students (multi-select capped at capacity 3, license-filtered by the chosen vehicle via `listOptedInGroupLessonStudents`), and an "Apri i posti rimanenti agli inviti" toggle → `inviteToGroupLesson` after a successful `createGroupLesson`. On success: toast + agenda reload.
- `dialogs/GroupLessonManageDialog.tsx` — manage existing lessons (roster add/remove, invite, edit time/instructor/vehicle, cancel). Opened from the teal group-lesson card / placeholder card.

## Behaviour notes
- Capacity is fixed at 3 in the mobile create flow (the field exists on the model for flexibility).
- No `trigger:deploy` is required unless an invite-expiry cron is added (v1 = passive expiry checked at respond/list time via `expiresAt`). The empty-slot notification cron is unrelated.

## Participation behaviour (decided 2026-06-10, implemented)
- **Student withdrawal**: YES. The student frees their seat → it's **re-broadcast** to eligible students. Instructor gets a push.
- **Check-in**: none. The instructor may **remove** a participant any time — even close to the lesson and **even after** it happened — and the removal flows into late cancellations like a normal lesson.
- **Payment (decision A)**: reuse the **same normal-lesson cancellation + late-cancellation logic** — early cancel = seat freed, no charge; late cancel / removal = stays "da pagare" and surfaces in the *cancellazioni tardive* inbox (owner charges/dismisses). The old "always zero the charge" behaviour of `removeGroupLessonParticipant` is gone.

## Open items / decisions pending from product owner
- Mobile instructor agenda (hour-grid + day-detail) collapses participants into one card per lesson and surfaces empty lessons via the shared bootstrap `gl-empty:` rows (counted as 0). Both `weeklyAgenda.ts` and `IstruttoreHomeScreen` `timelineItems` exclude `gl-empty:`-id rows from the participant count.

## Connected features
- `vehicles.md` (license categories → invitee filtering), booking/slot-matcher (overlap), `notifications.md` (the `group_lesson_invite` kind), payments (the "da pagare" surfacing), mobile `group-lessons`.
- `swaps.md` — **group-lesson seats are NOT swappable** (guards in create/respond/instructor swap + offers list filter, fix 2026-06-12 after the Robatto incident: a swap takeover bypassed the opt-in rules). The only ways in/out of a seat: pre-add, invite accept, withdraw, instructor removal.
- `availability.md` — **containers (even with 0 seats) are busy intervals** for instructor+vehicle in the whole booking engine (`lib/autoscuole/group-lesson-busy.ts`, fix 2026-06-12: empty lessons were invisible and students could book single guides on top).
