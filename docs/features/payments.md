# Payments & Credits

## What it does
Lesson credit ledger, Stripe payment processing, payment plans, penalties, invoice generation (Fatture-in-Cloud), Stripe Connect for instructor payouts.

## Key files
- `lib/autoscuole/payments.ts` — 68 exported functions (88KB), core payment logic
- `lib/autoscuole/stripe-connect.ts` — instructor payout accounts
- `lib/autoscuole/receipt.tsx` — PDF receipt generation via @react-pdf/renderer
- `lib/integrations/fatture-in-cloud.ts` — Italian invoicing integration
- `components/pages/Autoscuole/AutoscuolePaymentsPage.tsx` — web payment dashboard (55KB)

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

**Regola gemella**: `isLessonUnpaid` / `isCompanyManualMode`
(`lib/autoscuole/unpaid-auto-block.ts`) sono duplicate client-side in
`reglo-mobile/src/utils/lessonPayments.ts`. Vanno cambiate **insieme**: la stessa
definizione alimenta il badge web, il contatore `manualUnpaid` della lista
allievi e il blocco automatico delle prenotazioni per debito.

## Credit ledger reasons
`grant`, `consume`, `refund`, `swap_refund`, `swap_consume`, `manual_grant`, `manual_revoke`

## DB models
- `AutoscuolaAppointmentPayment` — Stripe intent/charge, retry count, status
- `AutoscuolaStudentPaymentProfile` — Stripe customer + payment methods
- `AutoscuolaStudentLessonCreditBalance` — current balance per student
- `AutoscuolaStudentLessonCreditLedger` — immutable audit trail (reason, actor, amount)
- `AutoscuolaPaymentPlan`, `AutoscuolaPaymentInstallment` — installment plans

## Connected features
- **Appointments** — cancel refunds, confirm consumes, settlement charges
- **Swaps** — `adjustStudentLessonCredits(swap_consume/swap_refund)`
- **Holidays** — bulk cancel refunds via `refundLessonCreditIfEligible()`
- **Communications** — background jobs call settlement, retry, penalty, invoice
- **Cache** — invalidates PAYMENTS + FIC segments
