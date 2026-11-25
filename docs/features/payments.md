# Payments & Credits

## What it does
Lesson credit ledger, Stripe payment processing, payment plans, penalties, invoice generation (Fatture-in-Cloud), Stripe Connect for instructor payouts.

> **REG-780 (2026-11-24): niente euro nell'interfaccia, Stripe dismesso.**
> - La vecchia pagina «Pagamenti» (`AutoscuolePaymentsPage`) è stata tolta. `?tab=payments` e `/autoscuole/payments` portano a `?tab=settings&pane=bookings&sub=crediti`.
> - La sotto-scheda «Crediti e annullamenti» ha solo:
>   - l'interruttore dei crediti e quello dei crediti obbligatori;
>   - il **preavviso minimo** (`penaltyCutoffHoursPreset`).
> - Prezzi guida (`lessonPrice30/60`) e penale in percentuale (`penaltyPercentPreset`) non si impostano più dalla UI. I valori restano in `CompanyService.limits` e continuano a riempire gli snapshot `priceAmount`/`penaltyAmount`, che nessuna schermata mostra più come euro:
>   - debito degli ex allievi in guide da pagare;
>   - niente «penale €» nel dialogo di annullamento;
>   - nell'app allievo «Addebitata» senza importo.
> - La percentuale tornerà con i crediti a tempo (piano `plans/product/001-reg-779-guide-vs-tempo.md`, punto 5).

> **REG-783 (2026-11-24): crediti a guide o a tempo (minuti).**
> - L'autoscuola tiene i crediti in una sola unità, `limits.lessonCreditUnit` (`"lessons"` default | `"minutes"`). Non si cambia da `updateAutoscuolaSettings`: solo con `switchLessonCreditUnit` (`lib/actions/autoscuole-credit-unit.actions.ts`), dal dialogo `CreditUnitSwitchDialog` della riga «Un credito vale».
> - Il passaggio è una transazione: blocca impostazioni e saldi (`FOR UPDATE`), confronta l'impronta dei saldi vista in anteprima (se è cambiata rimanda `PREVIEW_CHANGED` con l'anteprima nuova), converte ogni saldo con due movimenti `unit_conversion` (−prima nell'unità vecchia, +dopo nella nuova), scrive `AutoscuolaCreditUnitSwitch`. Verso le guide il resto lo sceglie il titolare (`floor`/`ceil`/`round`).
> - Costo di una guida: 1 a guide, la durata in minuti a tempo (`creditCost`). Si scala solo se il saldo basta tutto (niente pagamenti parziali). La guida salva `creditAmount`/`creditUnit` (null = guida pagata prima di REG-783 = 1 guida).
> - Rimborso (`refundAppointmentCredit`, usato da annullamento, condono tardivo, «Rimuovi dallo storico», scambio): sempre nell'unità di adesso. Stessa unità → quanto aveva consumato; pagata a guide e resa a minuti → la durata al momento del rimborso; pagata a minuti e resa a guide → 1 guida (regole di Tiziano, `lesson-credit-unit.ts`). «Addebita» dopo un condono riscala quanto era stato reso.
> - Cambio di durata di una guida pagata a minuti (`syncAppointmentCreditToDuration`, da spostamento e modifica dettagli): scala o rende la differenza; se il saldo non basta per i minuti in più non scala niente. Road non ricalcola («Prezzo e crediti restano quelli»).
> - Scambio: chi cede riceve come in un annullamento in tempo, chi prende paga il costo pieno; con i crediti obbligatori lo scambio si rifiuta se non gli basta, altrimenti la guida resta da pagare.
> - Ogni movimento ha `unit`; `adjustStudentLessonCredits({ unit })` rifiuta un movimento scritto in un'unità superata (ricarica da un form aperto prima del passaggio).
> - API mobile `/api/mobile/payments/profile`: oltre a `lessonCreditsAvailable` manda `lessonCreditsUnit` e `lessonCreditsLabel` («5 ore e 30»).
> - Casi limite e decisioni: `plans/product/002-reg-783-crediti-minuti.md`.

> **REG-784 (2026-11-24): «Servono crediti per prenotare» blocca davvero.**
> - `checkLessonCredits` (payments.ts): costo pieno della guida (1 o la durata) contro il saldo nell'unità corrente. Gli esami non usano crediti.
> - Allievo: `LESSON_CREDITS_REQUIRED` con `lessonCreditsData` (titolo corto «Crediti finiti» / «Mancano 30 minuti») da `createBookingRequest`, `respondWaitlistOffer`, `respondSwapOffer` (anche se la guida ceduta non era a credito) e `createAutoscuolaAppointment` con l'allievo come attore. `getBookingOptions` manda `lessonCredits { insufficient, title, … }` per la card dell'app.
> - Staff: `LESSON_CREDITS_CONFIRM` con `title` («Vittoria non ha crediti») finché non manda `confirmLessonCredits` (singola, multipla con il costo sommato, route `instructor-bookings/confirm*`). Road «Avvia guida» passa sempre la conferma.
> - Senza credito la guida nasce `manualPaymentStatus: "unpaid"` anche coi crediti obbligatori, e quando è fatta conta nel debito (`isLessonUnpaid`, solo guide singole: gruppi ed esami esclusi; gemello mobile `lessonPayments.ts`).
> - Assistente vocale: stessa regola, messaggio da leggere a voce; ora consuma anche il credito (`createVoiceAppointment`, in transazione).
> - Prenotazione multipla: uno snapshot per guida (prima uno solo copiato su tutte).
> - Web: `LessonCreditsConfirmDialog` (salvadanaio ambra `public/images/3d/salvadanaio-ambra.png`); l'agenda accumula le conferme (limite, pausa, crediti).

## Key files
- `lib/autoscuole/payments.ts` — 68 exported functions (88KB), core payment logic
- `lib/autoscuole/stripe-connect.ts` — instructor payout accounts
- `lib/autoscuole/receipt.tsx` — PDF receipt generation via @react-pdf/renderer
- `lib/integrations/fatture-in-cloud.ts` — Italian invoicing integration
- `components/pages/Autoscuole/PaymentsSettingsPane.tsx` — sotto-scheda «Crediti e annullamenti» (Impostazioni → Prenotazioni e allievi), con «Un credito vale»
- `components/pages/Autoscuole/settings/CreditUnitSwitchDialog.tsx` — dialogo di passaggio guide ↔ ore (REG-783; testi e UI rifatti in REG-788: una frase su cosa cambia da ora, domande con scelte pronte (45 min / 1 ora / 1 ora e mezza / Altro in minuti) e arrotondamento spiegato con esempi (`remainderPolicyExamples`) solo se qualche allievo ha crediti, esempio vero dei primi 3 saldi + «e altri N allievi»)
- `lib/autoscuole/lesson-credit-unit.ts` — funzioni pure: costo, rimborso, conversione, testi (REG-783)
- `lib/actions/autoscuole-credit-unit.actions.ts` — anteprima e passaggio di unità (REG-783)

## Key functions
- Credits: `adjustStudentLessonCredits()`, `refundLessonCreditIfEligible()`, `getStudentLessonCredits()`, `applyLessonCreditToExistingAppointment()`
- Snapshot: `prepareAppointmentPaymentSnapshot()` — frozen payment state at booking
- Settlement: `processAutoscuolaLessonSettlement()` — charge completed lessons
- Retries: `processAutoscuolaPaymentRetries()` — 3 attempts, 4h/8h exponential backoff
- Penalties: `processAutoscuolaPenaltyCharges()` — late cancellation fees
- Invoicing: `processAutoscuolaInvoiceFinalization()` — push to Fatture-in-Cloud
- Mobile: `getMobileStudentPaymentProfile()`, `getMobileStudentPaymentHistory()`, `preparePayNow()`, `finalizePayNow()`
- Stripe methods: `createStudentSetupIntent()`, `confirmStudentPaymentMethod()`, `removeStudentPaymentMethod()`
- Manual: `setManualPaymentStatus()` — segna una guida pagata / da pagare

## Tracciamento pagamento manuale (staff)

`setManualPaymentStatus({ appointmentId, status })` scrive `manualPaymentStatus`
(`"paid" | "unpaid" | null`) e rifiuta le guide a pagamento **automatico**
(`paymentRequired && manualPaymentStatus == null` → si saldano dalla sezione
Pagamenti). Consumata da due superfici:

- **Web** — dettaglio allievo (`AutoscuoleStudentsPage`, tab "Guide"), server action diretta.
- **Mobile (REG-450)** — `PATCH /api/autoscuole/appointments/[id]/manual-payment`,
  wrapper sottile sulla stessa azione: permessi e guardie stanno tutti
  nell'azione, così la regola non diverge tra le due.

**Permessi**: `canManageLessonPayments` (`lib/autoscuole/lesson-payments.ts`,
modulo puro + unit test) = admin ∨ OWNER ∨ INSTRUCTOR_OWNER ∨ INSTRUCTOR —
permesso **scoped**, più largo di `canManageStudentCredits` (admin ∨ OWNER) che
governa i crediti (`adjustStudentLessonCredits`,
`coverAppointmentWithLessonCredit`). Un istruttore segna una guida pagata ma non
tocca il ledger crediti.

Chi può segnare, segna **qualsiasi** guida dell'allievo, non solo le proprie: la
firma del permesso non riceve nemmeno l'appuntamento. Fino al 18/09/2026
l'istruttore era ristretto alle sue guide, per simmetria con
`updateAutoscuolaAppointmentDetails`; la simmetria era sbagliata — quella governa
il contenuto **didattico** della guida, questa un fatto **amministrativo**
dell'allievo, e chi incassa in autoscuola spesso non è l'istruttore che quella
guida l'ha tenuta. `tests/unit/autoscuole/lesson-payments.test.ts` esiste perché
la restrizione non rientri per distrazione.

### Storico pagamento — chi e quando (REG-637)

Ogni gesto manuale lascia una riga in `AutoscuolaAppointmentPaymentEvent`
(`fromStatus`, `toStatus`, `actorUserId`, `createdAt`), scritta da
`setManualPaymentStatus` **nella stessa transazione** dell'update e solo se lo
stato cambia davvero (un doppio tocco non sporca lo storico). La risposta porta
`paymentEvent` (l'evento appena scritto), così web e app aggiornano la riga
senza rileggere.

`loadPaymentHistories(companyId, appointmentIds)` (`lib/autoscuole/payment-history.ts`)
fonde due fonti, dal più recente: gli eventi manuali e il **ledger crediti**
(`delta < 0` = «Coperta da credito», `> 0` = «Credito restituito») — le guide
coperte da credito hanno storico anche da prima di REG-637. I cambi automatici
(nascita "da pagare", penale tardiva, annullo) **non** sono registrati: non
sono gesti di nessuno. Guide segnate a mano prima di REG-637 → storico vuoto,
la UI mostra solo l'etichetta (niente "data non disponibile").

Dove arriva (`paymentHistory: PaymentHistoryEvent[]` su ogni guida), **solo allo staff**:
- `getAutoscuolaStudentDrivingRegister` → tab Guide del dettaglio allievo web;
- `getFormerStudentDetail` → scheda Ex allievi (REG-629);
- `getAutoscuolaAppointmentsFiltered` ramo FULL **con `studentId`** → schermata
  Pagamenti dell'app. Mai all'allievo, mai sull'agenda.

UI web: `LessonPaymentTrail` — riga «Segnata pagata · 12 ott, 18:40 · Mario
Rossi» sotto le etichette, mostrata solo se l'ultimo evento racconta ancora lo
stato attuale (`lastEventMatchesState`); con ≥ 2 eventi, «Storico N» apre un
popover con la timeline (`z-[210]`, sopra il DetailPanel). Copia gemella in
`reglo-mobile/src/utils/paymentHistory.ts`. E2e: `tests/e2e/reg637-storico-pagamento.auth.spec.ts`
(seed `scripts/seed-reg637.ts`).

**Regola gemella**: `isLessonUnpaid` / `isCompanyManualMode`
(`lib/autoscuole/unpaid-auto-block.ts`) sono duplicate client-side in
`reglo-mobile/src/utils/lessonPayments.ts`. Vanno cambiate **insieme**: la stessa
definizione alimenta il badge web, il contatore `manualUnpaid` della lista
allievi e il blocco automatico delle prenotazioni per debito.

## Credit ledger reasons
`booking_consume`, `cancel_refund`, `swap_refund`, `swap_consume`, `manual_grant`, `manual_revoke`, `unit_conversion` e `duration_change` (REG-783). Ogni movimento ha la sua `unit`.

## DB models
- `AutoscuolaAppointmentPayment` — Stripe intent/charge, retry count, status
- `AutoscuolaStudentPaymentProfile` — Stripe customer + payment methods
- `AutoscuolaStudentLessonCreditBalance` — current balance per student
- `AutoscuolaStudentLessonCreditLedger` — immutable audit trail (reason, actor, amount, `unit`)
- `AutoscuolaCreditUnitSwitch` — ogni passaggio di unità (REG-783)
- `AutoscuolaPaymentPlan`, `AutoscuolaPaymentInstallment` — installment plans

## Connected features
- **Appointments** — cancel refunds, confirm consumes, settlement charges
- **Swaps** — `refundAppointmentCredit(swap_refund)` + `consumeLessonCreditIfAvailable(swap_consume)` (REG-783)
- **Holidays** — bulk cancel refunds via `refundLessonCreditIfEligible()`
- **Communications** — background jobs call settlement, retry, penalty, invoice
- **Cache** — invalidates PAYMENTS + FIC segments
