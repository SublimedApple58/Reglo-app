# Gestione manuale guide + Cancellazioni tardive + Blocco prenotazioni

## What was done

Implemented a complete manual driving lesson management system for driving schools that don't use automated payments (Stripe) or lesson credits.

### Phase 1 — DB Migration
- Added `bookingBlocked` field to `CompanyMember`
- Added `manualPaymentStatus` and `lateCancellationAction` fields to `AutoscuolaAppointment`
- Migration: `20260327234336_manual_payment_booking_block`

### Phase 2 — Booking Block
- `toggleStudentBookingBlock` action for admin/owner
- Hard block in `ensureStudentCanBookFromApp` (mobile/student flow)
- Hard block for STUDENT/INSTRUCTOR actors in `createAutoscuolaAppointment`
- Soft warning for OWNER/admin actors in `createAutoscuolaAppointment`
- Shared helper `getStudentBookingBlockStatus` exported from availability actions

### Phase 3 — Manual Payment Tracking
- `setManualPaymentStatus` action (validates non-Stripe appointment)
- `getPaymentMode` action (wraps `getAutoscuolaPaymentConfig`)
- Extended `getAutoscuolaStudentDrivingRegister` with:
  - Additional fields per lesson (cancelledAt, cancellationKind, manualPaymentStatus, etc.)
  - `extendedSummary` (booked, completed, cancelled, upcoming, manualUnpaid)
  - `bookingBlocked` flag
- Extended `getAutoscuolaStudentsWithProgress` to include `bookingBlocked`

### Phase 4 — Late Cancellations
- `getLateCancellations` action with raw SQL for performance
- `resolveLateCancellation` action with three code paths:
  - Stripe enabled: sets `charged` + TODO for Stripe charge
  - Credits enabled: re-deducts credit if refunded
  - Manual mode: sets `manualPaymentStatus = "unpaid"`

### Phase 5 — Drawer Updates
- Payment mode fetch on page mount
- Stats section (4 cards) visible only in manual mode
- "Da pagare" counter in stats
- Crediti guida section hidden in manual mode
- Paid/unpaid toggle per lesson in storico (manual mode only)
- Booking block toggle in Anagrafica section
- "Bloccato" badge in students table

### Phase 6 — Late Cancellations Tab
- Sub-tab system (Allievi / Cancellazioni tardive) using `RegloTabs`
- Badge count on tab
- `AutoscuoleLateCancellationsPanel` component with:
  - Card per cancellation with all details
  - Addebita / Non addebitare buttons
  - Optimistic removal after action
  - Empty state

### Phase 7 — Mobile
No mobile changes needed — block is server-side enforced.
