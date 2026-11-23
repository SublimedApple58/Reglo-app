# Notifications

## What it does
Real-time push notifications + server-side recovery for mobile offline sync.

## Key files
- **`lib/autoscuole/notify.ts` — `notifyAutoscuolaUser()`: il punto di passaggio unico (REG-604)**
- **`lib/autoscuole/reminder-channels.ts` — chi decide i canali, condiviso con i promemoria**
- `lib/autoscuole/exam-notifications.ts` — i testi di guide ed esami, modulo puro
- `lib/autoscuole/push.ts` — `sendAutoscuolaPushToUsers()` via Expo Push
- `lib/autoscuole/delivery-log.ts` — `deliverAndLog()`: ogni tentativo finisce in `AutoscuolaMessageLog`
- `app/api/autoscuole/notifications/route.ts` — recovery endpoint

## I canali: una sola strada (REG-604)

Prima di REG-604 l'impostazione **Impostazioni → Promemoria e notifiche**
governava **solo i promemoria**. Tutti gli altri messaggi mandavano push ed
email a prescindere: 21 punti di invio si scrivevano la cascata a mano.

Oggi ogni comunicazione passa da `notifyAutoscuolaUser()`:

```ts
await notifyAutoscuolaUser({
  companyId, kind: "appointment_cancelled", audience: "student",
  recipient: { userId, email, phone },
  title, body, appointmentId, data: { … },
});
```

| Campo | A cosa serve |
|---|---|
| `kind` | Un solo valore per il registro **e** per `data.kind` della push |
| `audience` | `student` → `studentReminderChannels`; `instructor` → `instructorReminderChannels`; `owner` → non filtra (l'impostazione non esiste: è un gancio pronto) |
| `supports` | I canali tecnicamente possibili per **questo** messaggio. Default `["push","email"]`, `PUSH_ONLY` per quelli senza email |
| `channels` | Canali già risolti dal chiamante: lo usano i messaggi che hanno **un'impostazione propria** (vedi sotto) |
| `whatsapp` | `logKind` + `templateKind`. Oggi nessuno di questi messaggi ha un template Meta approvato, quindi `deliverWhatsApp` registra uno `skipped` col motivo — comportamento di prima, invariato |

### Le tre impostazioni dei canali, e chi legge quale

| Impostazione | Chi la usa |
|---|---|
| `studentReminderChannels` / `instructorReminderChannels` | i 3 promemoria **e** tutti i messaggi-evento (annullamenti, spostamenti, chiusure, luogo, esami, fase allievo, teoria, assenze) |
| `slotFillChannels` | le tre **offerte**: posto libero, invito a guida di gruppo, richiesta di sostituzione. Hanno un'economia di canale diversa (vedi `PUSH_ONLY_KINDS`) e passano `channels` già risolti |
| `paymentNotificationChannels` | le notifiche di pagamento, idem |

> ⚠️ Chi aggiunge un messaggio **non** sceglie i canali: li chiede alla
> struttura. Un test (`tests/unit/autoscuole/notify-guard.test.ts`) legge i
> sorgenti e fallisce se `sendAutoscuolaPushToUsers` o `sendDynamicEmail`
> ricompaiono fuori da una lista bianca di sette file, ognuno con la sua
> motivazione scritta. È la guardia che impedisce al problema di tornare: il
> difetto non era un bug in una riga, era che **nascere ignorando i canali era
> la cosa più facile da fare**.

## Il ciclo di vita dell'esame (REG-604)

Prima non esisteva **niente**: prenotare, ri-orarare, annullare un esame era
muto su tutti i canali, e l'allievo l'orario lo leggeva solo nell'app.

| Quando | `kind` | Titolo |
|---|---|---|
| esame prenotato (`createExamEvent`, `addExamStudent`) | `exam_scheduled` (`reason: "created"`) | 🎓 Esame fissato |
| orario definito dopo (`updateExamTime`, da `endsAt` null a valorizzato) | `exam_scheduled` (`reason: "time_set"`) | 🎓 Orario dell'esame definito |
| esame spostato | `appointment_rescheduled` | 🎓 Esame spostato |
| esame annullato (`cancelExamEvent`, `removeExamStudent`) | `appointment_cancelled` | ❌ Esame annullato |

**La regola dei testi, in un posto solo** (`exam-notifications.ts`): *l'orario
si scrive se e solo se `endsAt` è valorizzato.* Un esame senza orario ha
`startsAt` alla mezzanotte come segnaposto, quindi chi lo formatta senza
guardare `endsAt` scrive «00:00». `movedText()` restituisce `null` quando le
due etichette coincidono — cambiata solo la durata, o esame senza orario
rimasto nello stesso giorno — perché «spostato dal 14 al 14» è peggio del
silenzio.

`data.isExam` e `data.timeSet` viaggiano nel payload di
`appointment_rescheduled` / `appointment_cancelled` / `appointment_location_changed`:
l'inbox mobile ricostruisce il sottotitolo da lì, non dal testo del push.

> ⚠️ **Esame senza orario → fuori dal promemoria «N minuti prima»**
> (`communications.ts`). La programmazione si calcola su `startsAt`, che per un
> esame senza orario è la mezzanotte: col default di 60 minuti il push partiva
> alle **23:00 della sera prima**. Il mattutino e il giorno-prima partono a ora
> fissa e restano.

## Punti di invio (tutti via `notifyAutoscuolaUser`, REG-604)
- `autoscuole.actions.ts` — proposals, cancellations, rescheduling
- `autoscuole-availability.actions.ts` — waitlist offers, slot fill, booking confirmations, availability_published
- `autoscuole-swap.actions.ts` — swap offers, swap accepted
- `autoscuole-holidays.actions.ts` — holiday cancellations
- `communications.ts` — all reminders (appointment, morning, case deadline, payment)
- `creation-notice-queue.ts` — «guida fissata» raggruppata (REG-758, via job `autoscuole-reminders`)
- `exam-ready-nudge.ts` — nudge titolare `exam_ready_nudge` (cron lunedì 09:00 via `trigger/autoscuole-reminders.ts`)

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
| `exam_ready_nudge` | `getExamReadyNudgeForCompany()` — `CompanyMember` PRATICA `examReady` da >14gg MENO chi ha esame futuro (solo ruoli owner) |
| `exam_scheduled` | `AutoscuolaAppointment` `type='esame'` futuri con `createdAt >= since` (REG-604) |
| `appointment_created` | `AutoscuolaAppointment` `creationNotice='sent'`, `createdAt >= since`, raggruppate come la coda (REG-758). **Solo se il client manda `?supports=appointment_created`** |

## Web settings (pane "Promemoria e notifiche")

`components/pages/Autoscuole/tabs/SettingsTab.tsx`, sezione `reminders` (overlay Impostazioni, auto-save). **Rifatto il 24/11/2026 (REG-767)** sull'impianto di «Prenotazioni e allievi», coi mattoni di `settings/settings-rows.tsx` (`SettingsSection`, `SettingsRow`, `SettingsReveal`, `SettingsSubRow`): sezioni con titolo, righe titolo + riga grigia + controllo, divisori sottili, niente card, icone o pillole. Sezioni:
- **Allievi** — promemoria prima della guida (select), «La mattina della guida» e «Il giorno prima» (toggle; acceso, compare l'orario con `TimePickerInput`), «Guida fissata» (REG-758), «Posti liberi per domani» (ex «Notifica slot disponibili domani»: toggle; acceso, compaiono «A chi», «Orari» e «Invia ora» → `triggerEmptySlotNotification`; `emptySlotNotificationEnabled/Target/Times`; spostato qui da «Prenotazioni e allievi > App allievi» il 2026-07-12).
- **Istruttori** — promemoria prima della guida, con «Non inviare».
- **Canali** — `ChannelCascade` (REG-500): App sempre, WhatsApp, Email; una scelta scrive i canali di allievi e istruttori.
- **Ultimi invii** — `RecentDeliveries`, lista senza riquadro.
- **Messaggio di benvenuto** — `WhatsAppWelcomeSection` (REG-767, vedi `whatsapp-welcome.md`).
Comportamento e chiavi dei limits invariati rispetto a prima del redesign.

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
| `appointment_created` | Student | `creationNotice='sent'`, id stabile `created_{prima guida}` — vedi [appointment-creation-notice.md](appointment-creation-notice.md) |
| `exam_ready_nudge` | Owner (OWNER + INSTRUCTOR_OWNER) | `getExamReadyNudgeForCompany()`, id stabile `exam_ready_nudge_{companyId}` |

## Connected features
- **ALL features** — every feature sends push
- **Mobile** — NotificationOverlay, NotificationInboxScreen, notifications.ts types
