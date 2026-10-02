# Appointments

## What it does
Full lesson/exam lifecycle: create, propose, confirm, check-in, complete, cancel, reschedule, reposition.

## Key files
- `lib/actions/autoscuole.actions.ts` — all appointment mutations (largest action file)
- `lib/autoscuole/lesson-policy.ts` — lesson type validation, time/day restrictions
- `lib/autoscuole/exam-priority.ts` — 14-day priority window before exam date
- `components/pages/Autoscuole/AutoscuoleAgendaPage.tsx` — web agenda UI (170KB)

## Densità agenda + zoom righe orarie (REG-394, 2026-08-25)
L'agenda era troppo estesa in verticale. Densità base ridotta da `BASE_PIXELS_PER_MINUTE` **1.6 → 1.2** (96px/h → 72px/h, stile Google Calendar: più ore/blocchi nello stesso spazio). Lo **zoom verticale** prima agiva solo in fullscreen: ora agisce **anche in vista normale** ed è **persistito** nelle preferenze agenda (`AgendaViewPrefs.zoom`, localStorage `reglo-agenda-view-prefs`, default 1, clamp `AGENDA_ZOOM_MIN` 0.7 – `AGENDA_ZOOM_MAX` 2.2, step 0.15). `agendaZoomFactor = agendaZoom` (non più gated su `isAgendaFullscreen`) ombreggia `PIXELS_PER_MINUTE`, quindi posizioni/altezze/drag/click/auto-scroll scalano insieme. Il controllo –/%/+ è sempre visibile in toolbar (prima solo in fullscreen); il testo dei blocchi continua a scalare col `--agenda-fs-scale` solo in fullscreen (in vista normale il testo resta costante, cambia solo l'altezza riga, come GCal). Tutto in `AutoscuoleAgendaPage.tsx`.

## Blocco agenda — nota sul blocco + popover portale in hover (REG-397, 2026-08-25)
Quando una guida ha note collegate, il **testo della nota è scritto direttamente sul blocco** in agenda (niente icona separata — la prima versione con l'icona `StickyNote` si sovrapponeva alla campanella/altoparlante ed è stata scartata; scartata anche la seconda versione che espandeva l'altezza del blocco in hover). Comportamento attuale:
- **Collassato**: la nota riempie lo spazio residuo del blocco **multi-riga**, troncando con "…" **solo la parte che non ci sta**. Righe calcolate dallo spazio disponibile: `noteFillLines* = max(1, floor((height − headerPx*) / lineH))` con `headerPx*` stimato da nome/orario/patente/pill; la `<div>` nota usa `line-clamp-[var(--nl)]` con `--nl = noteFillLines*`. Il contenuto del blocco è dentro un wrapper `overflow-hidden h-full` così il blocco **non si deforma**.
- **Hover**: compare un **mini popover** (card navy `#1f2430`) con la **nota intera**, montato in **portale Radix** (`@radix-ui/react-popover`, `PopoverPrimitive.Root/Anchor/Portal/Content`) così **sborda fuori dalla colonna** senza essere tagliato dalle colonne vicine (larghezza `w-[260px]` settimana / `w-[300px]` giorno, `max-w-[80vw]`, `side="top" align="start"` + `collisionPadding`). Aperto/chiuso controllato da uno **stato React** `hoveredNoteId` settato da `onMouseEnter`/`onMouseLeave` del blocco (il blocco è anche `PopoverPrimitive.Anchor asChild` **dentro** `DropdownMenuTrigger asChild` — doppio Slot che compone trigger-click + anchor-hover sullo stesso `<button>`). Animazione **fade + scale** via `data-[state=open|closed]:animate-in/out fade zoom-95`. `pointer-events-none`, `onOpenAutoFocus` prevenuto; il blocco **non cambia dimensione**.
- Test note = `Boolean(item.notes?.trim())`, lo stesso dei popover di dettaglio; `item.notes` è già nel bootstrap agenda (`getAutoscuolaAgendaBootstrapAction`), nessuna modifica a query/serializzazione.
- Vista settimana (istruttori) `hasNotesInstr`/`noteTextInstr`/`noteFillLinesInstr`; vista giorno `hasNotesDay`/`noteTextDay`/`noteFillLinesDay`. Tutto in `AutoscuoleAgendaPage.tsx`. Nota: l'hover di un blocco con note aggiorna `hoveredNoteId` → re-render della pagina agenda (un solo blocco alla volta, accettabile).

## Web agenda — slot click (Google Calendar style, 2026-07-07)
Click su uno slot vuoto (entrambe le viste: istruttori-settimana e istruttori-giorno) → **blocco fantasma** da 1h sullo slot (neutro: bianco, bordo tratteggiato grigio, `renderSlotGhost`, motion pop-in/out) + popover (`slotMenu` state, portal su body) ancorato di fianco alla colonna all'altezza del fantasma, con data/ora dello slot (snap al blocco da 30', `Math.floor`) + istruttore quando la colonna è per-istruttore. Voci = stesse di "+ Nuovo": Appuntamento, Esame, Evento bloccante, Guida di gruppo (se abilitata) — ognuna apre il dialog già precompilato (giorno/ora/istruttore); il fantasma sparisce alla scelta. `GroupLessonCreateDialog` accetta `defaultTime`/`defaultInstructorId` per questo. Prima esisteva solo il click diretto → wizard Appuntamento (viste classica e istruttori-giorno) con un calcolo dell'offset che sbagliava l'orario quando la griglia era scrollata (`+ scrollTop - 40`); ora `clientY - rect.top` puro, corretto a ogni scroll. (La vista "Classica" a colonne-giorno è stata rimossa: l'agenda ha solo le viste a colonne-istruttore, settimana e giorno.) Chiusura: click fuori, Escape, wheel. Regola design: superfici nuove NEUTRE, niente fucsia dominante (preview approvata `~/Desktop/Reglo-Preview-Prenotazione-GCal.html`).

## Popover "Nuovo appuntamento" — comodità (2026-07-11)
- `CreateEventPopover` (condiviso con modifica guida): affordance di scroll (fade top/bottom + pill "Altri campi ▾"), ridimensionabile dal grip in basso a destra (rimbalzo all'apertura), default 600px × altezza naturale da top 250. Posizionamento smart: si affianca alla colonna del ghost (`[data-agenda-col-day]` che contiene `anchor.x`) sul lato con più spazio, gap 20px; l'anchor del menu slot punta al centro colonna.
- Auto-avanzamento form: campo compilato → scroll+focus sul prossimo obbligatorio vuoto (allievo → istruttore → veicolo; note escluse), delay 160ms per il focus-restore di Radix Select.
- **Preselezione istruttore alla scelta dell'allievo**: `assignedInstructorId` (già nel bootstrap) o in mancanza `lastInstructorId` (nuova query DISTINCT ON nel bootstrap: ultimo appuntamento passato non-cancelled per studente). La scelta dell'allievo VINCE sull'istruttore già impostato (es. colonna cliccata nella vista Istruttori); resta il corrente solo se l'allievo non ne suggerisce nessuno.

## Prenotazione nel passato (2026-07-15)
Titolare (web) e istruttore (mobile) possono creare una guida che inizia nel passato, previa **conferma esplicita** — non è più un blocco duro. Implementazione:
- **Backend**: `createAutoscuolaAppointment` / `createAutoscuolaAppointmentBatch` accettano `allowPast?: boolean` (schema + payload, stesso pattern di `skipWeeklyLimitCheck`). Il check `startsAt < Date.now()` → *"Non puoi prenotare una guida nel passato."* scatta **solo se `!allowPast`**. Le route mobile `instructor-bookings/confirm` e `confirm-batch` inoltrano `allowPast === true`.
- **Web** (`AutoscuoleAgendaPage.handleCreate`): se lo start è nel passato apre un `AlertDialog` (icona ambra `History`, pill data/ora, CTA navy "Prenota comunque"); alla conferma richiama `handleCreate({ allowPast: true })`. Nessuna guardia lato create prima di questo (era già solo BE).
- **NON toccati** (restano bloccati): `rescheduleAutoscuolaAppointment` (tranne record-fix owner già esistente), prenotazione allievo (`createBookingRequest`, `getAllAvailableSlots`).
- Guide di gruppo: `createGroupLesson` non ha mai avuto il blocco passato (né BE né FE) → già consentite; la **stessa conferma** è ora presente anche lì (web `GroupLessonCreateDialog` `AlertDialog`, mobile `CreateGroupLessonScreen` `Alert.alert`), puramente client, senza flag BE.

## Parità web↔mobile nel dialog "Modifica guida" (2026-07-15)
Il web `EditAppointmentDialog` ora ha gli stessi controlli della "Gestisci guida" mobile (prima mancavano esito/valutazione/tipi-multipli; il BE li supportava già). **Nessuna modifica BE/mobile** — solo UI web + threading dati:
- **Esito** (Presente=`checked_in` / Assente=`no_show`): segmentato, visibile solo su guide effettuate/correggibili (`showEsito` = stato ≠ cancelled/proposal **e** start ≥ ora−10min, mirror del `correctable` mobile). Salva via `updateAutoscuolaAppointmentStatus` (il BE fa da sé past→completed e riaccredita la guida sul passaggio a no_show). L'esito era già disponibile nel **popover del blocco** (Presente/Assente/Completa) via `canUpdateStatus`; ora è anche nel dialog.
- **Valutazione** (1-5, `StarRatingInput` navy tap-to-clear): visibile solo se stato effettuato (checked_in/completed/no_show) **oppure** se l'utente sta impostando ora un esito. Salva `rating` nei dettagli (BE accetta rating solo su guide effettuate → per questo l'esito si salva PRIMA).
- **Tipo guida multi** ("cosa si è fatto"): chip multi delle 7 attività (`manovre/urbano/extraurbano/notturna/autostrada/parcheggio/altro`, come mobile `lessonTypes.ts`; NO guida/esame) al posto del vecchio select singolo. Salva `lessonTypes[]` (BE scrive anche `type = primo`); selezione vuota = nessun invio (non si azzera il tipo base).
- **Ordine salvataggio** in `handleSubmit`: reschedule → esito → dettagli(tipi/rating/note/…). `handleOpenEdit` ora passa `types`+`rating` al dialog (prima scartati). `EditAppointmentDialogAppointment` esteso con `types?`/`rating?`.

## Modifica dettagli guida dallo storico allievo (2026-07-16)
Oltre che dal blocco agenda / foglio "Gestisci guida", **tipo guida + valutazione + note** di una guida si modificano ora anche dalla **sezione Allievi → dettaglio → storico guide**, sia web che mobile — stesso canale `updateAutoscuolaAppointmentDetails` (`lessonTypes`/`lessonType`, `rating`, `notes`; si inviano solo i campi cambiati). Permessi invariati: owner tutte le guide, istruttore solo le proprie (guardia BE "Puoi modificare solo le tue guide"). La valutazione è mostrata/editabile solo su guide **effettuate** (`checked_in`/`completed`/`no_show`); il tipo non compare per esami/guide di gruppo.
- **Web**: editor inline nel tab **Note** del pannello allievo (`AutoscuoleStudentsPage`, `renderPanelNotes`): chip tipo + stelle + textarea.
- **Mobile**: la riga dello storico (`StudentNotesDetailScreen`) apre il foglio `manage-lesson-details` (seed minimale su `manageLessonStore`), registrato anche nello stack `notes`. Vedi `reglo-mobile/docs/features/notes.md`.

## Redesign cancellazioni / annullamenti — dialogo unico (2026-07-20)
Il vecchio schema aveva **due bottoni confusi** nel popover agenda ("Annulla" = `cancelAutoscuolaAppointment`/`manual_cancel`, "Cancella" = `deleteAutoscuolaAppointment` → `operationallyCancelAppointment`/`operational_cancel`) **più** un "Cancella"/"Cancella tutte" nel dettaglio allievo (`hardCleanupAppointment`, allora solo-future). È stato sostituito da **due sole azioni**, esposte da un **dialogo unico condiviso** agenda ↔ dettaglio allievo, `components/pages/Autoscuole/CancelAppointmentDialog.tsx` (`CancelDialogTarget` normalizzato + `LateOutcome`).

### 1. "Annulla guida" (guide FUTURE)
Un solo dialogo che decide da sé penale/credito. Attore: titolare/admin **oppure** istruttore (non-admin).
- **Server action** `annulAutoscuolaAppointment({ appointmentId, lateOutcome })` (`lib/actions/autoscuole.actions.ts`) → core **`annulFutureAppointment`** (`lib/autoscuole/operational-cancellation.ts`). L'istruttore **non titolare** è forzato a `lateOutcome = "defer"` (non decide addebito/rimborso).
- Effetti fissi: `status → cancelled`, `cancellationKind = "manual_cancel"` (+ `cancellationReason "manual_cancel"`), slot liberati (`releaseSlotsForAppointment`), notifica allievo (push+email, reason `owner_delete`). **Esami e guide di gruppo esclusi** (flussi dedicati).
- **`coverage`** = `credit` (se `creditApplied`) / `money` (se `paymentRequired`) / `none`. **`isLate`** = `now > penaltyCutoffAt`.
- **Nei tempi** (`!isLate`): nessuna penale → se `credit` restituisce 1 credito (`adjustStudentLessonCredits` +1, `creditRefundedAt`); se `money` azzera l'importo (`paymentStatus "waived"`, `invoiceStatus "not_required"`). `lateCancellationAction` resta `null`.
- **Tardivo** (`isLate`) con `lateOutcome` — **vale per tutte e tre le coperture**, `none` compresa (REG-587, 2026-10-01: prima il ramo era `coverage !== "none"` e una guida senza credito né importo finiva sempre in coda, senza che il titolare potesse decidere al momento). Senza copertura la penale **non** è lo storno di un credito ma un **addebito vero**: `manualPaymentStatus = "unpaid"` → la guida risulta "da pagare" e pesa sul blocco automatico per debito, esattamente come fa il pannello "Cancellazioni tardive" alla voce "Addebita" in modalità manuale.
  - `"waive"` → condona: credito reso / importo azzerato, `lateCancellationAction = "dismissed"`.
  - `"penalize"` → applica: credito **trattenuto** (nessun rimborso); con copertura `money` **o `none`** la guida diventa `manualPaymentStatus = "unpaid"` ("da pagare"). `lateCancellationAction = "charged"`.
  - `"defer"` → lasciata in coda **Cancellazioni tardive** (`lateCancellationAction = null`), decisione rimandata al pannello.
- **Di chi è l'imprevisto** (`fault`, REG-587, 2026-10-01) — **la domanda viene PRIMA di tutto il resto** su un annullamento tardivo:
  - `"student"` (default, comportamento storico): vale la regola del preavviso qui sopra.
  - `"school"`: l'imprevisto è dell'autoscuola (istruttore indisponibile, veicolo guasto…) → **nessuna penale, mai**, anche annullando a 10 minuti dalla guida: credito reso, importo azzerato, `lateCancellationAction = null`, `cancellationKind = "operational_cancel"` + `cancellationReason = "school_fault"`. Il marcatore è ciò che tiene la guida **fuori dalla coda "Cancellazioni tardive"** (che filtra `manual_cancel`) e **fuori dal conteggio del blocco automatico per debito** (che guarda `lateCancellationAction = "charged"`). Notifica dedicata all'allievo ("Guida annullata dall'autoscuola… nessuna penale a tuo carico").
  - `fault` è una **constatazione, non una scelta economica**: la può fare anche l'**istruttore** non titolare, che invece resta senza `lateOutcome` (forzato a `defer`).
  - **Il default è `"student"` solo lato API**, per retrocompatibilità: le due UI **non** preselezionano nulla e non lasciano confermare finché non si risponde — era proprio il dare per scontato "colpa dell'allievo" il bug di REG-587.
- Ritorna `data: { isLate, coverage, lateCancellationAction, refundedCredit, fault }`.

#### UI della domanda (REG-587)
- **Web** `CancelAppointmentDialog.tsx`: nel ramo "Annullamento tardivo", due `OptionRow` ("Dell'allievo" / "Dell'autoscuola" con tag *niente penale*) **sopra** le opzioni economiche. Scelta `school` → le opzioni economiche spariscono e compare il riquadro verde con l'effetto reale (credito reso / niente addebito) + "non finisce in Cancellazioni tardive". Il bottone di conferma è disabilitato finché `fault === null`.
- **Mobile istruttore**: form sheet `app/(tabs)/home/cancel-fault.tsx` (HUG_SHEET) + `src/stores/cancelFaultStore.ts`, stesso pattern di `manage-lesson-correct`. Si apre **solo** quando la domanda ha una conseguenza: guida **futura**, non esame/gruppo, `scheduled|confirmed`, oltre `penaltyCutoffAt`. In tutti gli altri casi (guide passate, esami, gruppi, annullamenti nei tempi) resta il permanent-delete di sempre.
- **Campi economici nella bootstrap agenda (fix trovato facendo REG-587)**: `penaltyCutoffAt`, `penaltyAmount`, `creditApplied`, `paymentRequired` **non erano selezionati** da `getAutoscuolaAgendaBootstrapAction`. Il dialogo di annullamento aperto **dall'agenda** vedeva quindi `penaltyCutoffAt: null` → `isLate` sempre falso → il ramo "Annullamento tardivo" (scelta credito/penale, e ora la domanda sulla responsabilità) era **irraggiungibile dall'agenda**; funzionava solo dal dettaglio allievo, che legge da `getAutoscuolaStudentDrivingRegister`. Ora sono nel select e passano col `...rest`; `penaltyAmount` è convertito a `number` (Decimal via JSON diventerebbe stringa e romperebbe il formato euro).
- **Endpoint mobile** `POST /api/autoscuole/appointments/[id]/annul` → `annulAutoscuolaAppointment`. È lo stesso percorso del web: a differenza di `/permanent-cancel` **rilascia gli slot**.

### 2. "Rimuovi dallo storico" (guide PASSATE / concluse)
Fa **sparire** una guida dallo storico allievo e dall'agenda, senza toccare penale/cutoff. Solo titolare/admin.
- **Server action** `hardCleanupAutoscuolaAppointment({ appointmentId, keepInHours?, refundCredit? })` → core **`removeAppointmentFromRecord`** (ex `hardCleanupAppointment`, **NON più future-only**). Marcatore `cancellationKind = "record_cleanup"` (+ `cancellationReason "record_cleanup"`). **Esami e guide di gruppo esclusi**; guard "Guida già rimossa dallo storico" se già `record_cleanup`.
- **`keepInHours = false`** (default): `status → cancelled` (+ `cancelledAt`) → esce da storico + **ore istruttore** + agenda, slot liberati.
- **`keepInHours = true`**: **stato invariato** (es. `completed`) → la guida esce da storico/agenda ma **resta nelle ore dell'istruttore** (l'ha comunque svolta). Slot NON liberati. Vedi asimmetria in `features/instructor-hours.md`.
- **`refundCredit = true`**: se la guida era `creditApplied` e non ancora resa (`creditRefundedAt === null`) restituisce 1 credito.
- **Bulk** `hardCleanupAutoscuolaAppointmentsByStudent({ studentId })` → core `hardCleanupAppointmentsByStudent` (loop di `removeAppointmentFromRecord` sulle sole guide future attive) **esiste ancora** ma **non è più esposto nel web** (niente "Cancella tutte").
- **Niente migrazione** (solo un marcatore su `cancellationKind`).

### Esclusione dallo storico e dall'agenda
- `getAutoscuolaStudentDrivingRegister` ha nel `where` `cancellationKind: { not: "record_cleanup" }` → le guide rimosse spariscono da "Tutte"/"Annullate" **e da tutti i conteggi** (Prisma `not` include anche le righe con `cancellationKind` null).
- L'agenda web (`AutoscuoleAgendaPage.tsx`) filtra `item.cancellationKind === "record_cleanup"` → nascoste anche quando lo stato è rimasto (`keepInHours = true`, es. `completed`).

### UI
- **Popover agenda** (`AutoscuoleAgendaPage.tsx`): un solo CTA rosso → `openCancelDialog(item)`, etichetta **"Annulla guida"** (guida futura attiva) o **"Rimuovi dallo storico"** (concluse/passate). Rimossi i vecchi "Annulla"/"Cancella" e la CTA "Elimina definitivamente".
- **Dettaglio allievo, tab "Guide"** (`AutoscuoleStudentsPage.tsx`): link per-riga **"Annulla"** (`isFutureActive`) o **"Rimuovi"** (concluse) → stesso `CancelAppointmentDialog`. Refetch via `loadRegister`/`loadCredits` (no optimistic). Non c'è più "Cancella tutte".
- Il dialogo è context-aware: `isPast` → sezione "Rimuovi" (opzione ore se `countsInHours` + toggle restituzione credito se `creditApplied`); futura nei tempi → conferma singola; futura tardiva → radio esito (`penalize`/`waive`/`defer`), sostituito da nota "gestita in Cancellazioni tardive" quando `canDecideEconomics = false` (istruttore).

### "Copri con credito" (dettaglio allievo)
- **Server action** `coverAppointmentWithLessonCredit({ appointmentId })`: applica 1 credito a una guida **da pagare** (tipicamente guida di gruppo, che nasce `paymentRequired`/`creditApplied = false`). Consuma 1 credito (`adjustStudentLessonCredits` −1, `booking_consume`), setta `creditApplied = true`, `manualPaymentStatus = null`. Blocca esami, guide già coperte/pagate, richiede `lessonCreditFlowEnabled`. Guardia `canManageStudentCredits`.
- **UI**: link "Copri con credito" nella riga guida (`AutoscuoleStudentsPage.tsx`) quando c'è un importo aperto, non è esame, e l'allievo ha crediti disponibili.

### Ordine dello storico guide (REG-584, 2026-10-01)
Lo storico del dettaglio allievo è **cronologico, le guide più recenti in cima**, e l'ordine è lo stesso nei due tab che lo mostrano:
- **Web** (`AutoscuoleStudentsPage.tsx`): helper condiviso `byMostRecentFirst` usato sia da `renderPanelLessons` (tab "Guide") sia da `renderPanelNotes` (tab "Note"). Il server (`getAutoscuolaStudentDrivingRegister` + `buildDrivingRegisterData`) ordina già per `startsAt desc`: il sort client è esplicito perché il tab "Guide" prima **portava in testa le guide da pagare**, cosa che spezzava la sequenza delle date ed era un doppione del filtro "Da pagare".
- **Mobile**: `StudentNotesDetailScreen` (storico) e `StudentMyNotesScreen` (note dell'allievo) ordinavano già `startsAt desc` — non toccati.
- Se aggiungi un terzo criterio di ordinamento (priorità, non pagate, ecc.), mettilo in un **filtro**, non nel sort: la lista deve restare leggibile come una sequenza di date.

### Preavviso consultabile dopo la decisione
`getAutoscuolaStudentDrivingRegister` ritorna anche `penaltyCutoffAt`. Nel tab "Guide" per gli annullamenti **dell'allievo** (`cancellationKind === "manual_cancel"`) si mostra Pill **"Preavviso: Xh Ymin"** (ricalcolata client da `startsAt − cancelledAt`, **non** persistita) + badge **"Tardiva"** quando `cancelledAt > penaltyCutoffAt`. Resta consultabile **anche dopo** la decisione della coda tardive.

### Campi annullamento esposti al mobile
`getAutoscuolaAppointmentsFiltered` ramo **`light`** aggiunge `cancelledAt, penaltyAmount, penaltyCutoffAt, lateCancellationAction` (vista mobile "Guide annullate").

### Azioni ancora esistenti ma NON più usate dal web (le usa il mobile)
`cancelAutoscuolaAppointment` (`manual_cancel`, usata anche dal trigger owner-notifications quando l'attore è un allievo), `deleteAutoscuolaAppointment` → `operationallyCancelAppointment` (`operational_cancel`), `permanentlyCancelAutoscuolaAppointment` (`permanent_cancel`, solo tasto "Elimina" del foglio Gestisci guida mobile — noti i limiti: nessun guard ruolo/proprietà, slot non liberati). Restano anche i flussi organizzativi automatici (`operationallyCancelAppointmentsByResource`, `cancelOpenLessonsForDeletedStudent`).

### Ore istruttore
`getInstructorDrivingHours`/`getInstructorDrivingHoursRange` contano solo status `completed`/`checked_in`/`no_show`. Quindi: annullo futuro (`cancelled`) e rimozione `keepInHours=false` (`cancelled`) escono dalle ore; rimozione `keepInHours=true` (stato invariato) **resta** nelle ore. Vedi `features/instructor-hours.md`.

## Prenotazione multipla anche da web (REG-590, 2026-10-02)

Il toggle **"Prenotazione multipla"** nel popover *Nuovo appuntamento* (`AutoscuoleAgendaPage.tsx`) replica quello dell'app (`reglo-mobile/src/components/booking/BookingForm.tsx`): acceso, Giorno/Orario/Durata singoli lasciano il posto a una **lista di guide** (`entries`), ognuna con data, ora e durata proprie; **tutto il resto resta condiviso** — allievo, istruttore, veicolo, auto al seguito, moto aggiuntive, tipo guida, luogo e **nota**. Max 20 guide (il cap è nello schema, `.max(20)`).

- **Backend già esistente**: `createAutoscuolaAppointmentBatch` (usata dall'app via `/api/autoscuole/instructor-bookings/confirm-batch`) è una server action → il web la chiama **diretta**, niente route nuova, niente migrazione. L'unica aggiunta è `notes` nello schema del batch: il form web ha il campo Note anche in multipla, e senza quel campo la nota sparirebbe in silenzio. La nota si scrive su **ogni** guida creata, come gli altri campi condivisi.
- **Tutto-o-niente**: al primo conflitto (istruttore/veicolo occupato, slot bloccato, guida di gruppo, due guide del batch che si sovrappongono) l'azione torna `success: false` e **non crea nulla**. Il messaggio nomina lo slot (`"Conflitto per lo slot del 05/10 09:00…"`) e va mostrato **così com'è**: un "errore" generico costringerebbe a cercare a mano quale guida non va.
- **Conferme**: `WEEKLY_LIMIT_CONFIRM` si ritenta con `skipWeeklyLimitCheck` (come nel singolo). `LESSON_BUFFER_CONFIRM` **non esiste** sul percorso batch — non va gestito. La conferma "guida nel passato" si chiede **una volta sola**, sulla guida più vecchia del gruppo.
- **Anteprima**: un blocco tratteggiato per **ogni** guida (`multiGhosts`), numerato, e ognuno è **trascinabile** per conto suo — `moveDraftTo(ymd, time, colId, entryId?)` sposta la guida di quel ghost; cliccando una colonna vuota (nessun `entryId`) si muove **l'ultima** guida, quella che si sta posando. ⚠️ `moveDraftTo` è condivisa con esame/blocco/gruppo/modifica guida/richiesta consorzio: il ramo nuovo vive **dentro** `if (createOpen)` e solo quando `multiMode`, gli altri rami non cambiano. `renderGhostBlock` è il markup unico del ghost (singolo + multipli); `ghostTint(durMin)` è la tinta per durata, prima ricopiata in ogni ramo.
- **Sovrapposizioni dentro il gruppo**: `overlappingEntryIds` le segna **mentre compili** (riga rossa + nota) e blocca la CTA. Capita da sé allungando la durata di una guida sopra quella dopo; prima lo diceva solo il server, al salvataggio, a form già pieno.
- In multipla `draftGhost` torna `null`: giorno e ora del form non vogliono più dire niente, e lasciarlo acceso dipingeva un ghost fantasma in più.

## Key functions
- `createAutoscuolaAppointment()` — single lesson. Conflict scan istruttore+veicoli (aggirabile con `skipConflictCheck`, il "prenota comunque") **+ sovrapposizione stesso allievo (2026-07-29, HARD: non aggirabile)** — *"L'allievo ha già una guida o un esame in quell'orario."* (segnalazione Macchiavello: stesso allievo, stessa ora, 2 istruttori). Il percorso allievo (`createBookingRequest`) aveva già il proprio guard.
- `createAutoscuolaAppointmentBatch()` — batch (exams)
- **`annulFutureAppointment()`** — core "Annulla guida" (guide future): `manual_cancel`, libera slot, notifica, esito credito/penale per copertura × tempistica (`lateOutcome`). Via server action `annulAutoscuolaAppointment()`. **Sostituisce nel web** i due bottoni Annulla/Cancella. Vedi sezione redesign sopra.
- **`removeAppointmentFromRecord()`** (ex `hardCleanupAppointment`, NON più future-only) — core "Rimuovi dallo storico": marcatore `record_cleanup`, opzioni `keepInHours`/`refundCredit`. Via server action `hardCleanupAutoscuolaAppointment()`.
- **`coverAppointmentWithLessonCredit()`** — applica 1 credito a una guida da pagare (dettaglio allievo).
- `cancelAutoscuolaAppointment()` — cancel with refund + reposition queue **(non più usata dal web — solo mobile + trigger owner-notifications sull'annullo allievo)**
- `rescheduleAutoscuolaAppointment()` — reschedule with audit trail (`rescheduledAt`, `rescheduledFromStartsAt`). Overlap check istruttore+veicolo **+ stesso allievo (2026-07-29)**. Owner/admin can also re-time PAST/concluded guides (checked_in/completed/no_show) and move them to other past slots ("record fix", 2026-06-12); a pure past→past fix sends NO student notification. Instructors keep the strict set (scheduled/confirmed/proposal, future only). Cancelled frozen for everyone.
- `updateAutoscuolaAppointmentStatus()` — lifecycle transitions (proposal → scheduled → checked_in → completed)
- `updateAutoscuolaAppointmentDetails()` — edit notes, rating, lesson types, location, instructor, **vehicle** (`vehicleId`, null = unassign; validated company-owned + active), e **durata** (`durationMin`, 2026-07-15). Web `EditAppointmentDialog` exposes the vehicle select (2026-06-12) and opens on past/completed guides too (gate `canRescheduleAppointment` = status ≠ cancelled); instructor change stays blocked on concluded guides (select disabled + BE guard)
- **Modifica durata** (2026-07-15): la durata è ora modificabile — prima non lo era da nessuna parte (ogni flusso preservava la durata originale). Canale scelto: `updateAutoscuolaAppointmentDetails` con nuovo campo `durationMin` (start invariato, `endsAt = startsAt + durationMin`), NON il reschedule → così funziona anche sulle **guide passate** e per gli **istruttori** (l'azione dettagli è permissiva sul passato), senza sporcare l'audit di riprogrammazione né notificare l'allievo. Se la durata **cresce** su una guida **futura**, il BE ri-controlla `findVehicleReservationConflict` (tutti i veicoli riservati) + `verifyInstructorAvailability` sull'intervallo esteso; sul passato o se si accorcia nessun blocco. **Web**: chip "Durata" in `EditAppointmentDialog` (opzioni `[30,45,60,90,120]` + durata attuale) → se cambia solo la durata va nel payload dettagli, se cambia anche data/ora il reschedule porta già `endsAt = nuovoStart + durataScelta`; `durationAffectsAvailability` rivalida live solo sul futuro. **Mobile**: riga "Durata" in `manage-lesson` (optionsPicker) → `updateAppointmentDetails(id, { durationMin })`. Nessuna validazione min/max/multipli lato policy (solo `durationMin > 0`, cap 600').
- `approveAvailabilityOverride()` — approve out-of-availability booking
- `createExamEvent()`, `addExamStudent()`, `removeExamStudent()`, `cancelExamEvent()`
- **Esami senza allievi (2026-07-16)**: un esame si può ora creare **senza selezionare allievi** (le autoscuole spesso non sanno subito chi parteciperà). Non esiste un'entità "esame": è un gruppo di righe `AutoscuolaAppointment` (una per allievo) con `type="esame"`. Per rappresentare un esame vuoto la colonna `AutoscuolaAppointment.studentId` è ora **nullable** (SOLO per gli esami: un esame vuoto = **1 riga segnaposto** con `studentId=null`; ogni altro tipo ha sempre uno studentId — invariante a livello applicativo). Tutte le vie di creazione (`createExamEvent`, `addExamStudent`, API route istruttori `POST /api/autoscuole/exam`, e il mobile che ri-chiama `createExam` sullo stesso slot) passano per l'helper condiviso **`materializeExamSlot()`**: 0 allievi → crea/mantiene 1 segnaposto; aggiungere il **primo** allievo **converte** il segnaposto (niente riga fantasma), gli altri ottengono righe proprie. Identità slot = `(companyId, "esame", startsAt, endsAt, instructorId)`. Il serializer (`mapCaseStudent`) mappa la riga senza allievo su uno **student sintetico** `{ id: "exam-empty[:apptId]", firstName: "Esame" }` così il client non dereferenzia mai `student` null; l'agenda web (`AutoscuoleAgendaPage`, helper `isExamPlaceholder`) e mobile (`weeklyAgenda.isExamPlaceholder`, `exam-manage`, `WeeklyLiveCard`, `WeeklyAgendaView`) escludono i segnaposto da conteggi/liste e mostrano "vuoto"/"Nessun allievo". La rimozione mantiene il guard "non puoi togliere l'ultimo allievo — usa Annulla esame" (si torna a vuoto solo cancellando l'esame). Migrazione: `20260716163809_exam_student_nullable` (solo `DROP NOT NULL`).
### Contatore "x/6" guide obbligatorie

La regola sta in **`lib/autoscuole/mandatory-lessons.ts`** (`REQUIRED_LESSONS_COUNT`,
`isMandatoryLessonDuration`) ed è usata da entrambi i punti che la mostrano:

- `summary` di `getAutoscuolaStudentDrivingRegister` → contatore del dettaglio allievo web
- `buildAppointmentGridFlags` → flag `mandatoryLesson` dei colori agenda

**Contano SOLO le guide da esattamente 60 minuti.** Fino al 2026-09-18 il contatore del
dettaglio allievo contava tutte le guide completate (anche quelle da 30 minuti) mentre
l'agenda applicava già il criterio dei 60: le due viste si contraddicevano. Ora la regola è
una sola. `endsAt` nullo non conta (altrove vale 30 minuti, `computeAppointmentEnd`).

`byLessonType` ("Tipi guida completati") continua invece a contare **tutte** le guide
completate: è un riepilogo dei tipi svolti, non dell'obbligo.

Gemello mobile: `reglo-mobile/src/utils/mandatoryLessons.ts` (usato da
`StudentNotesDetailScreen` e `InstructorNotesScreen`) — da cambiare insieme.

- `getAutoscuolaAppointmentsFiltered()` — lista agenda (light/full); annota ogni guida con `mandatoryLesson` (prime 6 guide individuali **da esattamente 60 minuti** non annullate dell'allievo, `REQUIRED_LESSONS_COUNT`; guide di altra durata non sono obbligatorie e non consumano slot — criterio 2026-06-12, ora in `lib/autoscuole/mandatory-lessons.ts`) ed `examNextDay` (esame il giorno dopo, da `case.drivingExamAt` o appuntamento esame) via `buildAppointmentGridFlags` — usati dai colori della vista griglia mobile
- `setExamPriorityOverride()` — manual exam priority toggle
- `getLateCancellations()`, `resolveLateCancellation()` — late cancel management
- **Cancellazioni staff dall'agenda web**: dal redesign 2026-07-20 il popover evento ha **un solo CTA** ("Annulla guida" / "Rimuovi dallo storico") che apre `CancelAppointmentDialog`. I vecchi due bottoni "Annulla"/"Cancella" e "Elimina definitivamente" sono stati rimossi dal web. Le action `cancelAutoscuolaAppointment` (`manual_cancel`), `deleteAutoscuolaAppointment` → `operationallyCancelAppointment` (`operational_cancel`) e `permanentlyCancelAutoscuolaAppointment` (`permanent_cancel`) restano SOLO per il mobile (e il trigger owner-notifications sull'annullo allievo). Limiti noti del permanent: nessun guard ruolo/proprietà, slot non liberati, penale non azzerata. Vedi la sezione "Redesign cancellazioni" sopra.

## DB models
- `AutoscuolaAppointment` — status, startsAt/endsAt, instructorId, vehicleId, `studentId` (**nullable dal 2026-07-16 — solo per i segnaposto esame senza allievi; vedi sopra**), rating, notes, cancellationReason/Kind (`manual_cancel` | `operational_cancel` | `permanent_cancel` | `record_cleanup`), rescheduledAt, availabilityOverrideApproved, lateCancellationAction, invoiceId/invoiceStatus
- `AutoscuolaCase` — tracks lesson progress per student

## Appointment statuses
`proposal` → `scheduled` → `checked_in` → `completed` (or `cancelled` at any stage)

## Lesson types
manovre, urbano, extraurbano, notturna, autostrada, parcheggio, altro

## Connected features
- **Payments** — cancel refunds credits, confirm consumes credits, settlement charges Stripe
- **Repositioning** — cancel queues auto-reposition
- **Notifications** — push on every status change
- **Cache** — invalidates AGENDA + PAYMENTS segments
- **Communications** — case status notifications, auto-checkin/auto-complete via background job
- **Booking Engine** — booking creates appointments via slot matcher
- **Penalties** — late cancellation triggers penalty charge
