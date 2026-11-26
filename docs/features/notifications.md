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
- `student-booking-notice.ts` — «Nuova prenotazione» all'istruttore (REG-742), chiamato via `scheduleStudentBookingNotice()` (dentro `after()`) da `createBookingRequest`, `respondWaitlistOffer`, `respondGroupLessonInvite` (`autoscuole-availability.actions.ts`) e da `createAutoscuolaAppointment` quando prenota l'allievo

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
| `student_booked` | Istruttore: `AutoscuolaAppointment` sue con `bookingSource` in `student_self`/`slot_fill`/`group_lesson`, non annullate né proposte, `createdAt >= since`, solo se la riga è accesa (REG-742). Id `student_booked_{appointmentId}`, lo stesso della push. **Solo se il client manda `?supports=student_booked`** |

## Web settings (pane "Promemoria e notifiche")

`components/pages/Autoscuole/tabs/SettingsTab.tsx`, sezione `reminders` (overlay Impostazioni, auto-save). **Rifatto a novembre 2026 (REG-767)** con le schede come «Prenotazioni e allievi» (dal REG-772 piatte: **Allievi | Istruttori | Manuale | Ultimi invii**, «Automatici» non c'è più come livello) e i mattoni di `settings/settings-rows.tsx` (`SettingsSection`, `SettingsRow`, `SettingsReveal`, `SettingsSubRow`): righe titolo + riga grigia + controllo, glifo a un colore accanto ai titoli, divisori sottili, niente card né pillole.
- **Allievi** e **Istruttori** (prima le due sezioni di «Automatici»; stessa legenda dei canali in cima a entrambe)
  - **Canali su ogni riga** (`settings/ChannelToggles.tsx`, icone a un colore: App = telefono col puntino, WhatsApp = logo ufficiale, Email; righe mai toccate = solo App; nere accese, grigie spente; dove WhatsApp non ha un modello approvato o non è collegato l'icona non c'è e le altre si stringono a destra, così Email resta nell'ultima colonna (REG-771); legenda in alto con il nome dei canali: WhatsApp solo se collegato per l'autoscuola). Ogni comunicazione parte su tutti e soli i canali accesi; tutti spenti = spenta (vedi `communications.md`). Il parametro della riga (minuti, orario) sta accanto ai canali.
  - A chi arrivano lo dice la scheda: le due `SettingsSection` sono senza titolo (REG-772; prima «Ai tuoi allievi» / «Ai tuoi istruttori», REG-771).
  - **Allievi** — Promemoria: prima della guida (minuti), la mattina (orario), il giorno prima (orario); Avvisi sulle guide: guida fissata (REG-758), annullata, spostata, cambio di luogo, esame fissato; **Solo nell'app** (icona app fissa + «Solo app»): «Posti liberi per domani» (`emptySlotNotificationEnabled/Target/Times`; acceso, sotto ha tre `SettingsDetailRow` (REG-772): «A chi» come testo con freccina, «Orari» come testo (`TimePickerInput variant="text"`, «Togli» nel pannello se ne resta più d'uno, «Aggiungi» al posto del + tratteggiato) e il link «Invia ora per domani» → `triggerEmptySlotNotification`) e una riga descrittiva per le offerte fisse (posto liberato, inviti di gruppo: `OFFER_CHANNELS`).
  - **Istruttori**: promemoria prima della guida (minuti; tutti i canali spenti = «non inviare»), **nuova prenotazione** (REG-742, `student_booked`, App ed Email, spenta di default), guida spostata (REG-771, `appointment_rescheduled_instructor`, App ed Email), guida annullata (REG-771, `appointment_cancelled_instructor`: oggi solo il ritiro di un allievo da una guida di gruppo), assenza settimanale (REG-771, `weekly_absence`, App ed Email), richieste di sostituzione (solo app, fisse).
  - La riga allievi «Guida spostata» vale anche per gli scambi di guida tra due allievi (REG-771).
- **Manuale** (era «A mano», REG-771 bis): «Messaggio di benvenuto» (`WhatsAppWelcomeSection`, vedi `whatsapp-welcome.md`; con l'ancora `#messaggio-di-benvenuto` si apre direttamente questa scheda) e la riga «Invia un comunicato ›» che apre `ComunicatoDialog` dalla pagina.
- **Allievi** e **Istruttori** usano `SettingsDensity value="compact"` (`settings-rows.tsx`): righe 12px sopra e sotto, gruppi più vicini.
- **Ultimi invii**: `RecentDeliveries`.
Comportamento e chiavi dei limits invariati rispetto a prima del redesign.

## Checklist for adding a new notification kind
1. **Backend push**: chiama `notifyAutoscuolaUser()` (mai `sendAutoscuolaPushToUsers()` diretto: lo blocca `notify-guard.test.ts`); se la comunicazione è configurabile aggiungi la riga al catalogo `message-channels.ts` (chiave, pubblico, eventuale flag) e in pagina
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
| `student_booked` | Instructor (della guida) | guide prese dall'allievo dopo `since`, id stabile `student_booked_{appointmentId}`; `data`: `appointmentId`, `startsAt`, `studentId`, `studentName`, `isGroupLesson` (REG-742) |

## Connected features
- **ALL features** — every feature sends push
- **Mobile** — NotificationOverlay, NotificationInboxScreen, notifications.ts types
