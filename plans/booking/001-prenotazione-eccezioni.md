# 001 — Prenotazione allievi «solo eccezioni»

## Stato (2026-11-10)
- Piano APPROVATO da Tiziano. Branch `feat/prenotazione-eccezioni` su entrambi i repo (web da origin/staging, mobile da origin/master), upstream tolto: nessun push.
- **Fase 1 backend (B1–B6) FATTA** nel worktree web, non rilasciata. Fasi 2–4 (UI) in attesa dell'ok sulle anteprime HTML in `/tmp/hiro-anteprime/prenotazione-eccezioni/`.

### Cosa è stato fatto (Fase 1)
- `lib/autoscuole/student-booking-policy.ts` (puro): eccezioni `{enabled, slotFill, groupSeats, lastMinute, lastMinuteHours}`, parse, cascata gruppo per percorso → gruppo → autoscuola per percorso → autoscuola → `LEGACY_INSTRUCTORS_EXCEPTIONS`; modalità open/exceptions/closed; `hold` (bloccato, AWAITING, TEORIA, percorso mancante); `canStudentUseBookingChannel(policy, free|slot_fill|group_seat|swap)`; finestra «ultimo minuto».
- `lib/autoscuole/student-booking-policy-loader.ts`: caricamento in blocco + helper puro per riga (usato dal job).
- `ensureStudentCanBookFromApp` per canale; `bookableUntil` limita available-slots, date-availability e booking-requests alla finestra; la chiusura del giorno prima non vale per l'ultimo minuto. Creazione guida da allievo (`createAutoscuolaAppointment`) con la stessa regola.
- Slot liberato: destinatari filtrati; accettazione col canale `slot_fill`; **fix sicurezza**: si risponde solo per il proprio profilo; elenco offerte e recupero notifiche filtrati per allievo (prima tornavano tutte le offerte dell'autoscuola).
- Guide di gruppo: destinatari, accettazione (anche qui fix «solo il proprio profilo») ed elenco filtrati col canale `group_seat`.
- Scambi: destinatari senza bloccati/non in pratica; nessun legame con la modalità.
- «Nuove disponibilità»: solo a chi è in modalità aperta (push e recupero).
- Avvisi di cambio fase: testo coerente con la modalità.
- Job posti vuoti: policy per allievo (percorso, blocco, fase); in «solo eccezioni» con ultimo minuto testo dedicato (`data.lastMinute`, `lastMinuteHours`) se la finestra arriva dentro domani. **Richiede `pnpm trigger:deploy:prod` al rilascio.**
- `booking-options` restituisce `bookingPolicy {mode, hold, exceptions, lastMinuteUntil}`.
- Impostazioni: `limits.studentBookingExceptions(+ByPath)` (zod, lettura, salvataggio solo se mandate); gruppo autonomo: PATCH `instructor-settings` e schema web `updateAutoscuolaInstructor` (senza, il salvataggio web le cancellava).
- Nessuna migrazione Prisma (tutto JSON).
- Test: `tests/unit/autoscuole/student-booking-policy.test.ts` (matrice modalità × canale × blocco, cascata, parse). tsc e lint puliti; `notify-guard.test.ts` fallisce già su staging (admin-access.ts, non toccato).

### Emendamenti concordati (risposte di Tiziano)
1. Autoscuole già su «instructors»: **DECISO 10/11 → «Disattiva»** (`LEGACY_INSTRUCTORS_EXCEPTIONS` = tutto spento). Prima era in sospeso. Migrazione = una costante (`LEGACY_INSTRUCTORS_EXCEPTIONS`, oggi slot liberato + guide di gruppo = comportamento di fatto). Query prod 10/11 (sola lettura, 90 giorni): 5 guide slot_fill in tutta Reglo; nelle 9 autoscuole con «instructors» (autoscuola, percorso o gruppo) solo Robatto 2, entrambe patente B su percorso auto = «both»; quindi 0 nei contesti «instructors».
2. Scambi indipendenti: solo `swapEnabled`.
3. Ultimo minuto: finestra in ORE configurabile (1–168, default 24). Gli avvisi push usano gli orari di «Guide libere per domani».
4. Eccezioni DIVERSE per percorso (moto/auto/pro): `studentBookingExceptionsByPath`, a livello autoscuola e gruppo.
5. Segretaria vocale: task separato, dopo (vedi in fondo).
6. Riallineamento Clay: anche M7 e M8.
- Verifica soprattutto sulla UI dei ragazzi: chiarissimo quando possono prenotare e quando no, in ogni stato e per ogni eccezione.
- Decisione tecnica: allievo «manual_full» invariato (escluso solo da job posti vuoti e scambi come prima).

---

# Prenotazione allievi «solo eccezioni» — Analisi e piano (Fase 1)

Data: 2026-11-10 · Branch previsto: `feat/prenotazione-eccezioni` · Worktree: `reglo-worktrees/prenotazione-eccezioni` (da origin/staging), `reglo-mobile-worktrees/prenotazione-eccezioni` (da origin/master).
Stato: SOLO ANALISI. Nessun codice, nessun branch creato. Base letta: `reglo` staging, `reglo-mobile` master.

## In breve

- **Il setting di oggi non è un sì/no.** È «Chi può prenotare dall'app» (`limits.appBookingActors`: `students` / `instructors` / `both`, più una variante per percorso patente `appBookingActorsByPath`). Sta in Impostazioni → Prenotazioni e allievi → **Generali** (`components/pages/Autoscuole/tabs/BookingsTab.tsx:571`). Per gli istruttori in gestione autonoma il valore del gruppo vince su quello dell'autoscuola.
- **«Disattiva» oggi = `instructors`.** Con questo valore il server blocca **solo** la prenotazione libera: `booking-requests`, `available-slots`, `date-availability`, creazione guida da allievo (`ensureStudentCanBookFromApp`, `lib/actions/autoscuole-availability.actions.ts:645-782`).
- **Il flusso «slot liberato» non controlla questo setting.** La notifica parte e chi la riceve **può prendere lo slot** (`respondWaitlistOffer` non controlla niente). Lo stesso vale per i posti nelle guide di gruppo e per gli scambi.
  - Quindi, secondo il codice, oggi con «Solo istruttori» lo slot liberato si può prendere, al contrario di quanto si pensa. Prima di decidere come trattare le autoscuole già in «Solo istruttori» va controllato sui dati (domanda 1).
- **Due bug di sicurezza nello stesso flusso, da sistemare comunque:**
  - `respondWaitlistOffer` non verifica che chi accetta sia davvero quell'allievo (`membership.userId === studentId`): qualunque utente dell'autoscuola può accettare un'offerta a nome di un altro.
  - Il recupero delle notifiche (`GET /api/autoscuole/notifications`, `route.ts:165-193`) restituisce **tutte** le offerte attive dell'autoscuola a ogni allievo, senza filtro.

---

## 1. Ricognizione: tutti i flussi che riempiono l'agenda

### 1.1 Il setting attuale

**Dove è salvato**
- Autoscuola: `CompanyService.limits` (Json, `prisma/schema.prisma:317`)
  - `appBookingActors`: `"students" | "instructors" | "both"`, default `"students"` (`DEFAULT_APP_BOOKING_ACTORS`, `lib/autoscuole/booking-governance.ts:32`); valori mancanti o non validi → default (`parseBookingGovernanceFromLimits` :41-60).
  - `appBookingActorsByPath`: `{moto?, auto?, pro?}` (REG-426).
  - Collegati: `instructorBookingMode` (`manual_full` | `manual_engine`), `bookingMinStartDate`, `swapEnabled`, `emptySlotNotification*`, `groupLessonsDiscoveryEnabled` (default ON), `voiceBookingEnabled`, `autoBookingBlockEnabled/Threshold`.
- Gruppo autonomo: `AutoscuolaInstructor.settings` (Json, schema:886), conta solo se `autonomousMode=true` e istruttore attivo. Può contenere `appBookingActors`, `appBookingActorsByPath`, `instructorBookingMode`, `swapEnabled`, `emptySlotNotification*` ecc. (`parseInstructorSettings`, `lib/autoscuole/instructor-clusters.ts:94`).
- Allievo: `CompanyMember` (schema:328): `bookingBlocked`, `bookingBlockReason` (`manual` | `unpaid_threshold`), `bookingBlockUntil`, `unpaidBlockClearedAtCount`, `weeklyBookingLimitExempt`, `assignedInstructorId`, `groupLessonsOptIn`, `studentPhase`.
- `AutoscuolaAppointment.bookingSource` (schema:644) registra solo il canale (`student_self`, `swap`, `slot_fill`, `voice`, …; `lib/autoscuole/booking-source.ts:22-35`); `slot_fill` è esente dal limite settimanale (:39-43).

**Risoluzione (il gruppo vince sull'autoscuola)**
- `resolveEffectiveBookingSettings(companyId, studentId, defaults)` (`instructor-clusters.ts:228-352`): gruppo per percorso → gruppo default → autoscuola per percorso → autoscuola default (`resolveAppBookingActorsForBucket`, `booking-governance.ts:84-94`).
- `resolveEffectiveSettingsForInstructor` (:355-390) **ignora entrambe le mappe per percorso**.
- `isStudentInManualFullCluster` (:412-430) guarda solo `instructorBookingMode`.
- Blocco allievo: `isBookingBlockActive` (`lib/autoscuole/booking-block.ts:46`), `bookingBlockStops(initiator)` (:79-81).
- Cache: `getCachedCompanyServiceLimits` (`lib/autoscuole/cached-service.ts:15-35`), Redis 300 s, invalidata da `updateAutoscuolaSettings` (`autoscuole-settings.actions.ts:1979-1986`). Le impostazioni del gruppo sono lette dal DB senza cache.

**Controllo centrale di oggi** — `ensureStudentCanBookFromApp` (`autoscuole-availability.actions.ts:645-782`): titolare/admin passano; ruoli non allievo respinti; sblocco del blocco manuale scaduto; riconciliazione blocco per insoluti; `bookingBlocked` → «Le tue prenotazioni sono temporaneamente sospese…» (:734); fase AWAITING/TEORIA respinta (:741-754); allievi auto-registrati senza patente respinti (:762); `appBookingActors === "instructors"` → «La prenotazione da app è abilitata solo per istruttori.» (:771-777).

**Endpoint che lo applicano**

| Route | Azione | Controllo |
|---|---|---|
| `POST /api/autoscuole/booking-requests` | `createBookingRequest` :1703 | `ensureStudentCanBookFromApp` + `bookingMinStartDate` + cutoff del gruppo |
| `GET /api/autoscuole/available-slots` | `getAllAvailableSlots` :3006 | `ensureStudentCanBookFromApp` |
| `GET /api/autoscuole/date-availability` | `getDateAvailabilityMap` :3581 | `ensureStudentCanBookFromApp` |
| `POST /api/autoscuole/appointments` (allievo) | `createAutoscuolaAppointment` (`autoscuole.actions.ts:3545`) | `isStudentAppBookingEnabled` :3562-3570 + `bookingBlockStops("student")` |
| `GET /api/autoscuole/booking-options` | `getBookingOptions` :2755 | non respinge mai; restituisce `appBookingActors` e `bookingBlocked` al mobile |

**Dove si modifica**
- Web: `BookingsTab.tsx` sotto-tab «Generali», riga «Chi può prenotare dall'app» (Solo allievi / Solo istruttori / Entrambi / Differenzia per percorso patente…, :136-138, :571-600); stato e salvataggio automatico in `AutoscuoleResourcesPage.tsx:547`; azione `updateAutoscuolaSettings` (`autoscuole-settings.actions.ts:1285`). «Prenotazioni aperte dal» in Generali (:697); scambi (:947) e blocco automatico (:925) in «Limiti».
- Gruppo autonomo: web `tabs/InstructorsTab.tsx:1965-2050` (`ClusterBookingActorsField`, salvato con `updateAutoscuolaInstructor` che **sostituisce** tutto il JSON); app istruttore `PATCH /api/autoscuole/instructor-settings`.
- Blocco per allievo: `toggleStudentBookingBlock` / `setStudentsBookingBlock`; scadenza con il job `trigger/autoscuole-booking-block-expiry.ts` (cron `10 0 * * *`).

### 1.2 Flussi automatici

| # | Flusso | Dove | Come funziona oggi | Con «Solo istruttori» | Allievo bloccato | Gruppo «manual_full» |
|---|---|---|---|---|---|---|
| 1 | **Slot liberato** (`slot_fill_offer`) | `cancelAutoscuolaAppointment` (`autoscuole.actions.ts:4957`) → `broadcastWaitlistOffer` (`autoscuole-availability.actions.ts:4720-4897`); risposta `respondWaitlistOffer` (:4208-4544) | Parte solo se la guida annullata aveva `slotId` (prenotata dall'allievo, da uno slot liberato o spostata su uno slot), **non** se creata dalla segreteria. Offerta valida 15 min, solo push («⏰ Slot guida disponibile»). Destinatari: tutti gli allievi con disponibilità dichiarata che copre lo slot, senza sovrapposizioni e con istruttore/veicolo assegnabili. Vince il primo che accetta (`bookingSource: slot_fill`, nessun controllo del limite settimanale). Elenco: `GET /api/autoscuole/waitlist/offers`. Accetta: `POST /api/autoscuole/waitlist/offers/[offerId]/respond`. | **Notifica e prenotazione funzionano** | ignorato | ignorato |
| 2 | **Guide disponibili domani** (`available_slots`) | Job Trigger `trigger/autoscuole-empty-slot-notifications.ts` (`0,30 * * * *`) → `processEmptySlotNotifications` (`lib/autoscuole/communications.ts:1635-1830`); bottone manuale «Invia ora per domani» (`triggerEmptySlotNotification`, Impostazioni → Promemoria e notifiche) | Push agli orari configurati a chi non ha già guide domani e ha un token push; non salvata in inbox. L'allievo poi prenota con la prenotazione libera. | Non parte (unico flusso che controlla il setting, :1722-1728) — ma ignora le regole per percorso | **notificato**, poi la prenotazione viene rifiutata (anche AWAITING/TEORIA) | non parte |
| 3 | **Posto libero in guida di gruppo** (`group_lesson_invite`) | `broadcastGroupLessonInvite` (:4968-5143); riparte da solo quando un partecipante annulla (`cancelGroupLessonParticipantAppointment` :5554-5568, `withdrawFromGroupLesson` :5613); invito manuale `inviteToGroupLesson` (:5146); risposta `respondGroupLessonInvite` (:5202) | Push agli allievi con `groupLessonsOptIn`, patente compatibile, senza sovrapposizioni. Si spegne con `groupLessonsDiscoveryEnabled=false`. | **Notifica e prenotazione funzionano** | escluso e respinto | ignorato |
| 4 | **Scambi** (`swap_offer`) | `createSwapOffer` (`autoscuole-swap.actions.ts:177`) / `respondSwapOffer` (:619) | L'allievo che non può andare offre la sua guida agli altri (filtri per gruppo, patente, luogo, opzionalmente disponibilità). Richiede `swapEnabled` del richiedente. Limite settimanale applicato. | **Funzionano** | non vede le offerte e non può accettare, ma **riceve la notifica** | esclusi |
| 5 | **Nuove disponibilità** (`availability_published`) | `publishInstructorWeek` (:6045) | Push «…Prenota la tua guida!» agli allievi dell'istruttore autonomo che pubblica la settimana | **notifica comunque**, poi prenotazione rifiutata | ignorato | ignorato |
| 6 | **Avvisi di cambio fase** (`student_phase_change`, `license_path_started`) | `lib/autoscuole/student-phase-notifications.ts:30-35, 95-108` | «Ora puoi prenotare le tue prime guide» / «Puoi prenotare le guide» | testo sbagliato se l'allievo non può prenotare | — | — |
| 7 | **Segretaria vocale** | `lib/autoscuole/voice.ts:699-758` (`createVoiceAppointment`), :642 (`createVoiceBookingRequest`); route `app/api/voice/telnyx/tools/route.ts`, `app/api/voice/runtime/tool/route.ts` | Crea la guida al telefono se `voiceBookingEnabled` (il flag non è ricontrollato lato server nelle route) | nessun controllo (trattata come segreteria) | **nessun controllo**, e nessun controllo di sovrapposizioni né assegnazione istruttore/veicolo | — |
| 8 | Strumenti della segreteria | `suggestInstructorBooking` (:4121, attivo solo se gli istruttori possono prenotare), conferma singola/multipla, «Assegna sostituto» sulle guide annullate, comunicato push (`sendBroadcastPush`, `autoscuole.actions.ts:2486`) | Azioni manuali | ok per costruzione | — | — |

**Cose che non ci sono più o non fanno nulla**
- Riposizionamento e proposte **cancellati** il 2026-06-09 (commit 938b92a: `lib/autoscuole/repositioning.ts` e la route `/reposition`). `docs/features/repositioning.md` e la voce `proposal` in `reglo-mobile/docs/features/notifications.md` sono vecchie. Restano residui `"proposal"` in elenchi di stato.
- Le richieste di prenotazione in sospeso (`AutoscuolaBookingRequest` status `pending`) non sono elaborate da nessun job: non sono una vera lista d'attesa.
- Non esiste un promemoria periodico «non hai guide prenotate» (`autoscuole-reminders` fa solo promemoria, pagamenti, teoria, `exam_ready_nudge`, voce).
- Nessuna offerta passa da WhatsApp o email: `OFFER_CHANNELS = ["push"]` (`channel-cascade.ts:26`).

### 1.3 Lato mobile oggi

- Il client legge solo `appBookingActors` già risolto (`AllievoHomeScreen.tsx:562-576`): `canBook = !!bookingOptions && actors !== 'instructors'`.
- Con «Solo istruttori» i bottoni di prenotazione **spariscono**, ma lo stato vuoto dice ancora «Prenota la tua prima guida…» senza spiegazione (`:1508-1513`).
- Allievo bloccato: bottoni visibili, toast rosso solo al tocco (`:362-365`).
- Limite settimanale e priorità esame: calcolati ma **mai mostrati**.
- Notifica slot liberato: `NotificationOverlay.tsx` (`slot_fill_offer` :473-476, cold start :716) → BottomSheet custom «Slot liberato!» (:1152-1220) → `respondWaitlistOffer`. «Scegli un orario» per `available_slots` (:1223-1336). Nessuno dei due fogli controlla blocco o setting prima di «Prenota».
- Titolare: nessun setting di prenotazione nell'app.
- Istruttore autonomo: `notes/booking-rules.tsx` (form sheet «Chi prenota», durate, modalità istruttore, orari tondi), `notes/limits.tsx`, `notes/extras.tsx`; tipo `InstructorClusterSettings` (`src/types/regloApi.ts:1335-1363`).
- Istruttore: nessuna notifica «slot liberato», nessuna azione «proponi agli allievi», nessun interruttore di blocco per allievo.

---

## 2. Modello proposto

### 2.1 Setting a 3 stati

Nella riga «Generali», rinominata **«Prenotazione degli allievi dall'app»**:

| Stato | Valore salvato | Significato |
|---|---|---|
| **Attiva** | `appBookingActors = students` o `both` | Come oggi. Sotto: interruttore «Anche gli istruttori prenotano dall'app» (sceglie tra `students` e `both`). |
| **Solo eccezioni** *(nuovo)* | `instructors` + `studentBookingExceptions.enabled = true` | Gli allievi non prenotano liberamente; solo nei casi accesi sotto. |
| **Disattiva** | `instructors` + eccezioni spente | Gli allievi non prenotano in nessun caso; tutti i flussi automatici chiusi davvero. |

- `appBookingActors` resta la fonte di verità: l'app istruttore (`canInstructorBook`) non cambia comportamento.
- «Differenzia per percorso patente» diventa a 3 stati per ogni percorso; l'elenco delle eccezioni è unico per l'autoscuola (domanda 4).

### 2.2 Interruttori delle eccezioni (visibili solo con «Solo eccezioni»)

| Eccezione | Configurabile? | Da riusare |
|---|---|---|
| **Slot liberato da un annullamento** (default acceso) | Interruttore | Flusso 1, va solo protetto |
| **Posti liberi nelle guide di gruppo** | Interruttore | Flusso 3 |
| **Ultimo minuto: posti ancora vuoti a breve** | Interruttore + finestra (es. «entro domani», domanda 3) | Flusso 2, oggi spento in questo stato: va riacceso e la prenotazione limitata alla finestra |
| **Scambi tra allievi** | Fisso: resta governato da `swapEnabled` (domanda 2). Uno scambio non aggiunge guide, sposta solo chi la fa. | Flusso 4 |

Regole fisse in «Solo eccezioni» e «Disattiva»:
- la notifica «Nuove disponibilità» non parte;
- i testi degli avvisi di cambio fase cambiano («Ti contatterà l'autoscuola per le guide»).

Possibile evoluzione futura (fuori scope): «slot aperti agli allievi» marcati a mano dall'istruttore o dalla segreteria.

### 2.3 Dati e migrazione

- **Nessuna modifica allo schema Prisma**: tutto in JSON (`CompanyService.limits`, `AutoscuolaInstructor.settings`). La «migrazione additiva» è un nuovo campo con default:
  ```
  limits.studentBookingExceptions = { enabled, slotFill, groupSeats, lastMinute, lastMinuteWindow }
  ```
  Campo assente = eccezioni spente.
- **Retrocompatibilità**: `students` / `both` → nessuna differenza. `instructors` → «Disattiva», più restrittiva di oggi perché chiudiamo i buchi del §1 (vedi domanda 1).
- **Gruppi autonomi**: stesso campo opzionale nel JSON del gruppo; vuoto = eredita dall'autoscuola. Aggiornare `updateAutoscuolaInstructor`, che oggi sostituisce tutto il JSON.
- **Cache Redis dei limiti** (5 min): già invalidata dal salvataggio delle impostazioni; verificare che copra il nuovo campo.

### 2.4 Un solo controllo lato server, per canale

- `resolveStudentBookingPolicy(companyId, studentId)` → stato, eccezioni attive, blocco, fase, percorso (incluse le regole per percorso).
- `ensureStudentCanBook(…, channel)` con canale `free` / `slot_fill` / `group_seat` / `swap` / `last_minute`.
- Usato in due momenti: (1) scelta dei destinatari delle notifiche (in blocco, per prestazioni); (2) accettazione.

Fix compresi:
- controllo che chi accetta sia proprio quell'allievo (`respondWaitlistOffer`);
- filtro per allievo nel recupero notifiche (offerte slot liberato e scambi);
- gli allievi bloccati non ricevono più offerte (slot liberato, scambi, ultimo minuto);
- il job «ultimo minuto» usa le regole del singolo allievo (oggi ignora regole per percorso, allievi bloccati e fase AWAITING/TEORIA).

Fuori scope: **segretaria vocale** (canale della segreteria); i suoi buchi (blocco, sovrapposizioni, flag non ricontrollato) come task separato.

---

## 3. Per ogni pezzo: account, piattaforma, configurabilità, riuso

| Pezzo | Account | Piattaforma | Fisso o configurabile | Da riusare |
|---|---|---|---|---|
| Setting a 3 stati + eccezioni | Titolare | Web (Impostazioni → Prenotazioni e allievi → Generali) | Configurabile | Riga e salvataggio automatico di `BookingsTab` |
| Setting del gruppo autonomo | Istruttore autonomo | Web (`InstructorsTab` → Gestione autonoma) **e app istruttore** (`notes/booking-rules`) | Configurabile; vuoto = come l'autoscuola | `ClusterBookingActorsField`, form sheet «Chi prenota» |
| Controlli lato server | — | Backend | Fisso | `ensureStudentCanBookFromApp`, `resolveEffectiveBookingSettings` |
| Job «ultimo minuto» | Allievo | Backend + Trigger.dev (`trigger:deploy:prod`) | Configurabile | Job dei posti vuoti di domani |
| Stato della prenotazione nell'app allievo | Allievo | Mobile | Fisso | `booking-options` (+ `bookingPolicy`) |
| Setting dal telefono per il titolare | Titolare | — | **Non previsto**: resta solo web, come oggi | — |

**Cosa cambia nell'app istruttore**
- Form sheet «Chi prenota» del gruppo autonomo: opzione «Solo eccezioni» + sotto-foglio con gli interruttori (altrimenti il setting del gruppo vincerebbe senza poter esprimere le eccezioni).
- Verificare che l'istruttore riceva già la notifica «nuova guida» quando un allievo prende uno slot liberato. Opzionale: mostrare in agenda che la guida viene da uno slot liberato (`bookingSource`).

---

## 4. Flusso UI dell'allievo, schermata per schermata

Il server manda `bookingPolicy: { mode: 'open'|'exceptions'|'closed', exceptions, blocked }` dentro `booking-options`. Il telefono non decide nulla da solo.

1. **Home, «Attiva»**: come oggi, con il riquadro di prenotazione riallineato a Clay.
2. **Home, «Solo eccezioni»**:
   - Al posto della card «Prenota», riga di testo fissa: *«Le guide le fissa la tua autoscuola. Se si libera un posto, ti avvisiamo e puoi prenderlo tu.»* Niente pillole.
   - Con offerte attive, sezione **«Posti liberi»**: righe Clay con giorno, ora, durata, istruttore; tocco → form sheet del punto 4. L'allievo vede le offerte anche se ha perso la push.
3. **Home, «Disattiva»**:
   - *«Le guide le fissa la tua autoscuola.»*
   - Va cambiato lo stato vuoto «Prenota la tua prima guida», che oggi promette una cosa impossibile.
   - Allievo bloccato: riga fissa con il motivo, al posto del toast al tocco.
4. **Dalla notifica (push o Avvisi) → form sheet nativo `slot-offer`** (sostituisce i BottomSheet custom di `NotificationOverlay`):
   - Header fisso «Si è liberato un posto» + X.
   - Righe: giorno, orario, durata, istruttore, luogo, veicolo.
   - Testo «Disponibile ancora per 12 minuti», senza badge.
   - Bottone «Prendi questa guida» + «No, grazie» come testo.
   - Caricamento: skeleton per campo, poi dissolvenza.
5. **Esiti nello stesso foglio** (transizioni 200–300 ms, niente salti di altezza):
   - Preso → foglio si chiude, celebrazione esistente, guida in home.
   - Già preso da altri → *«Questo posto è già stato preso»* + «Vedi altri posti liberi».
   - Scaduto o sovrapposto a un'altra guida → messaggio dedicato.
6. **Ultimo minuto**: push → form sheet «Posti liberi domani» con elenco a spunta (FlatList) e bottone di conferma.
7. **Avvisi (allievo)**: FlatList, header iOS che collassa, righe delle offerte senza pallini colorati.
8. **Inviti alle guide di gruppo**: stessa logica; via la pillola «Prenotazioni sospese».

### 4.1 Regole di design

- Clay di `reglo-mobile/docs/design-system.md` §0: bianco e nero, pagina `#FFFFFF`, inchiostro `#111111`; niente blu/navy, niente sfondi grigi o crema; niente pillole/badge/tag/eyebrow; pesi 500–600.
- `<FormSheet>` + `FORM_SHEET`: altezza adattiva, senza grabber, chiusura con X (Android `TALL_SHEET`).
- Header che collassa: `ClayLargeTitleScroll` (l'app allievo oggi usa `ClayPageHeader` e un BlurView fatto a mano).
- Animazioni 200–300 ms, niente overshoot né `springify`, `ReduceMotion.Never`; mai `useReducedMotion` né `MotionConfig reducedMotion`. Mai cambi di botto.
- Skeleton e dissolvenze sui caricamenti; liste con FlatList.
- Icone 3D solo se servono (al massimo una per «Posti liberi»): prima `reglo/public/images`, altrimenti Gemini con il prompt STILE (§0.9, usa_il_mac a controllo completo; se Gemini si blocca oltre 2 min, chat nuova).
- Anteprime HTML in `/tmp/hiro-anteprime/prenotazione-eccezioni/` da approvare prima del codice.

### 4.2 Schermate allievo fuori da Clay (quelle toccate)

- `AllievoHomeScreen`: header BlurView fatto a mano, `#FDFDFD`, viola dell'esame (`#7C3AED`/`#8B5CF6`), card di gruppo verde acqua/arancio, badge numerici, maiuscole, 51 testi a peso 700/800, ingressi `springify`, superfici `#F7F7F7`, `GradientCTABackground`, `CalendarDrawer` legacy.
- `booking-flow` / `booking-slots`: `SheetScaffold` + `GlassCloseButton`, griglie di chip, calendario con grabber, page sheet, ScrollView, pesi 700.
- `NotificationOverlay`: tre BottomSheet custom (due con handle), emoji, `chunkyPinkCta`, molla con rimbalzo.
- `NotificationInboxScreen` (allievo): header fisso, ScrollView, `hairlineWidth`.
- `GroupLessonInvitesScreen`: ScrollView, ombre vecchie, `blockedPill`, verde acqua.

---

## 5. Piano a fasi e stima (punti 0/1/2/3/5)

Piano da salvare dopo l'approvazione in `reglo/plans/booking/001-prenotazione-eccezioni.md` (e nel mobile).

### Fase 1 – Modello e controlli lato server (`reglo`)

| Task | Punti |
|---|---|
| B1 Parsing, salvataggio e default di `studentBookingExceptions` (autoscuola + gruppo), `bookingPolicy` in `booking-options` | 3 |
| B2 `resolveStudentBookingPolicy` + `ensureStudentCanBook(channel)` applicati alla prenotazione libera | 3 |
| B3 Slot liberato: filtro destinatari, controllo all'accettazione, **controllo che chi accetta sia l'allievo**, filtro del recupero notifiche | 3 |
| B4 Guide di gruppo, scambi e «Nuove disponibilità» con la nuova regola; testi del cambio fase | 3 |
| B5 Ultimo minuto: job con regole del singolo allievo + prenotazione consentita solo nella finestra | 5 |
| B6 Test funzionali: matrice stato × canale × blocco | 3 |

### Fase 2 – Web (prima anteprima, poi codice)

| Task | Punti |
|---|---|
| W1 Riga a 3 stati + interruttori + variante per percorso in `BookingsTab` | 3 |
| W2 Campo del gruppo autonomo in `InstructorsTab` | 2 |

### Fase 3 – App allievo (prima anteprime, poi codice)

| Task | Punti |
|---|---|
| M1 Tipi e API (`bookingPolicy`) | 1 |
| M2 Riquadro prenotazione in home nei 3 stati + allievo bloccato + sezione «Posti liberi» | 3 |
| M3 Form sheet `slot-offer` al posto dei BottomSheet (tutti gli esiti) | 3 |
| M4 Form sheet «Posti liberi domani» | 3 |
| M5 Avvisi allievo: FlatList + header che collassa | 2 |
| M6 Inviti guide di gruppo riallineati | 2 |
| M7 *(opzionale)* Riallineamento completo home allievo | 5 |
| M8 *(opzionale)* Riallineamento `booking-flow` / `booking-slots` | 5 |

### Fase 4 – App istruttore

| Task | Punti |
|---|---|
| I1 «Solo eccezioni» + sotto-foglio interruttori in `notes/booking-rules` | 2 |

### Fase 5 – Documentazione e rilascio

| Task | Punti |
|---|---|
| Doc (feature doc, INDEX, impact-map; correggere repositioning e notifications), staging, rilascio Trigger (`trigger:deploy:prod`), OTA doppio (runtime 2.4.0 e 2.4.2) | 2 |

**Totale**: 44 punti senza opzionali, 54 con M7 e M8.

### Git e ambiente (per dopo)

- Branch `feat/prenotazione-eccezioni`; worktree `~/Developer/reglo/reglo-worktrees/prenotazione-eccezioni` (da origin/staging) e `~/Developer/reglo/reglo-mobile-worktrees/prenotazione-eccezioni` (da origin/master). Copie principali `reglo` e `reglo-mobile` intoccate.
- DB dev: mai `prisma migrate reset` (qui comunque nessuna migrazione Prisma).
- Un solo simulatore acceso, controllare il carico con `uptime`.
- UI attuale da guardare con Playwright con sessione autenticata, non con l'operatore a schermo.

---

## 6. Domande aperte

1. **Autoscuole già in «Solo istruttori»**: dal codice, oggi lo slot liberato lì si può prendere. (a) «Disattiva» rigida (chiudiamo il buco) oppure (b) «Solo eccezioni» con slot liberato acceso (conserviamo il comportamento di oggi). Proposta: query **in sola lettura** su prod (guide `bookingSource = slot_fill` negli ultimi 90 giorni nelle autoscuole su `instructors`), solo con ok esplicito.
2. **Scambi**: restano indipendenti (solo `swapEnabled`) anche con «Disattiva»? Proposta: sì.
3. **Ultimo minuto**: finestra «solo domani» (come il job di oggi) o numero di ore configurabile?
4. **Eccezioni per percorso patente**: basta un solo elenco per tutta l'autoscuola, con stato a 3 valori differenziabile per percorso? Proposta: sì.
5. **Segretaria vocale**: i buchi trovati (blocco, sovrapposizioni) come task separato?
6. **Riallineamento Clay**: solo parti toccate (M2–M6) o anche M7 e M8?

---

## 7. Report documentazione

- Consultati INDEX, impact-map e feature doc di entrambi i repo: utili per trovare i file, ma nessun documento descrive i flussi di riempimento agenda insieme.
- Vecchi: `reglo/docs/features/repositioning.md` (descrive un flag su codice cancellato) e la voce `proposal` in `reglo-mobile/docs/features/notifications.md`.
- L'impact-map non collega lo slot liberato al setting «Chi prenota»: è proprio il buco trovato.


---

## Task separato (dopo): segretaria vocale
- `createVoiceAppointment` (`lib/autoscuole/voice.ts`) non controlla blocco prenotazioni né sovrapposizioni, non assegna istruttore/veicolo; le route tool non ricontrollano `voiceBookingEnabled` lato server. Da fare dopo questo lavoro, con piano a parte.
