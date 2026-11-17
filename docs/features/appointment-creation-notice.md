# Avviso «guida fissata» all'allievo (REG-758)

Richiesta del consorzio Autoscuole Riunite (Federica, 17/11/2026): quando lo
**staff** fissa una guida all'allievo, l'allievo deve saperlo. Prima non lo
sapeva su nessun canale: l'unico appuntamento che avvisava alla creazione era
l'esame (`exam_scheduled`). Piano e decisioni:
`plans/communications/reg-758-guida-fissata.md`.

## Regole (decisioni di Tiziano del 17/11)
- **Spento di default**, per autoscuola: Impostazioni → Promemoria e notifiche →
  «Avviso guida fissata» (`limits.studentCreationNoticeEnabled`). I canali sono
  quelli della cascata già scelta (App → WhatsApp → Email, un messaggio solo).
- **Chi lo fa partire**: titolare/segreteria/admin (web), istruttore (app),
  consorzio che accetta una richiesta guida, **assistente vocale** (incluso).
- **Non parte** per: guide prenotate dall'allievo stesso (app, posto
  liberato, scambio, invito a guida di gruppo), esami (hanno «esame
  fissato»), guide nel passato, guide annullate o già iniziate prima
  dell'invio, funzione spenta (alla creazione o all'invio).
- **Raggruppato**: un messaggio per allievo con tutte le guide in coda, quando
  per lui lo staff è fermo da 3 minuti, al massimo 15 minuti dopo la prima.

## Come funziona
1. Il punto di creazione chiama `creationNoticeFor()` e salva
   `AutoscuolaAppointment.creationNotice = "pending"` (o `null`).
2. Il job `autoscuole-reminders` (ogni minuto) chiama
   `processAutoscuolaCreationNotices()`: raggruppa per allievo, prende in carico
   (`pending → sent`, atomico) e manda via `notifyAutoscuolaUser` con kind
   `appointment_created`. Le guide che non servono più diventano `skipped`.
3. Finché l'avviso è in coda, `notifyAutoscuolaUser` **tace** annullamento,
   spostamento e cambio luogo di quella guida (l'allievo non la conosce ancora):
   se è annullata l'avviso non parte, se è spostata parte col nuovo orario.

> ⚠️ Il job non gira su staging (Trigger.dev esiste solo in prod). Su staging
> la coda si svuota a mano: `scripts/reg-758-flush-creation-notices.ts`.

## WhatsApp
Template `guida_fissata_allievo_v1` (utility, piè di pagina STOP), variabili
`nome` e `guide` («la guida di giovedì 19 novembre alle 15:00» oppure «3 guide:
giovedì 19/11 alle 15:00, …»), senza istruttore. Sottomesso a Meta via Telnyx il
17/11 (template_id 4420418908269594). Finché è `pending` nel registro,
`deliverWhatsApp` registra `skipped` e la cascata passa all'email. **Quando Meta
approva: `approval: "approved"` in `whatsapp-templates.ts`** e deploy di web e job.

## Files
- `lib/autoscuole/creation-notice.ts` — regole e testi (puro, testato in `tests/unit/autoscuole/creation-notice.test.ts`)
- `lib/autoscuole/creation-notice-queue.ts` — `creationNoticeFor`, `processAutoscuolaCreationNotices`
- `lib/autoscuole/notify.ts` — silenzio sugli eventi di una guida ancora in coda
- `trigger/autoscuole-reminders.ts` — chiama la coda ogni minuto
- Agganci: `autoscuole.actions.ts` (`createAutoscuolaAppointment` se l'attore non è l'allievo, `createAutoscuolaAppointmentBatch`, `createGroupLesson`, `addGroupLessonParticipant`), `consorzio.actions.ts` (`acceptConsorzioGuideRequest`), `voice.ts` (`createVoiceAppointment`)
- `app/api/autoscuole/notifications/route.ts` — recupero inbox, solo con `?supports=appointment_created`
- `lib/actions/autoscuole-settings.actions.ts`, `SettingsTab.tsx`, `AutoscuoleResourcesPage.tsx` — impostazione
- `recent-deliveries.ts` — etichetta «Guida fissata» in «Ultimi invii»
- Migrazione `20261117120000_appointment_creation_notice` (colonna `creationNotice` + indice)

## Connessioni
- **Communications / Notifications**: cascata e registro come gli altri messaggi-evento.
- **Mobile** (`reglo-mobile`): kind `appointment_created` in `types/notifications.ts`, `NotificationOverlay` (id stabile `created_<prima guida>`), `NotificationInboxScreen`; `getNotifications` dichiara `supports=appointment_created`.
- `createAutoscuolaAppointment` ora salva `bookingSource = student_self` quando prenota l'allievo stesso (prima finiva `staff_*`; lo legge solo il KPI backoffice).
