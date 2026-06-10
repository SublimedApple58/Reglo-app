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

## License categories (B / AM / A1 / A2 / A + transmission)
Second brick of the Vehicles module. Each vehicle serves **one** license category + one transmission; each PRATICA student pursues one license path. The matcher pairs a student only with an instructor whose vehicle serves that exact category **and** transmission — so a moto instructor (moto fixed vehicle) is never matched to a car student, and an A1 student finds no slot unless a suitable 125 is free.

- **Taxonomy**: `lib/autoscuole/license.ts` — `LICENSE_CATEGORIES = ['B','AM','A1','A2','A']`, `TRANSMISSIONS = ['manual','automatic']`, IT labels, and `vehicleServesLicense(vehicle, student)` (exact match on both; null on either side is permissive).
- **Data model**:
  - `AutoscuolaVehicle.licenseCategory String @default("B")` + `transmission String @default("manual")` (NOT NULL — every vehicle is always categorized).
  - `CompanyMember.licenseCategory String?` + `transmission String?` (nullable; the student's pursued path lives here, next to `studentPhase`). Migration `20260609140000_add_license_category` backfills existing students to `B`/`manual`.
  - **Per-autoscuola registration default**: `CompanyService.limits.defaultLicenseCategory` + `defaultTransmission` (managed in `autoscuole-settings.actions.ts`; default `B`/`manual`). New students are created with this default in `student-register` route (moto schools set it once → new students onboard already on the right category). The titolare can still override per-student in the phase dialog.
  - **No instructor field**: eligibility is derived entirely from the vehicle (a fixed moto ⇒ moto-only; no fixed vehicle ⇒ eligible only if a pool vehicle of the right category is free).
- **Matcher**: the shared helper `resolveVehicleForInstructor` gained a `matchesLicenseCategory(vehicleId)` callback, applied to both the fixed-vehicle branch (mismatch ⇒ instructor unavailable for this student) and the pool branch. Built in all 4 sites via `buildMatchesLicenseCategory(activeVehicles, student)` (in `autoscuole-availability.actions.ts`) / inline in `slot-matcher.ts`. The student's `licenseCategory`/`transmission` are read from `CompanyMember` (`ensureStudentMembership` now returns them; slot-matcher loads them directly).
- **Gated on `vehiclesEnabled`**: when the Vehicles module is OFF, none of the category filtering runs (the student path is still stored/displayed, informational only).
- **Actions**: `updateVehicleSchema`/`createVehicleSchema` and `updateStudentPhaseSchema` extended with `licenseCategory`/`transmission`; `getAutoscuolaStudents`, `getAutoscuolaStudentsWithProgress`, `getAutoscuolaStudentDrivingRegister` and `GET /api/autoscuole/me` propagate them.
- **Web UI**: vehicle edit dialog (`AutoscuoleResourcesPage.tsx`) → "Categoria patente" + "Cambio" Selects; `VehiclesTab` card badge **+ "Percorso patente di default" card** (the two registration-default Selects, saved via `updateAutoscuolaSettings`); the **student's** license path is edited via its **own dialog** `EditStudentLicenseDialog` (action `updateStudentLicensePath`) opened from the "Percorso patente · Modifica" row in the student drawer — **decoupled from the phase** (it's known from the theory stage, so it is NOT in `ChangeStudentPhaseDialog`); `AutoscuoleStudentsPage` → badge in the PRATICA row + the editable "Percorso patente" row in the drawer (shown in every phase); `AutoscuoleAgendaPage` booking dialog → vehicle Select shows category·transmission (informational).
- **Swaps** (`lib/actions/autoscuole-swap.actions.ts`) — license-gated (a swap keeps the original instructor+vehicle, so the taker must be license-compatible): `createSwapOffer` filters notification recipients by the offered slot's vehicle; `getSwapOffers` hides incompatible offers; `respondSwapOffer` blocks an incompatible accept; `instructorSwapAppointments` validates both students against the vehicle they'd inherit. All gated on `vehiclesEnabled` + `vehicleServesLicense`.
- **Slot-fill / empty-slot notifications** (`lib/autoscuole/communications.ts`): `freeSlotLicenseKeysTomorrow` (ex `hasFreeSlotTomorrow`) now returns the SET of license keys (`category|transmission`) with a free instructor+vehicle tomorrow; `processEmptySlotNotifications` drops candidates whose pursued license isn't in that set → no "guide disponibili" push for slots the student can't book. Module off → `vehicleKeys=null` = legacy behaviour.
- **Waitlist offers** (`lib/actions/autoscuole-availability.actions.ts`): `broadcastWaitlistOffer` recipients + `getWaitlistOffers` visibility filtered by an OPEN vehicle slot serving the student's license at that time; `respondWaitlistOffer` picks a vehicle slot compatible with the taker's license (was `findFirst` = any vehicle). Gated on `vehiclesEnabled`.
- **Tests**: `tests/unit/autoscuole/fixed-vehicle.test.ts` covers category match/mismatch on fixed + pool.

## Connected features
- `availability.md` (the "follows instructor" rule), booking/slot-matcher, mobile `vehicles` (owner + instructor self-assign, category picker) / `quick-book`.
