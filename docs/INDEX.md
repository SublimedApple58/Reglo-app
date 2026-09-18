# Feature Index — Reglo (Web + Backend)

> 🧪 **Lavori su staging?** → [STAGING.md](STAGING.md) — account di test, comandi (`ship:staging`, `migrate:staging`, seed), accesso, mobile, setup dev.

## Features

| Feature | Doc | Primary files |
|---------|-----|--------------|
| Appointments (incl. cancellazioni: dialogo unico "Annulla guida" `manual_cancel` / "Rimuovi dallo storico" `record_cleanup`) | [appointments.md](features/appointments.md) | `autoscuole.actions.ts` (`annulAutoscuolaAppointment`, `hardCleanupAutoscuolaAppointment`, `coverAppointmentWithLessonCredit`), `lib/autoscuole/operational-cancellation.ts` (`annulFutureAppointment`, `removeAppointmentFromRecord`), `CancelAppointmentDialog.tsx`, `AutoscuoleStudentsPage.tsx`, `AutoscuoleAgendaPage.tsx` |
| Never-accessed nudge (allievo mai loggato) | [never-accessed-nudge.md](features/never-accessed-nudge.md) | `autoscuole.actions.ts` (`buildNeverAccessedUserIds`), `NeverAccessedNudge.tsx`, `AutoscuoleAgendaPage.tsx`, `AutoscuoleStudentsPage.tsx` |
| Owner notifications (bell annullamenti allievi) | [owner-notifications.md](features/owner-notifications.md) | `AutoscuolaNotification` model, `lib/autoscuole/notifications.ts`, `api/autoscuole/owner-notifications/route.ts`, `OwnerNotificationsBell.tsx`, `autoscuole.actions.ts` (`createStudentCancellationNotification`) |
| Availability | [availability.md](features/availability.md) | `autoscuole-availability.actions.ts` |
| Booking Engine | [booking-engine.md](features/booking-engine.md) | `slot-matcher.ts`, `booking-governance.ts` |
| Vehicles | [vehicles.md](features/vehicles.md) | `autoscuole.actions.ts` (vehicle CRUD), `fixed-vehicle.ts`, `slot-matcher.ts` |
| Group lessons | [group-lessons.md](features/group-lessons.md) | `autoscuole.actions.ts` (group-lesson CRUD), `autoscuole-availability.actions.ts` (invites), `group-lessons/` API |
| Payments & Credits | [payments.md](features/payments.md) | `payments.ts`, `stripe-connect.ts` |
| Swaps | [swaps.md](features/swaps.md) | `autoscuole-swap.actions.ts` |
| Holidays | [holidays.md](features/holidays.md) | `autoscuole-holidays.actions.ts` |
| Locations (Sede e luoghi) | [locations.md](features/locations.md) | `api/autoscuole/locations/*`, `locations/LocationsSection.tsx`, `locations/LocationFormDialog.tsx` |
| Notifications | [notifications.md](features/notifications.md) | `push.ts`, `notifications/route.ts` |
| Instructor Absences (Malattia / Ferie) | [instructor-absences.md](features/instructor-absences.md) | `instructor-sick-leave/route.ts`, `instructor-vacation/route.ts`, `InstructorsTab.tsx` (`MalattiaTab`/`FerieTab`), `operational-cancellation.ts` |
| Stampa agenda (anteprima PDF vista corrente) | [agenda-print.md](features/agenda-print.md) | `AgendaPrintDialog.tsx`, `AutoscuoleAgendaPage.tsx` (toolbar `Printer` + `agendaPrintData`), `instructor-colors.ts` |
| Lezione teorica (agenda) | [lezione-teorica.md](features/lezione-teorica.md) | `AutoscuoleAgendaPage.tsx` (`blockKind`, `blockTint`/`formatBlockReason`), `autoscuole.actions.ts` (`createInstructorBlock` con `reason:"theory_lesson"`) |
| Tipo guida moto (birilli/strada) | [moto-lesson-type.md](features/moto-lesson-type.md) | `lib/autoscuole/moto-lesson-type.ts`, `autoscuole.actions.ts` (`AutoscuolaAppointment.motoLessonType` + `AutoscuolaGroupLesson.motoLessonType` in create/update + bootstrap select), `AutoscuoleAgendaPage.tsx` (selettore create + badge blocco, individuali e gruppi moto), `EditAppointmentDialog.tsx` (modifica singola), `dialogs/GroupLessonCreateDialog.tsx` + `dialogs/GroupLessonManageDialog.tsx` (gruppi moto, REG-406) |
| Instructor Clusters | [instructor-clusters.md](features/instructor-clusters.md) | `instructor-clusters.ts`, `autoscuole-settings.actions.ts` |
| Card QR istruttore → associazione allievo (REG-451) | [instructor-qr-link.md](features/instructor-qr-link.md) | `lib/autoscuole/instructor-link.ts`, `api/autoscuole/me/instructor-link`, `app/[locale]/i/[code]`, `instructor-qr/*`, `InstructorsTab.tsx` (scheda Codice) |
| Instructor Hours (report "Ore guida": ore svolte + ore disponibili/occupate REG-444 + export CSV) | [instructor-hours.md](features/instructor-hours.md) | `autoscuole.actions.ts` (`getInstructorDrivingHours`, `getInstructorDrivingHoursRange`), `instructor-hours/route.ts`, `lib/autoscuole/agenda-occupancy.ts`, `AutoscuoleOreGuidaPage.tsx`, `ore-guida-export.ts` |
| Instructor Colors | [instructor-colors.md](features/instructor-colors.md) | `lib/autoscuole/instructor-colors.ts`, `color-swatch-picker.tsx`, `AspettoSettingsPane.tsx`, `AutoscuoleAgendaPage.tsx` |
| Aspetto (pannello Impostazioni: criterio colore agenda durata/patente + colori istruttori + ordine colonne istruttore) | [appearance-settings.md](features/appearance-settings.md) | `AspettoSettingsPane.tsx`, `lib/autoscuole/agenda-color-criterion.ts` (`LICENSE_COLOR_ENTRIES`), `lib/autoscuole/agenda-instructor-order.ts` (`agendaInstructorOrder`, REG-449), `autoscuole-settings.actions.ts` (`agendaColorCriterion`), `AutoscuoleAgendaPage.tsx` (`licenseColorEntryForTag`, legenda dinamica) |
| Communications | [communications.md](features/communications.md) | `communications.ts`, `whatsapp.ts` |
| Cases & Deadlines | [cases-deadlines.md](features/cases-deadlines.md) | `autoscuole.actions.ts` |
| Repositioning **(retired)** | [repositioning.md](features/repositioning.md) | `repositioning.ts` |
| Penalties | [penalties.md](features/penalties.md) | `payments.ts`, `communications.ts` |
| Voice AI | [voice-ai.md](features/voice-ai.md) | `voice.ts`, `voice-webhook.ts` |
| Solo Segretaria (secretary-only) | [secretary-only.md](features/secretary-only.md) | `lib/services.ts` (`secretaryOnly`, `isSecretaryOnly`), `AutoscuoleNav.tsx`, `AutoscuoleTabsPage.tsx`, `AutoscuoleResourcesPage.tsx`, `AutoscuoleShell.tsx`, `BackofficeCompaniesPage.tsx` |
| Account Consorzio (autoscuole consorziate, prezzi, fatturazione, richieste guida) | [consorzio.md](features/consorzio.md) | `lib/services.ts` (`accountKind`, `isConsortium`), `lib/service-access.ts` (`requireConsortium`), `lib/actions/consorzio.actions.ts`, `components/pages/Consorzio/*`, `AutoscuoleAgendaPage.tsx` (ghost richiesta), `OwnerNotificationsBell.tsx` (click-through), modelli `Consorzio*` |
| Quiz Teoria | [quiz-theory.md](features/quiz-theory.md) | `autoscuole-quiz.actions.ts`, `quiz-engine.ts` |
| Situazione quiz nel dettaglio allievo (tab "Quiz", REG-445/446) | [student-quiz-detail.md](features/student-quiz-detail.md) | `autoscuole-quiz.actions.ts` (`getQuizStudentDetailForStaff`), `StudentQuizPanel.tsx`, `AutoscuoleStudentsPage.tsx` (`drawerTabs`, `loadQuizDetail`) |
| Password Reset (mobile) | [password-reset.md](features/password-reset.md) | `lib/auth/password-reset.ts`, `lib/mobile-auth-payload.ts`, `app/api/mobile/auth/password-reset/*` |
| Login web (`/[locale]/sign-in`, design allineato al sito marketing) | [login-web.md](features/login-web.md) | `app/[locale]/(signin)/sign-in/{page,credentials-signin-form,review-panel,marketing-links}`, `public/images/auth/*`, `user.actions.ts` (`signInWithCredentials`) |
| Student Phase + Quiz Seats | [student-phase.md](features/student-phase.md) | `autoscuole.actions.ts` (`updateStudentPhase`), `autoscuole-settings.actions.ts` (`grantQuizSeat`, `setAutoAssignQuizOnSignup`, `getQuizSeatsContext`), `backoffice.actions.ts` (`getQuizSeatsUsage`, `deactivateTeoriaWithResolution`), `theory-reminders.ts` |
| Percorso patente — auto-selezione self-registered (REG-410) | [license-path-selfselect.md](features/license-path-selfselect.md) | `CompanyMember.selfRegistered` (+ migration), `lib/autoscuole/license.ts` (`STUDENT_LICENSE_CATEGORIES`), `app/api/mobile/auth/student-register/route.ts` (marca self + no seed), `app/api/autoscuole/me/route.ts` (`needsLicensePath`), `app/api/autoscuole/me/license-path/route.ts` (PATCH self-scoped) |
| Pronto per l'esame (exam-ready flag) | [exam-ready.md](features/exam-ready.md) | `autoscuole.actions.ts` (`setStudentExamReady`), `api/autoscuole/students/[id]/exam-ready`, `AutoscuoleStudentsPage.tsx`, `AutoscuoleAgendaPage.tsx` |
| Auto-block prenotazioni per debito allievo (web-only, tab Limiti) | [auto-booking-block-debt.md](features/auto-booking-block-debt.md) | `lib/autoscuole/unpaid-auto-block.ts` (`resolveUnpaidAutoBlock`/`reconcileUnpaidAutoBlock`), `CompanyMember.bookingBlockReason`/`unpaidBlockClearedAtCount`, `autoscuole-settings.actions.ts`, `autoscuole.actions.ts` (`toggleStudentBookingBlock`, `getAutoscuolaStudentsWithProgress`), `autoscuole-availability.actions.ts` (guard), `tabs/BookingsTab.tsx` |
| Pagellino di valutazione (REG-443) | [evaluation-sheet.md](features/evaluation-sheet.md) | `lib/autoscuole/evaluation-sheet.ts`, `lib/actions/autoscuole-evaluation.actions.ts`, `EvaluationSheetPane.tsx`, `api/autoscuole/appointments/[id]/evaluation`, `updateAutoscuolaAppointmentDetails` (campo `evaluations`), modelli `AutoscuolaEvaluationItem` / `AutoscuolaAppointmentEvaluation` |
| Users Directory (delete/anonimizzazione, riuso email, inviti) | [users-directory.md](features/users-directory.md) | `user.actions.ts`, `invite.actions.ts`, `account-deletion.ts` |
| Reglo Aula | [reglo-aula.md](features/reglo-aula.md) | `aula.actions.ts`, `lib/aula/{slides,package-store,live-state}.ts`, `app/aula-live/[code]/`, `app/[locale]/aula/` |
| Support Center + Feedback | [support-center.md](features/support-center.md) | `support.actions.ts`, `AutoscuoleAssistenzaPage.tsx`, `FeedbackDialog.tsx`, `Backoffice{Support,Feedback}Page.tsx` |
| Novità (annuncio "Richieste agenda in pausa" + changelog menu: pagellino, foto/firme, veicoli, istruttori) | [news-announcement.md](features/news-announcement.md) | `Layout/news/{AgendaPauseNewsDialog,RegloClips}.tsx`, `AutoscuoleShell.tsx`, `NovitaDialog.tsx`, `support.actions.ts` (`submitNewsFeedback`), `NewsFeedback` |
| Company Documents (contratto/fatture) | [company-documents.md](features/company-documents.md) | `company-documents.actions.ts`, `api/backoffice/company-documents`, `BackofficeCompanyDocumentsDialog.tsx`, `AutoscuoleAreaPersonalePage.tsx` |
| Foto profilo + Firma allievo (export Portale automobilista) | [student-photo-signature.md](features/student-photo-signature.md) | `lib/portal-image-specs.ts`, `lib/images/portal.ts`, `api/mobile/profile/photo\|signature`, `api/students/[studentUserId]/media/[kind]`, `student-media.actions.ts`, `StudentMediaSection.tsx` |
| Login as admin (impersonazione autoscuola dal backoffice) | [admin-impersonation.md](features/admin-impersonation.md) | `impersonation-grant.ts`, `auth.ts` (provider `impersonation`), `company-context.ts`, `backoffice.actions.ts` (`impersonateCompany`), `BackofficeCompaniesPage.tsx` |
| Backoffice — KPI (sezione metriche con filtro periodo, grafici, export CSV) | [backoffice-kpi.md](features/backoffice-kpi.md) | `lib/backoffice/kpi-math.ts`, `lib/actions/backoffice-kpi.actions.ts` (`getBackofficeKpis`), `app/[locale]/backoffice/kpi/page.tsx`, `BackofficeKpiPage.tsx` + `kpi/` (recharts), `BackofficeHeader.tsx` |
| Pagina investor pubblica a link ("Reglo in numeri", token + noindex) | [investor-kpi.md](features/investor-kpi.md) | `InvestorKpiLink`, `lib/investor/investor-shape.ts` (proiezione pura testata), `lib/investor/investor-kpi.ts`, `lib/actions/investor-links.actions.ts`, `app/[locale]/investor/[token]/page.tsx`, `components/pages/Investor/*`, `InvestorLinksPanel.tsx`, `middleware.ts` |
| Company Plan (abbonamento) | [company-plan.md](features/company-plan.md) | `company-plan.actions.ts`, `BackofficeCompanyPlanDialog.tsx`, `AutoscuoleAreaPersonalePage.tsx` |

## Design System

| Doc | Scope |
|-----|-------|
| [design-system.md](design-system.md) | CSS variables, Tailwind tokens, shadows, typography, component catalog, mobile↔web mapping |

## Architecture

| Topic | Doc |
|-------|-----|
| Server Actions pattern | [actions.md](architecture/actions.md) |
| Database & Schema | [database.md](architecture/database.md) |
| Cache system | [cache.md](architecture/cache.md) |
| Background Jobs | [background-jobs.md](architecture/background-jobs.md) |
| Auth & RBAC | [auth.md](architecture/auth.md) |
| Environments (dev/staging/prod) + `APP_ENV` send kill-switch | [environments.md](architecture/environments.md) |
| **Git flow & ambienti** (branch, `ship:staging`, rilascio prod) | [git-flow.md](architecture/git-flow.md) |
| API Routes | [api-routes.md](architecture/api-routes.md) |
| **Performance Playbook** — diagnose & fix slow screens (DB indexing, Redis cache, call schema/batching, per-request overhead, mobile skeletons, TanStack Query, dev-mode) | [performance-playbook.md](architecture/performance-playbook.md) |
