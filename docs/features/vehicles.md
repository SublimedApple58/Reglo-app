# Vehicles (Veicoli) — backend & web

## What it does
Company-level vehicles that, when the **vehicles module** is on (`limits.vehiclesEnabled`), participate in slot matching exactly like instructors: they constrain bookable slots, get auto-assigned to bookings, and block double-booking. A vehicle can optionally be set as the **fixed vehicle of one instructor** (1:1): bookings made with that instructor automatically use it.

## Data model (`prisma/schema.prisma`)
- `AutoscuolaVehicle`: `id, companyId, name, plate?, status("active"|"inactive")`, plus fixed-vehicle fields:
  - `assignedInstructorId String?` — FK → `AutoscuolaInstructor` (`@relation("InstructorFixedVehicle")`, `onDelete: SetNull`). `@@unique([assignedInstructorId])` enforces **1:1** (an instructor has at most one fixed vehicle; multiple NULLs allowed). Inverse: `AutoscuolaInstructor.fixedVehicle`.
  - `followsInstructorAvailability Boolean @default(true)` — when true the vehicle is available whenever its instructor is (its own weekly availability is ignored); when false the vehicle's own availability is intersected.
- `AutoscuolaAppointment.vehicleId String?` (nullable; non-null in practice when the module is on).
- Availability: one shared model `AutoscuolaWeeklyAvailability` (`ownerType:"vehicle"`) + `AutoscuolaDailyAvailabilityOverride`. ⚠️ The action `createAvailabilitySlots` (misleading name) **upserts WeeklyAvailability**, it does not create discrete slots.
- Migration: `20260609120000_add_vehicle_fixed_instructor`.

## Fixed-vehicle logic (shared helper)
`lib/autoscuole/fixed-vehicle.ts` (pure, unit-tested in `tests/unit/autoscuole/fixed-vehicle.test.ts`):
- `buildFixedVehicleMaps(vehicles)` → `{ fixedByInstructor, reservedVehicleIds }`.
- `resolveVehicleForInstructor({...})` — if the instructor has a fixed vehicle: force it (skip its availability check when `followsInstructorAvailability`, **always** check overlap); otherwise best-fit from the pool **excluding reserved vehicles**.
- `pickBestInstructorVehiclePair({...})` — instructor & vehicle are chosen as a **pair** (a fixed vehicle is bound to its instructor), not independently.

This helper is applied at **all matcher sites** — keep them in sync:
- `lib/autoscuole/slot-matcher.ts` (`findBestAutoscuolaSlot`)
- `lib/actions/autoscuole-availability.actions.ts`: `createBookingRequest`, `getAllAvailableSlots`, `getDateAvailabilityMap`
Each loads vehicles with `select { id, assignedInstructorId, followsInstructorAvailability }` and builds the maps once.

## Server actions (`lib/actions/autoscuole.actions.ts`)
- `getAutoscuolaVehicles()` / `listAutoscuolaVehiclesReadOnly()` — return the full rows (new fields flow automatically into `getAgendaData().vehicles`).
- `createAutoscuolaVehicle({name, plate?})`.
- `updateAutoscuolaVehicle({vehicleId, name?, plate?, status?, assignedInstructorId?, followsInstructorAvailability?})`:
  - Role guard: OWNER/admin can assign any instructor; a plain INSTRUCTOR may only assign **to their own** instructor profile / edit their own fixed vehicle.
  - 1:1 is a single "fixed vehicle" slot per instructor: assigning a vehicle to an instructor who already has one **auto-reassigns** (releases the previous vehicle in a transaction) instead of erroring. `@@unique` is the DB safety net.
  - Deactivating a vehicle (`status:"inactive"`) clears `assignedInstructorId` and operationally cancels its future appointments.
- `deactivateAutoscuolaVehicle(id)` — same clear-on-deactivate.
- `updateAutoscuolaInstructor` — when an instructor becomes inactive, its fixed vehicle is released (`assignedInstructorId = null`).
- Reserved vehicles stay **manually selectable** (quick-book / web agenda) for anyone; double-booking is still blocked by `validateAppointmentOverlap`.

## API routes (`app/api/autoscuole/`)
- `vehicles/route.ts` (GET/POST), `vehicles/[id]/route.ts` (PATCH spreads payload → new fields pass through; DELETE = deactivate). Mobile manages assignment entirely through `updateVehicle` (owner picker / instructor self-toggle), both in the Veicoli section.

## Web UI
- `components/pages/Autoscuole/AutoscuoleResourcesPage.tsx` — the **vehicle edit dialog** is the canonical assignment surface: an "Istruttore assegnato" `Select` (instructors reserved to others are disabled, "· su <vehicle>") + an InlineToggle "Disponibilità: segue l'istruttore / usa orari propri". `VehicleDetail` carries the two new fields; `handleSaveEditVehicle` sends them.
- `tabs/VehiclesTab.tsx` / `tabs/InstructorsTab.tsx` — list cards (assignment done from the edit dialog).

## Behaviour notes
- Assignment changes are **not retroactive** — only new bookings use the new rule; existing appointments keep their `vehicleId`.
- No `trigger:deploy` is required by this feature.

## Connected features
- `availability.md` (the "follows instructor" rule), booking/slot-matcher, mobile `vehicles` (owner + instructor self-assign) / `quick-book`.
