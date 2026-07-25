# Owner notifications (pagina Notifiche)

## What it does
Full-page **Notifiche** inbox (`/user/autoscuole/notifiche`, reached from the hamburger-menu "Notifiche" item) that tells the **titolare**, in near-real-time, when an **allievo cancels a guide**. Read-only awareness ("prende atto"): the owner sees the list and dismisses rows — nothing else to do. The same page hosts the **"Comunica a tutti"** broadcast at the top (reuses `ComunicatoDialog`). v1 kind = `student_cancellation`; the model is generic so other kinds can be added later.

> **Storia:** in origine era una **campanella** (`OwnerNotificationsBell`) nella top-bar. Sostituita (2026-07-25) da una pagina dedicata: la voce hamburger "Invia comunicato" è diventata "Notifiche" (con pallino rosso `#c13515` sugli avvisi non letti) e la campanella è stata rimossa.

## Key files
- `prisma/schema.prisma` — `AutoscuolaNotification` model (migration `20260716193433_autoscuola_notifications`)
- `lib/autoscuole/notifications.ts` — `listAutoscuolaNotifications` / `markAutoscuolaNotificationsRead` / `deleteAutoscuolaNotifications` / `deleteAutoscuolaNotification` (per-row) + `AutoscuolaNotificationItem` type
- `app/api/autoscuole/owner-notifications/route.ts` — **GET** (list + unread count), **POST** (mark all read), **DELETE** (with `?id=` = single row ✕, without = clear all); owner/admin only
- `components/pages/Autoscuole/AutoscuoleNotifichePage.tsx` — the full page: "Comunica a tutti" card (opens `ComunicatoDialog`) + Airbnb-style flat list; marks all read on open, per-row ✕ dismiss
- `app/[locale]/user/(autoscuole)/autoscuole/notifiche/page.tsx` — route shell
- `components/Layout/AutoscuoleShell.tsx` — hamburger "Notifiche" item → `router.push("/user/autoscuole/notifiche")`, polls unread count (60s) for the red dot on the menu item + hamburger button
- `components/Layout/ComunicatoDialog.tsx` — broadcast push form (`sendBroadcastPush`), reused by the Notifiche page
- `lib/actions/autoscuole.actions.ts` — `createStudentCancellationNotification()` + the trigger inside `cancelAutoscuolaAppointment`; also `checkStudentSlotCancellation()` (booking-popover banner, below)
- `app/api/autoscuole/slot-cancellation-check/route.ts` — **GET** `?studentId&startsAt` → `{ hadCancellation }` (owner/admin/instructor); powers the booking-popover banner

## Data model
`AutoscuolaNotification`: `companyId`, `kind` (default `student_cancellation`), optional refs `appointmentId`/`studentId`, **snapshot** display fields (`studentName`, `startsAt`, `instructorName`, `lessonType`) so a notification stays readable even if the source row is later removed, `readAt` (**per-company** read state), `createdAt`. Indexes on `(companyId, createdAt)` and `(companyId, readAt)`.

## Trigger
Inside `cancelAutoscuolaAppointment`: when the actor is a **STUDENT** (not admin/owner/instructor), the guide is **not an exam**, and `startsAt` is in the **future**, a notification is created via `after()` (best-effort, off the request's critical path). Group-lesson withdrawals take a different cancel path and are **not** covered in v1 (possible extension).

## API / behavior
- **GET** returns `{ items (last 50, desc), unreadCount }` (plain `fetch` + `cache: "no-store"`, no TanStack Query). Non-owners get **403**. The Shell polls it every **60s** (and on route change) to drive the red dot on the "Notifiche" menu item; the Notifiche page fetches once on open.
- **POST** = mark all read (called automatically when the page opens, so the red dot clears). **DELETE** `?id=` = dismiss a single row (the ✕); **DELETE** without id = clear all.
- Real-time is polling-based (cost zero); a managed realtime service can replace polling later without UI changes.

## UI (Airbnb-style, full page)
`/user/autoscuole/notifiche`: page title "Notifiche", then a "Comunica a tutti" card (gold bell + "Invia comunicato" button → `ComunicatoDialog`), then a flat list (no day-group headers, no dividers): avatar initials + "**Nome** ha annullato la guida di `dom 20 lug, 15:00`." + muted relative time ("3 ore fa"), with a per-row ✕ to dismiss (optimistic). Opening the page marks everything read. Empty state uses the faded 3D bell.

## Booking-popover banner (rebooking a cancelled slot)
When the owner/instructor opens **Nuovo appuntamento** in the web agenda and picks a student + day + time, an effect in `AutoscuoleAgendaPage.tsx` (keyed on `form.studentId/day/time`) calls `GET /api/autoscuole/slot-cancellation-check`. If that **same student** had cancelled a guida starting at that **same instant** (duration ignored — match on start only, within the minute), an **orange** inline banner appears under the Allievo field: *"Questo allievo aveva annullato una guida in questo orario."* Purely informative — the booking is **never blocked**. Source = the `AutoscuolaNotification` rows (kind `student_cancellation`), so only student-initiated cancellations trigger it. Same pill styling as the edit dialog's availability badge, in `bg-orange-50 text-orange-700`.

## Not this feature
- `app/api/autoscuole/notifications/route.ts` is the **mobile recovery feed** (derived from other tables) — unrelated. The owner inbox lives at `/api/autoscuole/owner-notifications`.
- Late-cancellation **penalty** management is a separate feature (see `appointments.md` late cancellations); this inbox is pure awareness, no actions on the guide.

## Connected features
- **Appointments** — the trigger hooks the student cancel path in `cancelAutoscuolaAppointment`.
- **Shell / Layout** — the hamburger "Notifiche" item routes to the page and shows the unread red dot.
- **Comunicati (broadcast push)** — the "Comunica a tutti" card at the top of the page reuses `ComunicatoDialog` → `sendBroadcastPush`.
