# Notifications

## What it does
Real-time push notifications + server-side recovery for mobile offline sync.

## Key files
- `lib/autoscuole/push.ts` — `sendAutoscuolaPushToUsers()` via Expo Push
- `app/api/autoscuole/notifications/route.ts` — recovery endpoint

## Push senders (files that call sendAutoscuolaPushToUsers)
- `autoscuole.actions.ts` — proposals, cancellations, rescheduling
- `autoscuole-availability.actions.ts` — waitlist offers, slot fill, booking confirmations, availability_published
- `autoscuole-swap.actions.ts` — swap offers, swap accepted
- `autoscuole-holidays.actions.ts` — holiday cancellations
- `communications.ts` — all reminders (appointment, morning, case deadline, payment)

## Recovery queries (notification kind → DB query)
| Kind | DB query |
|------|----------|
| `swap` / `swap_offer` | `AutoscuolaSwapOffer` where `status='broadcasted'` |
| `proposal` | `AutoscuolaAppointment` where `status='proposal'` |
| `sick_leave_cancelled` | `AutoscuolaAppointment` where `cancellationReason='instructor_sick'` |
| `appointment_cancelled` | `AutoscuolaAppointment` where `status='cancelled'` and `cancellationReason != 'instructor_sick'` |
| `holiday_declared` | `AutoscuolaHoliday` where `createdAt >= since` |
| `waitlist` | `AutoscuolaWaitlistOffer` where `status='broadcasted'` |
| `group_lesson_invite` | `getGroupLessonInvites()` (eligibility-filtered active invites) |
| `appointment_rescheduled` | `AutoscuolaAppointment` where `rescheduledAt >= since` |
| `availability_published` | `AutoscuolaInstructorPublishedWeek` where `publishedAt >= since` |
| `weekly_absence` | `AutoscuolaStudentWeeklyAbsence` where `createdAt >= since` |

## Web settings (pane "Promemoria e notifiche")

`components/pages/Autoscuole/tabs/SettingsTab.tsx`, sezione `reminders` (overlay Impostazioni, auto-save): preavvisi a minuti allievo/istruttore, promemoria mattutino e giorno prima (TimePickerInput), canali per promemoria/cancellazioni, e la sezione FLAT **"Notifica slot disponibili domani"** (riga toggle con divider + Destinatari/Orari/"Invia ora per domani", come il proto: niente card) (`emptySlotNotificationEnabled/Target/Times` + bottone "Invia ora per domani" → `triggerEmptySlotNotification`). Il setting è stato SPOSTATO qui da "Prenotazioni e allievi > App allievi" il 2026-07-12.

## Checklist for adding a new notification kind
1. **Backend push**: add `sendAutoscuolaPushToUsers()` call with `data.kind` in the action file
2. **Recovery**: add query to `app/api/autoscuole/notifications/route.ts`
3. **Mobile types**: add kind + data type to `reglo-mobile/src/types/notifications.ts`
4. **Mobile overlay**: add handler in `reglo-mobile/src/components/NotificationOverlay.tsx`
5. **Mobile inbox**: add to `ICON_MAP`, `getTitle()`, `getSubtitle()`, `ICON_COLOR_MAP`, `isInteractive()` in `reglo-mobile/src/screens/NotificationInboxScreen.tsx`

## All current kinds
| Kind | Recipients | Recovery |
|------|-----------|----------|
| `appointment_proposal` / `proposal` | Student | status='proposal' |
| `appointment_cancelled` | Student | cancelledAt >= since |
| `appointment_rescheduled` | Student + Instructor | rescheduledAt >= since |
| `swap` / `swap_offer` | Student | broadcasted swap offers |
| `swap_accepted` / `confirmation` | Student | client-side only |
| `slot_fill_offer` / `waitlist` | Student | broadcasted waitlist offers |
| `group_lesson_invite` | Student | active group-lesson invites (taps → `home/group-lesson-invites` join screen) |
| `sick_leave_cancelled` | Student + Instructor | cancellationReason='instructor_sick' |
| `holiday_declared` | Student | AutoscuolaHoliday.createdAt |
| `weekly_absence` | Instructor | AutoscuolaStudentWeeklyAbsence |
| `available_slots` | Student | transient |
| `availability_published` | Student | publishedAt >= since |
| `appointment_reminder_*` | Both | time-based, no recovery |
| `broadcast` / `test_push` | Various | fire-and-forget |

## Connected features
- **ALL features** — every feature sends push
- **Mobile** — NotificationOverlay, NotificationInboxScreen, notifications.ts types
