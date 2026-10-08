# Communications

> **REG-604 — i canali non sono più solo dei promemoria.**
> `parseReminderChannels` e il default dei canali vivono ora in
> `lib/autoscuole/reminder-channels.ts`, condivisi con tutte le altre
> comunicazioni del prodotto (`lib/autoscuole/notify.ts`). Qui dentro non
> cambia niente: la cascata dei promemoria resta la sua, perché ci sono dentro
> il motore delle regole e i template Meta. Due modifiche al comportamento:
> l'**esame senza orario** è escluso dal promemoria «N minuti prima» (allievo e
> istruttore: altrimenti il push partiva alle 23:00 della sera prima), e il
> promemoria **all'istruttore** dice «esame» quando è un esame, non «guida».
> Via anche l'anglicismo «Reminder guida» dai titoli push.
> Vedi [notifications.md](notifications.md).

> **Veste delle email**: il contenitore è unico, in `email/template.ts` — vedi
> [email-template.md](email-template.md). Qui si decide *cosa* dice il messaggio
> (e che canali usa), lì *com'è fatta* la mail.


## What it does
Message templates, reminder rules, appointment reminders, case deadline notifications, and all background processing jobs.

## Key files
- `lib/autoscuole/communications.ts` — 18 exported functions, central job processor
- `lib/autoscuole/whatsapp-delivery.ts` — **l'unico punto da cui esce un WhatsApp**
- `lib/actions/autoscuola-communications.actions.ts` — template/rule CRUD
- `trigger/autoscuole-reminders.ts` — cron job calling all processing functions
- `components/pages/Autoscuole/AutoscuoleCommunicationsPage.tsx` — web UI

## Key functions (all called by background job every 1 min)
- `processAutoscuolaAutoCompleteCheckedIn()` — auto-mark completed
- `processAutoscuolaAutoCheckin()` — auto-checkin by time
- `processAutoscuolaAutoPendingReview()` — pending → scheduled transitions
- `processAutoscuolaPenaltyCharges()` → delegates to payments.ts
- `processAutoscuolaLessonSettlement()` → delegates to payments.ts
- `processAutoscuolaPaymentRetries()` → delegates to payments.ts
- `processAutoscuolaInvoiceFinalization()` → delegates to payments.ts
- `processAutoscuolaConfiguredAppointmentReminders()` — template + rule based
- `processAutoscuolaMorningReminders()` — morning notifications (`limits.studentReminderMorningEnabled` + `...Time`, fire-once al minuto configurato, guide di OGGI)
- `processAutoscuolaDayBeforeReminders()` — day-before notifications (2026-07-06: `limits.studentReminderDayBeforeEnabled` + `...Time`, default 19:00, guide di DOMANI, kind `day_before_reminder_student`, stessi canali `studentReminderChannels`)
- `processAutoscuolaAppointmentReminders()` — 120/60/30/20/15 min before
- **Promemoria ESAME senza orario (2026-07-31, richiesta Macchiavello)**: nei 3 promemoria allievo (configurato X-min, mattina, sera-prima) gli appuntamenti `type="esame"` usano una copy dedicata SENZA orario (`EXAM_REMINDER_SUFFIX`: "Orario e luogo di presentazione ti verranno comunicati dall'autoscuola") — la convocazione la comunica l'autoscuola e può cambiare fino all'ultimo. Titoli: "Promemoria esame"/"Esame oggi"/"Esame domani". I promemoria istruttore restano con l'orario.
- `processAutoscuolaCaseDeadlines()` — pink sheet/medical expiry alerts
- `processAutoscuolaPendingRepositions()` → delegates to repositioning.ts

## Template tokens
`{{student.firstName}}`, `{{student.lastName}}`, `{{appointment.date}}`, `{{case.deadlineLabel}}`, etc.

## Channels
push, email, WhatsApp

## DB models
- `AutoscuolaMessageTemplate` — message bodies
- `AutoscuolaMessageRule` — trigger conditions (appointment type, deadline, offset days)
- `AutoscuolaMessageLog` — sent message audit

## Connected features
- **Payments** — delegates settlement, retry, penalty, invoice processing
- **Notifications** — sends push + WhatsApp + email
- **Repositioning** — processes reposition queue
- **Appointments** — auto-checkin, auto-complete, pending review transitions
- **Cases & Deadlines** — deadline reminder processing


## WhatsApp: un cancello solo (REG-500, 05/10/2026)

Ogni invio WhatsApp passa da `deliverWhatsApp` (`lib/autoscuole/whatsapp-delivery.ts`).
Prima dell'invio controlla **tre cose, in quest'ordine**, e se una dice no il
messaggio non parte e viene registrato come `skipped` **col motivo**:

1. il canale è configurato (`WHATSAPP_PROVIDER` + credenziali del fornitore);
2. esiste un **template approvato** per quel `kind` (`whatsapp-templates.ts`);
3. quella persona non ha revocato il consenso (`User.whatsappOptOutAt`).

La decisione è una funzione pura, `whatsAppSkipReason`, testata in
`tests/unit/autoscuole/whatsapp-delivery.test.ts`.

> ⚠️ **Cosa c'era prima.** Gli invii passavano da `sendAutoscuolaWhatsApp`, che
> parlava **direttamente con Twilio** in testo libero. Quel percorso è rimasto
> acceso anche dopo che REG-500 aveva scritto lo stack su **Telnyx**, perché
> nessuno l'aveva innestato: in produzione ha prodotto **618 errori
> `Twilio 401 authentication failed`**, l'ultimo il giorno in cui è stato tolto,
> mentre la UI mostrava WhatsApp come "In arrivo". Il cancello stava davanti, il
> retro era aperto. Il modulo `whatsapp.ts` è stato **eliminato** apposta: non
> deve poter tornare.

**Chi ha un template e chi no.** Promemoria guida (allievo e istruttore),
mattutino, giorno prima ed esame ce l'hanno. **Non** ce l'hanno le comunicazioni
da regola, le offerte di scambio, gli slot liberati e gli inviti alle guide di
gruppo: sono testo libero, e fuori dalle 24 ore Meta non lo accetta. Quelle
restano `skipped` finché qualcuno non sottomette un template.

**Fuori dal codice** restano: registrare il numero su WhatsApp lato Telnyx
(oggi `/v2/whatsapp/phone_numbers` risponde 0), collegare il WhatsApp Business
Account e far approvare i template da Meta.
