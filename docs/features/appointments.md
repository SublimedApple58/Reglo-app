# Appointments

## What it does
Full lesson/exam lifecycle: create, propose, confirm, check-in, complete, cancel, reschedule, reposition.

## Key files
- `lib/actions/autoscuole.actions.ts` — all appointment mutations (largest action file)
- `lib/autoscuole/lesson-policy.ts` — lesson type validation, time/day restrictions
- `lib/autoscuole/exam-priority.ts` — 14-day priority window before exam date
- `components/pages/Autoscuole/AutoscuoleAgendaPage.tsx` — web agenda UI (170KB)

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

## Cancellazione "pulizia storico" + preavviso ri-esposto (2026-07-20)
Nuova semantica di cancellazione pensata per far **sparire dallo storico** guide future ormai inutili, senza toccare crediti/penale — distinta dalle cancellazioni esistenti (`manual_cancel`, `operational_cancel`, `permanent_cancel`).
- **`hardCleanupAppointment()`** e **`hardCleanupAppointmentsByStudent()`** (`lib/autoscuole/operational-cancellation.ts`): soft-delete con `cancellationKind: "record_cleanup"` (+ `cancellationReason: "record_cleanup"`), status → `cancelled`. **NON** rimborsa il credito, **NON** gestisce penale/cutoff, libera lo slot (`releaseSlotsForAppointment`). Agisce **solo su guide FUTURE ancora attive** (`scheduled`/`confirmed`/`checked_in`); **esami e guide di gruppo esclusi**.
- **Server action** (`lib/actions/autoscuole.actions.ts`): `hardCleanupAutoscuolaAppointment(input)` (singola) e `hardCleanupAutoscuolaAppointmentsByStudent({studentId})` (tutte). Guardia **owner/admin only**.
- **Esclusione dallo storico**: `getAutoscuolaStudentDrivingRegister` ha ora nel `where` `cancellationKind: { not: "record_cleanup" }` → le guide "pulite" spariscono da "Tutte" e "Annullate" **e da tutti i conteggi** (Prisma `not` include anche le righe con `cancellationKind` null).
- **Preavviso ri-esposto (tema 3)**: `getAutoscuolaStudentDrivingRegister` seleziona e ritorna ora anche `penaltyCutoffAt`. Nel tab **"Guide"** del dettaglio allievo (`components/pages/Autoscuole/AutoscuoleStudentsPage.tsx`) per gli annullamenti **dell'allievo** (`cancellationKind === "manual_cancel"`) si mostra una Pill **"Preavviso: Xh Ymin"** (ricalcolata client da `startsAt − cancelledAt`, **non** persistita come numero) + badge **"Tardiva"** quando `cancelledAt > penaltyCutoffAt`. Il preavviso resta consultabile **anche dopo** la decisione della cancellazione tardiva (prima spariva quando usciva dalla coda `getLateCancellations`/`AutoscuoleLateCancellationsPanel`).
- **UI cancella dal dettaglio allievo** (`AutoscuoleStudentsPage.tsx`, pannello Guide): bottone **"Cancella"** per-riga (solo guide future non concluse, no esami/gruppi) + **"Cancella tutte"** nell'header, con `AlertDialog` di conferma, spinner `LoadingDots`, refetch via `loadRegister` (no optimistic).
- **Campi annullamento esposti al mobile**: `getAutoscuolaAppointmentsFiltered` ramo **`light`** aggiunge `cancelledAt, penaltyAmount, penaltyCutoffAt, lateCancellationAction` (consumati dalla vista mobile "Guide annullate").
- **Ore istruttore — nessun impatto**: `getInstructorDrivingHours`/`getInstructorDrivingHoursRange` contano solo status `completed`/`checked_in`/`no_show`, quindi `record_cleanup` (status `cancelled`) è già escluso. Vedi `features/instructor-hours.md`.

## Key functions
- `createAutoscuolaAppointment()` — single lesson
- `createAutoscuolaAppointmentBatch()` — batch (exams)
- `cancelAutoscuolaAppointment()` — cancel with refund + reposition queue
- `rescheduleAutoscuolaAppointment()` — reschedule with audit trail (`rescheduledAt`, `rescheduledFromStartsAt`). Owner/admin can also re-time PAST/concluded guides (checked_in/completed/no_show) and move them to other past slots ("record fix", 2026-06-12); a pure past→past fix sends NO student notification. Instructors keep the strict set (scheduled/confirmed/proposal, future only). Cancelled frozen for everyone.
- `updateAutoscuolaAppointmentStatus()` — lifecycle transitions (proposal → scheduled → checked_in → completed)
- `updateAutoscuolaAppointmentDetails()` — edit notes, rating, lesson types, location, instructor, **vehicle** (`vehicleId`, null = unassign; validated company-owned + active), e **durata** (`durationMin`, 2026-07-15). Web `EditAppointmentDialog` exposes the vehicle select (2026-06-12) and opens on past/completed guides too (gate `canRescheduleAppointment` = status ≠ cancelled); instructor change stays blocked on concluded guides (select disabled + BE guard)
- **Modifica durata** (2026-07-15): la durata è ora modificabile — prima non lo era da nessuna parte (ogni flusso preservava la durata originale). Canale scelto: `updateAutoscuolaAppointmentDetails` con nuovo campo `durationMin` (start invariato, `endsAt = startsAt + durationMin`), NON il reschedule → così funziona anche sulle **guide passate** e per gli **istruttori** (l'azione dettagli è permissiva sul passato), senza sporcare l'audit di riprogrammazione né notificare l'allievo. Se la durata **cresce** su una guida **futura**, il BE ri-controlla `findVehicleReservationConflict` (tutti i veicoli riservati) + `verifyInstructorAvailability` sull'intervallo esteso; sul passato o se si accorcia nessun blocco. **Web**: chip "Durata" in `EditAppointmentDialog` (opzioni `[30,45,60,90,120]` + durata attuale) → se cambia solo la durata va nel payload dettagli, se cambia anche data/ora il reschedule porta già `endsAt = nuovoStart + durataScelta`; `durationAffectsAvailability` rivalida live solo sul futuro. **Mobile**: riga "Durata" in `manage-lesson` (optionsPicker) → `updateAppointmentDetails(id, { durationMin })`. Nessuna validazione min/max/multipli lato policy (solo `durationMin > 0`, cap 600').
- `approveAvailabilityOverride()` — approve out-of-availability booking
- `createExamEvent()`, `addExamStudent()`, `removeExamStudent()`, `cancelExamEvent()`
- **Esami senza allievi (2026-07-16)**: un esame si può ora creare **senza selezionare allievi** (le autoscuole spesso non sanno subito chi parteciperà). Non esiste un'entità "esame": è un gruppo di righe `AutoscuolaAppointment` (una per allievo) con `type="esame"`. Per rappresentare un esame vuoto la colonna `AutoscuolaAppointment.studentId` è ora **nullable** (SOLO per gli esami: un esame vuoto = **1 riga segnaposto** con `studentId=null`; ogni altro tipo ha sempre uno studentId — invariante a livello applicativo). Tutte le vie di creazione (`createExamEvent`, `addExamStudent`, API route istruttori `POST /api/autoscuole/exam`, e il mobile che ri-chiama `createExam` sullo stesso slot) passano per l'helper condiviso **`materializeExamSlot()`**: 0 allievi → crea/mantiene 1 segnaposto; aggiungere il **primo** allievo **converte** il segnaposto (niente riga fantasma), gli altri ottengono righe proprie. Identità slot = `(companyId, "esame", startsAt, endsAt, instructorId)`. Il serializer (`mapCaseStudent`) mappa la riga senza allievo su uno **student sintetico** `{ id: "exam-empty[:apptId]", firstName: "Esame" }` così il client non dereferenzia mai `student` null; l'agenda web (`AutoscuoleAgendaPage`, helper `isExamPlaceholder`) e mobile (`weeklyAgenda.isExamPlaceholder`, `exam-manage`, `WeeklyLiveCard`, `WeeklyAgendaView`) escludono i segnaposto da conteggi/liste e mostrano "vuoto"/"Nessun allievo". La rimozione mantiene il guard "non puoi togliere l'ultimo allievo — usa Annulla esame" (si torna a vuoto solo cancellando l'esame). Migrazione: `20260716163809_exam_student_nullable` (solo `DROP NOT NULL`).
- `getAutoscuolaAppointmentsFiltered()` — lista agenda (light/full); annota ogni guida con `mandatoryLesson` (prime 6 guide individuali **da esattamente 60 minuti** non annullate dell'allievo, `REQUIRED_LESSONS_COUNT`; guide di altra durata non sono obbligatorie e non consumano slot — criterio 2026-06-12) ed `examNextDay` (esame il giorno dopo, da `case.drivingExamAt` o appuntamento esame) via `buildAppointmentGridFlags` — usati dai colori della vista griglia mobile
- `setExamPriorityOverride()` — manual exam priority toggle
- `getLateCancellations()`, `resolveLateCancellation()` — late cancel management
- **Cancellazioni staff dall'agenda web (2026-07-07)**: la CTA "Elimina definitivamente" (`permanentlyCancelAutoscuolaAppointment`, kind `permanent_cancel`) è stata RIMOSSA dal popover evento — restano "Annulla" (`cancelAutoscuolaAppointment`, `manual_cancel`, regole penale/cutoff) e "Cancella" (`deleteAutoscuolaAppointment` → `operationallyCancelAppointment`, `operational_cancel`: rimborso sempre, penale waived, slot liberati, ora con confirm). L'action + endpoint `/permanent-cancel` restano SOLO per il tasto "Elimina" del foglio Gestisci guida mobile — noti i suoi limiti: nessun guard ruolo/proprietà, slot non liberati, penale non azzerata.

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
