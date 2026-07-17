# Owner notifications (bell)

## What it does
In-app **bell/inbox** in the autoscuola web top-bar that tells the **titolare**, in near-real-time, when an **allievo cancels a guide**. Read-only awareness ("prende atto"): the owner sees the list, marks read, or clears it — nothing else to do. v1 kind = `student_cancellation`; the model is generic so other kinds can be added later.

## Key files
- `prisma/schema.prisma` — `AutoscuolaNotification` model (migration `20260716193433_autoscuola_notifications`)
- `lib/autoscuole/notifications.ts` — `listAutoscuolaNotifications` / `markAutoscuolaNotificationsRead` / `deleteAutoscuolaNotifications` + `AutoscuolaNotificationItem` type
- `app/api/autoscuole/owner-notifications/route.ts` — **GET** (list + unread count), **POST** (mark all read), **DELETE** (clear all); owner/admin only
- `components/Layout/OwnerNotificationsBell.tsx` — the bell (3D gold icon `public/images/menu/bell-3d.png`), Radix Popover panel, polling, toast
- `components/Layout/AutoscuoleShell.tsx` — mounts `<OwnerNotificationsBell />` in the right cluster (before the avatar)
- `lib/actions/autoscuole.actions.ts` — `createStudentCancellationNotification()` + the trigger inside `cancelAutoscuolaAppointment`

## Data model
`AutoscuolaNotification`: `companyId`, `kind` (default `student_cancellation`), optional refs `appointmentId`/`studentId`, **snapshot** display fields (`studentName`, `startsAt`, `instructorName`, `lessonType`) so a notification stays readable even if the source row is later removed, `readAt` (**per-company** read state), `createdAt`. Indexes on `(companyId, createdAt)` and `(companyId, readAt)`.

## Trigger
Inside `cancelAutoscuolaAppointment`: when the actor is a **STUDENT** (not admin/owner/instructor), the guide is **not an exam**, and `startsAt` is in the **future**, a notification is created via `after()` (best-effort, off the request's critical path). Group-lesson withdrawals take a different cancel path and are **not** covered in v1 (possible extension).

## API / behavior
- **GET** returns `{ items (last 50, desc), unreadCount }`. The bell polls it every **~25s** (plain `fetch` + `cache: "no-store"`, no TanStack Query — matches the out-of-availability pattern). Non-owners get **403** → the bell self-hides.
- **POST** = "segna tutte lette" (double-check button). **DELETE** = clear all (trash button).
- **Toast** on new arrivals (skips the first load; re-armed after a clear). Real-time is polling-based (cost zero); a managed realtime service can replace polling later without UI changes.

## UI (Airbnb-style, deliberately minimal)
Flat list (no day-group headers, no dividers), avatar initials + "**Nome** ha annullato una guida" + muted "`sab 18 lug, 15:00 · 3 ore fa`". Unread = small red dot (`#c13515`, same as the bell badge); no colored band. Header: "Notifiche" + two round icon buttons — **CheckCheck** (mark all read, disabled when nothing unread) and **Trash** (clear all, no confirm). Empty state uses the faded 3D bell.

## Not this feature
- `app/api/autoscuole/notifications/route.ts` is the **mobile recovery feed** (derived from other tables) — unrelated. The owner bell lives at `/api/autoscuole/owner-notifications`.
- Late-cancellation **penalty** management is a separate feature (see `appointments.md` late cancellations); this bell is pure awareness, no actions on the guide.

## Connected features
- **Appointments** — the trigger hooks the student cancel path in `cancelAutoscuolaAppointment`.
- **Shell / Layout** — the bell is mounted in `AutoscuoleShell` alongside the avatar/hamburger.
