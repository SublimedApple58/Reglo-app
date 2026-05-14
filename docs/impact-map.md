# Feature Impact Map — Reglo

When modifying a feature, read its connected features to verify nothing breaks.

## Adjacency List

Each entry: **Feature** → list of features it connects to, with reason.

### Appointments
- → **Payments**: cancel refunds credits (`refundLessonCreditIfEligible`), confirm consumes credits, settlement charges Stripe
- → **Repositioning**: cancel queues reposition (`queueOperationalRepositionForAppointment`)
- → **Notifications**: push on create/cancel/reschedule/propose
- → **Cache**: invalidates AGENDA + PAYMENTS
- → **Communications**: case status change triggers notifications
- → **Booking Engine**: booking request creates appointments via slot matcher
- → **Cases & Deadlines**: appointments track lesson progress per case
- → **Penalties**: late cancellation triggers penalty charge
- → **Mobile**: types `AutoscuolaAppointmentWithRelations` used in 14 screens

### Availability
- → **Booking Engine**: `getPublicationModeFilter()` gates student booking; slot-matcher reads weekly/daily/published data
- → **Repositioning**: reposition uses slot-matcher which reads availability
- → **Notifications**: publication triggers `availability_published` push
- → **Cache**: invalidates AGENDA
- → **Instructor Clusters**: `parseInstructorSettings()` for availabilityMode
- → **Mobile**: `InstructorAvailabilityScreen`, `PublicationModeEditor`, booking flow in `AllievoHomeScreen`

### Booking Engine
- → **Availability**: reads weekly, daily overrides, published weeks, holidays
- → **Appointments**: creates appointments when booking confirmed
- → **Payments**: captures payment snapshot on booking
- → **Instructor Clusters**: respects cluster assignments, autonomous mode
- → **Penalties**: booking governance enforces limits to prevent abuse

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

### Holidays
- → **Appointments**: bulk cancel with credit refunds
- → **Payments**: `refundLessonCreditIfEligible()` per appointment
- → **Notifications**: push + email to affected students
- → **Booking Engine**: slot-matcher excludes holiday dates
- → **Cache**: invalidates AGENDA + PAYMENTS
- → **Mobile**: `TitolareHomeScreen`, `NotificationOverlay`

### Notifications
- → **ALL features**: every feature sends push via `sendAutoscuolaPushToUsers()`
- → **Mobile (full checklist for new kind)**: `NotificationOverlay`, `NotificationInboxScreen`, `notifications.ts` types, `notificationStore.ts`
- → **Recovery endpoint**: `app/api/autoscuole/notifications/route.ts` — queries DB fields per kind

### Instructor Clusters
- → **Availability**: availabilityMode (default vs publication)
- → **Booking Engine**: booking actors, weekly limits, slot durations, autonomous mode
- → **Swaps**: cluster mode affects swap eligibility
- → **Communications**: cluster mode affects reminder behavior
- → **Repositioning**: respects cluster constraints
- → **Mobile**: `SettingsScreen`, `ClusterSettingsScreen`, `InstructorAvailabilityScreen`, `PublicationModeEditor` (9 screens total)

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

### Repositioning
- → **Booking Engine**: uses `findBestAutoscuolaSlot()` to find targets
- → **Availability**: reads all availability data
- → **Notifications**: push to student when repositioned
- → **Cache**: invalidates AGENDA

### Penalties
- → **Payments**: penalty charge via Stripe, tracked in AppointmentPayment
- → **Appointments**: reads cancellation time vs cutoff
- → **Communications**: background job triggers penalty processing

### Voice AI
- → **Instructor Clusters**: voice settings stored in company settings
- → **Notifications**: callback tasks, missed call handling
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
- → **Web Titolare**: `AutoscuoleStudentsPage` mostra banner licenze, sezione "In attesa di attivazione" con bottone "Assegna quiz", drawer con cambio fase + grant seat. `SettingsTab` espone toggle "Modalità registrazione allievi" (autoAssignQuizOnSignup) visibile solo se TEORIA è attiva.
- → **Backoffice**: gestione licenze + fasi attive + dialog di risoluzione disattivazione TEORIA (`getQuizSeatsUsage`, `getTeoriaAffectedStudents`, `deactivateTeoriaWithResolution`).
- → **Student Registration**: `POST /api/mobile/auth/student-register` decide fase + seat in transaction in base a `phasesEnabled` + `autoAssignQuizOnSignup` + seat disponibili.

## Critical Call Chains

### Appointment Cancel
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
