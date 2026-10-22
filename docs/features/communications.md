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
push, WhatsApp, email — **in cascata** (REG-500, 22/10/2026): vedi sotto.

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

## La cascata: un messaggio, un canale (REG-500, 22/10/2026)

`lib/autoscuole/channel-cascade.ts` → `deliverByCascade(channels, steps)` scende
**App → WhatsApp → Email** (ordine fisso) e si ferma al primo gradino che
consegna. Lo usano i 4 blocchi dei promemoria in `communications.ts` e
`notifyAutoscuolaUser` (`notify.ts`). Prima partivano **tutti** i canali
spuntati, mentre la UI prometteva «una volta sola».

- Una push conta come consegnata solo se `sent > 0` (`pushReachedADevice`):
  `deliverAndLog` registra `skipped`/`failed` una push senza dispositivi, e la
  cascata passa al gradino dopo.
- **Offerte** (posto libero, invito guida di gruppo, sostituzione) = solo push
  (`OFFER_CHANNELS`). `slotFillChannels` non viene più letta.
- **Una scelta per tutti**: la UI scrive `studentReminderChannels` **e**
  `instructorReminderChannels` con lo stesso valore. Script
  `scripts/reg-500-align-channels.ts` (a vuoto di default) per allineare chi le
  aveva diverse.

## Template: versioni, categoria, footer STOP

`whatsapp-templates.ts`: ogni voce ha `name` (oggi `_v3`, con footer
`WHATSAPP_FOOTER` «Rispondi STOP…»), `category` **assegnata da Meta**,
`approval`, e `previous` (il `_v2`). `sendableTemplateName` sceglie la prima
versione **approvata e utility**; se nessuna lo è, `deliverWhatsApp` registra
`skipped` e la cascata ripiega sull'email. Al 22/10: 8 `_v2` utility in uso, i
due ex-marketing (mattutino, guida spostata) su email finché il `_v3` non è
approvato. **Quando Meta approva un `_v3`, aggiornare `approval` qui** (lo stato
si legge con `GET /v2/whatsapp/message_templates` su Telnyx).

## Consenso

`User.whatsappConsentAt` / `whatsappConsentSource` (`app_registrazione`,
`app_profilo`, `autoscuola`). Il cancello resta la revoca
(`whatsappOptOutAt`): per chi era già in anagrafica il consenso è implicito.
API mobile `GET/PATCH /api/mobile/me/whatsapp`; casella in creazione allievo
web (consorziata, consorzio).

## Pilota

`WHATSAPP_PILOT_COMPANY_IDS` (id separati da virgola, vuota = tutte):
`isWhatsAppEnabledForCompany` limita WhatsApp a quelle autoscuole. Le altre
vedono «Non disponibile» in Impostazioni e gli invii sono `skipped` col motivo.

## Revoche: STOP e START (anche su Telnyx)

Telnyx tiene **una sua revoca per messaging profile**: dopo uno STOP ogni invio
a quel numero torna `40300 Blocked due to STOP message`, e il blocco si toglie
**solo** quando la persona scrive START o UNSTOP (nessuna API per toglierlo,
`GET /v2/messaging_optouts` per leggerlo). Quindi:

- webhook: START/UNSTOP (parola esatta, controllata **prima** della revoca —
  «unstop» contiene «stop») → `recordWhatsAppOptIn` toglie la nostra revoca;
- invio: un `40300` (`blockedByOptOut`) riporta la revoca da noi e non si
  riprova;
- app: riaccendere non toglie la revoca; `PATCH /api/mobile/me/whatsapp`
  risponde `needsStart` + `startUrl` (`wa.me/<numero>?text=START`).

Il testo in arrivo da Telnyx sta in `payload.body.text.body`, e Telnyx marca
le parole chiave con `autoresponse_type` (`STOP`/`START`): li leggiamo entrambi.

## Staging

Gli invii esterni su staging sono spenti; `WHATSAPP_STAGING_ALLOWLIST`
(E.164 separati da virgola) li accende **solo** verso quei numeri
(`isStagingTestRecipient`).

## «Ultimi invii»

`lib/autoscuole/recent-deliveries.ts` raggruppa i tentativi della cascata in
messaggi (stesso `kind`/guida/allievo entro 2 minuti) e traduce i motivi;
`getRecentDeliveriesAction` lo serve a `RecentDeliveries.tsx` in
Impostazioni → Promemoria e notifiche.

## Comunicazioni da regola

Testo libero → solo email: `createRuleSchema` accetta solo `email`. Le regole
WhatsApp esistenti restano (4 attive in prod al 22/10) con l'avviso «Non viene
inviato» in pagina.
