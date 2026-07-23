# Feature Impact Map — Reglo

When modifying a feature, read its connected features to verify nothing breaks.

## Adjacency List

Each entry: **Feature** → list of features it connects to, with reason.

### Appointments
- → **Payments**: cancel refunds credits (`refundLessonCreditIfEligible`; l'annullo web `annulFutureAppointment` rende il credito via `adjustStudentLessonCredits` o azzera l'importo `waived`), confirm consumes credits, settlement charges Stripe, `coverAppointmentWithLessonCredit` applica 1 credito a una guida da pagare
- → **Repositioning (retired)**: cancel now cancels only — no reposition/proposal (`queueOperationalRepositionForAppointment` is cancel-only behind `REPOSITIONING_ENABLED=false`)
- → **Notifications**: push on create/cancel/reschedule/propose (l'annullo web via `annulFutureAppointment` notifica con reason `owner_delete`)
- → **Cache**: invalidates AGENDA + PAYMENTS
- → **Communications**: case status change triggers notifications
- → **Booking Engine**: booking request creates appointments via slot matcher
- → **Vehicles (M:N + auto al seguito, 2026-06-24)**: an appointment reserves **N vehicles** via the `AutoscuolaAppointmentVehicle` join (`role=primary|follow`); `vehicleId` stays = the primary. A moto lesson may add a follow car. Any busy-interval builder / conflict-check must read the join, not just `vehicleId` (`slot-matcher`, `autoscuole-availability.actions`, `createAutoscuolaAppointment`, `communications.freeSlotLicenseKeysTomorrow`). `updateAutoscuolaAppointmentDetails({vehicleId, followVehicleId})` reconciles the join. Swaps exclude follow-car lessons. See `features/vehicles.md`.
- → **Cases & Deadlines**: appointments track lesson progress per case
- → **Penalties**: annullo tardivo → coda "Cancellazioni tardive". Dal redesign 2026-07-20 il titolare può decidere subito nel dialogo "Annulla guida" (`annulFutureAppointment`, `lateOutcome` penalize/waive/defer) oppure lasciare `defer` per il pannello. Il **preavviso** dell'allievo (`manual_cancel`) è ricalcolato e mostrato in modo permanente nel dettaglio allievo (Pill "Preavviso" + badge "Tardiva"). `resolveLateCancellation` ora restituisce davvero il credito su "dismiss"; CTA dinamici (`creditApplied` da `getLateCancellations`). Vedi `features/penalties.md`
- → **Redesign cancellazioni / dialogo unico (`CancelAppointmentDialog`, 2026-07-20)**: due sole azioni web condivise agenda↔dettaglio allievo.
  - **"Annulla guida"** (future) → `annulAutoscuolaAppointment({appointmentId, lateOutcome})` → core `annulFutureAppointment` (`operational-cancellation.ts`): `manual_cancel`, libera slot, notifica; esito credito/penale per copertura (credit/money/none) × tempistica (`isLate` vs `penaltyCutoffAt`). Impatta **Payments** (refund credito o `waived`/`unpaid`) e **Penalties** (coda su `defer`). Owner/admin decidono l'esito; istruttore non-titolare → sempre `defer`.
  - **"Rimuovi dallo storico"** (passate) → `hardCleanupAutoscuolaAppointment({appointmentId, keepInHours?, refundCredit?})` → core `removeAppointmentFromRecord` (ex `hardCleanupAppointment`, non più future-only): marcatore `record_cleanup`. `getAutoscuolaStudentDrivingRegister` + agenda filtrano `record_cleanup` → sparisce da storico/agenda/conteggi. `keepInHours=false` → `cancelled` (fuori da **Instructor Hours** + slot liberati); `keepInHours=true` → stato invariato → **RESTA nelle Instructor Hours** (asimmetria voluta, vedi `features/instructor-hours.md`). `refundCredit=true` → +1 credito se coperta e non resa. Bulk `hardCleanupAutoscuolaAppointmentsByStudent` esiste ma non più esposto nel web.
  - **"Copri con credito"** → `coverAppointmentWithLessonCredit({appointmentId})`: applica 1 credito a una guida da pagare (guide di gruppo). Impatta **Payments** (−1 credito, `creditApplied`).
  - Azioni legacy `cancelAutoscuolaAppointment`/`deleteAutoscuolaAppointment`/`permanentlyCancelAutoscuolaAppointment` restano SOLO per il mobile (e trigger owner-notifications).
- → **Mobile**: types `AutoscuolaAppointmentWithRelations` used in 14 screens; il ramo `light` di `getAutoscuolaAppointmentsFiltered` ora espone `cancelledAt/penaltyAmount/penaltyCutoffAt/lateCancellationAction` per la vista mobile "Guide annullate" (allievo)
- → **Group Lessons (per-student notes, 2026-06-16)**: a group-lesson seat is an appointment, so `updateAutoscuolaAppointmentDetails({notes})` is the per-student note editor; the seat note reaches the student via the normal `getAppointments`/`latest-note` paths (mobile teal note card). See `features/group-lessons.md`.
- → **Group Lessons MOTO (`kind="moto"`, 2026-06-25)**: a moto group reserves a **fleet of motos** (`AutoscuolaGroupLessonVehicle`) + **one shared follow car** (`AutoscuolaGroupLesson.followVehicleId`) — both reserved at the **container level** for the whole window (`group-lesson-busy.ts`). Each participant gets an **auto-assigned** fleet moto (`lib/autoscuole/group-moto.ts`); mixed categories allowed. `findGroupLessonOverlap` now takes `vehicleIds[]` and checks other containers' fleet/follow car. Any new group-lesson conflict check must consider the fleet + follow car, not a single `vehicleId`. See `features/group-lessons.md`.

### Locations (Sede e luoghi)
- → **Appointments**: guide e prenotazioni selezionano un luogo (default = sede `isDefault`); mostrato agli allievi nel dettaglio guida
- → **Mobile**: dettaglio guida apre Google Maps quando `isPrecise` (address+coords da Google Places)

### Availability
- → **Booking Engine**: `getPublicationModeFilter()` gates student booking; slot-matcher reads weekly/daily/published data
- → **Repositioning**: reposition uses slot-matcher which reads availability
- → **Notifications**: publication triggers `availability_published` push
- → **Cache**: invalidates AGENDA
- → **Instructor Clusters**: `parseInstructorSettings()` for availabilityMode
- → **Mobile**: `InstructorAvailabilityScreen`, `PublicationModeEditor`, booking flow in `AllievoHomeScreen`

### Lezione teorica (agenda)
- **È un** `AutoscuolaInstructorBlock` con `reason:"theory_lesson"` (nessuna migrazione, nessun modello nuovo)
- → **Availability**: `getAllAvailableSlots`/`getDateAvailabilityMap` la sottraggono già (carve dei block); la fascia sparisce agli allievi
- → **Appointments/Booking**: `verifyInstructorAvailability` + overlap-check in create/reschedule rifiutano guide/esami/gruppi sovrapposti
- → **Instructor Absences**: stesso modello/rendering (`blockTint`/`formatBlockReason`) ma NON è un'assenza (niente cancellazione guide)
- → **Creazione**: solo web (`AutoscuoleAgendaPage` menu ＋ + popover veloce, `blockKind`), riusa `createInstructorBlock`
- → **Mobile**: visualizza + crea (istruttore per sé); dot calendario indaco; `weeklyAgenda.ts` `BLOCK_PRESENTATION.theory`

### Booking Engine
- → **Availability**: reads weekly, daily overrides, published weeks, holidays
- → **Appointments**: creates appointments when booking confirmed
- → **Payments**: captures payment snapshot on booking
- → **Instructor Clusters**: respects cluster assignments, autonomous mode
- → **Penalties**: booking governance enforces limits to prevent abuse
- → **Group Lessons**: scheduled containers (even empty) are busy intervals for instructor+vehicle (`lib/autoscuole/group-lesson-busy.ts`, fix 2026-06-12)

### Payments & Credits
- → **Appointments**: settlement/retry/penalty reads appointment data; refund on cancel
- → **Swaps**: `adjustStudentLessonCredits(swap_consume/swap_refund)`
- → **Holidays**: bulk cancel refunds credits
- → **Communications**: background jobs call payment functions (settlement, retry, penalty, invoice)
- → **Cache**: invalidates PAYMENTS + FIC
- → **Mobile**: `AllievoPaymentsScreen`, payment types

### Swaps
- → **Payments**: credit adjust for both students (swap_consume/swap_refund)
- → **Instructor Clusters**: `isStudentInManualFullCluster()` checks eligibility
- → **Notifications**: push to both students on offer/accept
- → **Cache**: invalidates PAYMENTS
- → **Mobile**: `SwapOffersScreen`, `NotificationOverlay`
- → **Group Lessons**: group-lesson seats and exams are NOT swappable — guards in all 3 swap mutations + offers list filter (fix 2026-06-12)

### Holidays
- → **Appointments**: bulk cancel with credit refunds
- → **Payments**: `refundLessonCreditIfEligible()` per appointment
- → **Notifications**: push + email to affected students
- → **Booking Engine**: slot-matcher excludes holiday dates
- → **Cache**: invalidates AGENDA + PAYMENTS
- → **Mobile**: `TitolareHomeScreen`, `NotificationOverlay`
- ← **Settings**: `updateAutoscuolaSettings` chiama `syncCompanyNationalHolidays` sui campi `nationalHolidaysEnabled/Disabled` (preset festività nazionali → righe con `presetId`)
- ← **Trigger.dev**: cron giornaliero `autoscuole-national-holidays` (rolling window annuale del preset)

### Notifications
- → **ALL features**: every feature sends push via `sendAutoscuolaPushToUsers()`
- → **Mobile (full checklist for new kind)**: `NotificationOverlay`, `NotificationInboxScreen`, `notifications.ts` types, `notificationStore.ts`
- → **Recovery endpoint**: `app/api/autoscuole/notifications/route.ts` — queries DB fields per kind
- → **Web Settings**: pane "Promemoria e notifiche" (`tabs/SettingsTab.tsx` sezione reminders) — preavvisi, canali e card "Notifica slot vuoti" (`emptySlotNotification*`, spostata da Prenotazioni e allievi il 2026-07-12)

### Instructor Clusters
- → **Student Phase + Quiz Seats**: instructor invite code accettato da `student-register` (assegna `assignedInstructorId` alla registrazione; valido solo se active+autonomousMode)
- → **Availability**: availabilityMode (default vs publication)
- → **Booking Engine**: booking actors, weekly limits, slot durations, autonomous mode
- → **Swaps**: cluster mode affects swap eligibility
- → **Communications**: cluster mode affects reminder behavior
- → **Repositioning**: respects cluster constraints
- → **Mobile**: `SettingsScreen`, `ClusterSettingsScreen`, `InstructorAvailabilityScreen`, `PublicationModeEditor` (9 screens total)

### Auto-block prenotazioni per debito allievo (web-only)
- **Scrive sullo STESSO campo** `CompanyMember.bookingBlocked` del blocco manuale (unificazione). Distinzione origine via `bookingBlockReason` ("manual" | "unpaid_threshold" | null) + watermark `unpaidBlockClearedAtCount` per l'anti-conflitto sullo sblocco manuale. State machine pura in `lib/autoscuole/unpaid-auto-block.ts`.
- → **Payments**: il conteggio "guide da pagare" (`isLessonUnpaid`, = `manualUnpaid`) dipende da `manualMode` (`getAutoscuolaPaymentConfig`) e dallo stato pagamento delle guide. `isLessonUnpaid` ora è **definizione unica** nell'helper, importata da `autoscuole.actions.ts`.
- → **Availability / Booking Engine**: il guard prenotazione da app (`ensureStudentCanBookFromApp`-like) riconcilia il blocco **prima** del check `bookingBlocked` (solo se la feature è attiva) → enforcement al momento della prenotazione.
- → **Swaps**: le guard swap (`respondToSwapOffer`, offerte) leggono `bookingBlocked` → rispettano il blocco automatico senza codice extra (campo unificato).
- → **Settings (tab Limiti)**: `autoBookingBlockEnabled` / `autoBookingBlockThreshold` nel JSON `limits` del CompanyService (pattern identico a `weeklyBookingLimit`). Spegnere la feature rilascia solo i blocchi `unpaid_threshold`.
- → **Students directory / dettaglio allievo**: `getAutoscuolaStudentsWithProgress` + `getAutoscuolaStudentRegister` riconciliano on-read; `toggleStudentBookingBlock` marca `reason`+watermark. La UI mostra "Blocco automatico per guide da pagare".
- **Volutamente NON connesso a Mobile**: nessun nuovo tipo/endpoint mobile; il mobile subisce solo l'effetto del blocco esistente.

### Pronto per l'esame (exam-ready)
- → **Student Phase**: `examReady` esiste solo in PRATICA; `updateStudentPhase` lo azzera all'uscita (→ PATENTATO)
- → **Exam creation (agenda web + mobile)**: differenzia pronti/non-pronti nel picker (badge + ordine); NON vincola la creazione
- → **Mobile**: contratto `examReady`/`examReadyAt`/`studentPhase` su `AutoscuolaStudent` + array `students` di `getInstructorSettings`; toggle in `StudentNotesDetailScreen`

### Users Directory
- → **Istruttori/Agenda**: `deleteUser` di un istruttore → `AutoscuolaInstructor` inactive + guide future annullate (`operationallyCancelAppointmentsByResource`)
- → **Registrazione (tutti i canali)**: `releaseEmailIfOrphaned` chiamato in `createCompanyUser`, `signUpUser`, `acceptCompanyInviteAndRegister`, mobile `invites/[token]/accept`, mobile `student-register` — un account orfano (0 membership) non blocca mai il riuso dell'email
- → **Mobile auth**: self-deletion mobile usa lo stesso `deleteAndAnonymizeUserAccount`

### Company Plan
- → **Backoffice**: dialog piano nella lista companies (auth cookie); NON sincronizza i CompanyService.limits (attivazione operativa separata in "Gestisci")
- → **Support Center**: "Gestisci" della card porta alla chat assistenza
- → **Area personale**: pane Abbonamento (riservata OWNER/INSTRUCTOR_OWNER)

### Company Documents
- → **Backoffice**: dialog documenti nella lista companies (stessa auth cookie); upload via API route dedicata
- → **Storage R2**: stesso client di avatar/aula; download solo con URL firmati (mai public base)
- → **Area personale**: pane "Contratto e fattura" (riservata OWNER/INSTRUCTOR_OWNER)

### Support Center + Feedback
- → **Users Directory**: `SupportMessage.senderUserId` / `ProductFeedback.userId` SetNull su delete utente (il nome resta come snapshot `senderName`/`userName`)
- → **Backoffice**: nuove pagine support/feedback sotto la stessa auth cookie (`requireGlobalAdmin`); header con nav + badge non-letti
- → **Shell web**: `AutoscuoleShell` polla `getSupportUnreadCount` (badge hamburger + voce menu)
- → **Email**: avvisi al team via `sendDynamicEmail` (no-op staging)

### Instructor Colors
- → **Appointments/Agenda**: `AutoscuoleAgendaPage` avatars + availability bands read `instructor.color` (fallback: positional palette). Event cards keep the duration/type palette.
- → **Instructor Clusters**: saved via `updateAutoscuolaInstructor` (OWNER-only field, stripped for self-instructor like `name`/`status`)
- → **Mobile**: `color` already returned by `GET /api/autoscuole/instructors` + agenda bootstrap (not consumed yet)

### Communications
- → **Payments**: calls settlement, retry, penalty, invoice jobs
- → **Notifications**: sends push + WhatsApp + email reminders
- → **Repositioning**: processes reposition queue
- → **Appointments**: auto-checkin, auto-complete, pending review transitions
- → **Cases & Deadlines**: processes deadline reminders

### Cases & Deadlines
- → **Appointments**: appointments track lesson count per case
- → **Communications**: deadline reminders (pink sheet, medical expiry)
- → **Notifications**: push on case status change

### Repositioning (retired 2026-06-08 — cancel-only, see features/repositioning.md)
- → **Appointments**: cancellation entry points now cancel only (no proposal)
- → **Payments**: refunds lesson credit on cancel if the lesson was upcoming
- → **Notifications**: reason-specific cancellation push/email
- → **Cache**: invalidates AGENDA / PAYMENTS
- (legacy, dead behind `REPOSITIONING_ENABLED=false`) Booking Engine slot-matching

### Penalties
- → **Payments**: penalty charge via Stripe, tracked in AppointmentPayment; `resolveLateCancellation` "dismiss" ora **restituisce il credito** (+1) se la guida era coperta e non ancora resa, "charge" lo ri-scala / segna `manualPaymentStatus=unpaid`
- → **Appointments**: reads cancellation time vs cutoff; la coda tardive è alimentata da `annulFutureAppointment` con `lateOutcome="defer"` (o annullo allievo / no-show). CTA del pannello dinamici su `creditApplied`
- → **Communications**: background job triggers penalty processing

### Voice AI
- → **Instructor Clusters**: voice settings stored in company settings
- → **Notifications**: callback tasks, missed call handling
- → **Settings (web)**: le impostazioni segretaria sono il pane `voice` di AutoscuoleResourcesPage (`?tab=settings&pane=voice`)
- → **Support Center**: lo stato "feature non attiva" (VoiceInactiveState) invia la richiesta di attivazione via `sendSupportMessage`
- → Mostly self-contained (Twilio/Telnyx webhooks, knowledge base, call records)

### Quiz Teoria
- → **Settings**: posti quiz (`quizSeats`, `phasesEnabled`, `autoAssignQuizOnSignup`) in CompanyService.limits. Il legacy `quizEnabled` è stato rimosso dal JSON in migration `20260514000001`.
- → **Cache**: QUIZ segment, invalidated on answer/complete
- → **Backoffice**: card "Quiz Teoria — Gestione licenze" + card "Fasi attive del percorso" (BackofficeCompaniesPage). Dialog di risoluzione `BackofficeResolveTeoriaDeactivationDialog` quando si disattiva TEORIA con allievi attivi.
- → **Mobile**: QuizHomeScreen, QuizSessionScreen, QuizResultsScreen (3 screens). Tab visibile **solo se `studentPhase === TEORIA` AND `hasQuizAccess === true`**.
- → **Student Phase**: la fase TEORIA è il contesto in cui il quiz ha senso. Il seat consumato a vita (`CompanyMember.quizSeatGrantedAt`) determina chi vede il quiz.
- → Self-contained: global question pool, student-scoped sessions/answers/stats

### Student Phase + Quiz Seats
- → **Booking Engine**: `ensureStudentCanBookFromApp` rifiuta se phase = AWAITING o TEORIA (messaggi distinti). Anche `getAllAvailableSlots` e `getDateAvailabilityMap` ereditano il blocco.
- → **Quiz Teoria**: la fase TEORIA + `hasQuizAccess` controllano visibilità tab mobile. Seat = licenza nominale a vita (`CompanyMember.quizSeatGrantedAt`).
- → **Cases & Deadlines**: riusa `AutoscuolaCase.theoryExamAt` per countdown (no duplicazione campi).
- → **Communications / Background Jobs**: `processAutoscuolaTheoryReminders` esegue countdown T-7/T-3/T-1 e nudge inattività 5gg per TEORIA.
- → **Notifications**: kinds `theory_exam_countdown` e `theory_quiz_inactivity` (mobile-inbox-only).
- → **Mobile**: 4 home screen per fase (AWAITING / TEORIA / PRATICA / PATENTATO). AWAITING nasconde tutte le tab funzionali; il tab Quiz richiede `hasQuizAccess`.
- → **Web Titolare**: `AutoscuoleStudentsPage` mostra banner licenze, sezione "In attesa di attivazione" con bottone "Assegna quiz", drawer con cambio fase + grant seat. `tabs/BookingsTab.tsx` (pane "Prenotazioni e allievi", sub-tab App allievi) espone il toggle "Assegnazione automatica della licenza quiz" (autoAssignQuizOnSignup) visibile solo se TEORIA è attiva.
- → **Backoffice**: gestione licenze + fasi attive + dialog di risoluzione disattivazione TEORIA (`getQuizSeatsUsage`, `getTeoriaAffectedStudents`, `deactivateTeoriaWithResolution`).
- → **Student Registration**: `POST /api/mobile/auth/student-register` decide fase + seat in transaction in base a `phasesEnabled` + `autoAssignQuizOnSignup` + seat disponibili.

### Reglo Aula
- → **Quiz Teoria**: riusa **read-only** `QuizQuestion` + `QuizChapter` (DB) + immagini quiz su R2 per le domande del live (filtro per capitolo). Aula non scrive sulla banca — asset aziendale già centralizzato, non duplicato.
- → **R2 storage**: pacchetti slide `.rppt` (`aula/templates/`, `aula/{companyId}/`) + immagini slide; stesso bucket del quiz. **Le slide non stanno nel DB.**
- → **Redis**: tutto il quiz live (sessione/partecipanti/risposte) è effimero su Redis — **nessuna tabella Postgres** per il live (0 storico MVP). Unica tabella DB: `AulaLesson` (puntatori).
- → **Settings / Backoffice**: flag `aulaEnabled` in `CompanyService.limits` (stesso pattern di `quizEnabled`).
- → **Cache**: segmento `AULA`, invalidato su modifica lezioni/pacchetto slide.
- → **Auth & RBAC**: console docente gated owner/instructor; join studente (`/aula-live/[code]`) **pubblico, no auth**.
- → **Student Phase (TEORIA)**: contesto concettuale (lezioni di teoria), ma il live è anonimo → legame volutamente lasco.
- **Volutamente NON connesso**: Appointments, Payments, Booking Engine, Swaps, Holidays. Aula è un catalogo a sé (niente crediti/refund/swap/slot). Presenze ↔ agenda è estensione futura fuori scope.

### Never-accessed nudge (allievo mai loggato)
- → **Mobile Auth / Push**: `neverAccessed` = nessun `MobileAccessToken` (login mobile) **e** nessun `MobilePushDevice` (push) per lo userId. Se cambia come/quando vengono creati quei record, cambia il significato del flag. Nessun `lastLoginAt` su `User`.
- → **Appointments / Agenda**: il flag viaggia nell'array `students` del bootstrap agenda (`getAutoscuolaAgendaBootstrapAction` → `listDirectoryStudents`); la web page costruisce mappe client (`neverAccessedById`, `phoneById`) come `studentLicenseById`. Solo guide **individuali** (no gruppo).
- → **Students directory**: `getAutoscuolaStudentsWithProgress` annota il flag → `AutoscuoleStudentsPage`.
- → **Cache**: entra nel payload bootstrap in cache Redis (segmento AGENDA, 20s) → il badge sparisce entro ~20s dal primo accesso dell'allievo.
- → **Design system**: icone 3D Fluent (MIT) in `public/images/3d/`; animazione `.megaphone-ring` in `globals.css` rispetta `prefers-reduced-motion`.

### Owner notifications (bell annullamenti allievi)
- → **Appointments / Appointment Cancel**: il trigger vive dentro `cancelAutoscuolaAppointment` — quando l'attore è un **allievo** (non staff), guida **futura non-esame**, crea una `AutoscuolaNotification` via `after()`. Se cambia chi/come annulla (o il rilevamento dell'attore-allievo), aggiorna il trigger.
- → **Shell / Layout**: `OwnerNotificationsBell` è montato in `AutoscuoleShell` (cluster destro). Owner-only: l'endpoint risponde 403 ai non-titolari → il bell si auto-nasconde.
- → **Mobile Notifications**: NON confondere con `/api/autoscuole/notifications` (feed recovery mobile, derivato da altre tabelle). Il bell titolare usa `/api/autoscuole/owner-notifications` + tabella `AutoscuolaNotification`.
- → **DB**: nuova tabella `AutoscuolaNotification` (`readAt` per-azienda, snapshot display). Real-time = polling 25s (nessuna infra); rimpiazzabile con servizio gestito senza toccare la UI.

### Password Reset (mobile)
- → **Auth & RBAC**: riusa `MobileAccessToken` + `issueMobileToken`; il confirm revoca TUTTE le sessioni mobile dell'utente (`deleteMany`) e ne emette una nuova.
- → **Login**: condivide `buildMobileAuthPayload` (`lib/mobile-auth-payload.ts`) — se cambia la shape di `AuthPayload`, aggiorna login + confirm + mobile types insieme.
- → **Communications**: invia il codice OTP via `sendDynamicEmail` (Resend) dentro `after()`.
- → **Mobile**: `PasswordResetScreen` consuma le 3 route; auto-login via `SessionContext.applyAuthPayload`.

### Login as admin (impersonazione autoscuola)
- → **Auth & Session**: nuovo provider NextAuth `impersonation` in `auth.ts` (consuma un grant firmato HMAC, `lib/impersonation-grant.ts`); i callback `jwt`/`session` portano il claim `impersonation` (solo nel cookie dell'operatore Reglo).
- → **Company Context**: `getActiveCompanyContext` onora `session.impersonation.companyId` con priorità e **non** persiste `activeCompanyId` in impersonazione (minimo impatto sull'owner reale).
- → **Backoffice**: `impersonateCompany` gated `requireGlobalAdmin`; pulsante "Accedi come titolare" in `BackofficeCompaniesPage`.
- **Volutamente NON connesso** a member-listing / conteggi / notifiche: si agisce come **owner reale**, nessun account nuovo → invisibile per costruzione.

## Critical Call Chains

### Appointment Cancel (web — dialogo unico, 2026-07-20)
```
annulAutoscuolaAppointment() → annulFutureAppointment()
    → update(status=cancelled, cancellationKind=manual_cancel, lateCancellationAction?)
    → releaseSlotsForAppointment()
    → adjustStudentLessonCredits(+1)  // se nei tempi / waive su guida a credito
    → notifyOperationalCancellation(reason=owner_delete) → sendAutoscuolaPushToUsers() + email
    → invalidateAutoscuoleCache(AGENDA, PAYMENTS)

hardCleanupAutoscuolaAppointment() → removeAppointmentFromRecord()
    → update(cancellationKind=record_cleanup, status=cancelled se !keepInHours)
    → releaseSlotsForAppointment()  // solo se !keepInHours
    → adjustStudentLessonCredits(+1)  // solo se refundCredit + coperta
```

### Appointment Cancel (mobile / legacy)
```
cancelAppointment() → refundLessonCreditIfEligible() → adjustStudentLessonCredits()
                    → queueOperationalRepositionForAppointment() → findBestAutoscuolaSlot()
                    → sendAutoscuolaPushToUsers()
                    → invalidateAutoscuoleCache(AGENDA, PAYMENTS)
```

### Holiday Bulk Cancel
```
createHoliday(cancelAppointments: true) → for each appointment:
  refundLessonCreditIfEligible() + cancel + push per student + email
→ invalidateAutoscuoleCache(AGENDA, PAYMENTS)
```

### Swap Accept
```
respondToSwapOffer(accept) → adjustStudentLessonCredits(swap_consume) for taker
                           → adjustStudentLessonCredits(swap_refund) for giver
                           → update both appointments
                           → push to both students
                           → invalidateAutoscuoleCache(PAYMENTS)
```

### Background Job (every 1 min)
```
autoscuole-reminders.ts → communications.ts →
  processAutoComplete/AutoCheckin/PendingReview (appointment transitions)
  processLessonSettlement → payments.ts (credit consume + Stripe charge)
  processPenaltyCharges → payments.ts (late cancel fees)
  processPaymentRetries → payments.ts (3 attempts, 4h/8h backoff)
  processInvoiceFinalization → payments.ts (push to FIC)
  processConfiguredReminders + MorningReminders + AppointmentReminders (push + WhatsApp)
  processCaseDeadlines (pink sheet, medical expiry alerts)
  processPendingRepositions → repositioning.ts → slot-matcher.ts
```
