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
- Manual: `setManualPaymentStatus()` — admin override

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
