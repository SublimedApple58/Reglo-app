# Vehicles (Veicoli) — backend & web

## What it does
Company-level vehicles that, when the **vehicles module** is on (`limits.vehiclesEnabled`), participate in slot matching exactly like instructors: they constrain bookable slots, get auto-assigned to bookings, and block double-booking.

Since the **2026-06-23 redesign** the instructor↔vehicle relation is **many-to-many** with three usage modes, and a lesson may reserve **more than one vehicle** (moto + follow car). See [[project_vehicles_redesign]].

## Usage model (the three modes)
"Who can use vehicle V", 3-level precedence:
1. **Exclusive** — V reserved to one instructor (`assignedInstructorId`), hidden from everyone else. An instructor may own **several** exclusive vehicles (e.g. their car + their moto).
2. **Pool** — V has an explicit `AutoscuolaVehiclePoolMember` list → only those instructors.
3. **Open** — no exclusive owner and no pool rows → **all** instructors (the default, = pre-redesign behaviour for unassigned vehicles).

Vehicle resolution is **per license category**: if an instructor owns an exclusive vehicle that serves the student's category it is **forced** (no pool dilution — bit-for-bit the old "fixed vehicle" behaviour); otherwise the instructor draws from pool/open vehicles of that category (the "Mario usually does cars, occasionally moto" case).

## Data model (`prisma/schema.prisma`)
- `AutoscuolaVehicle`: `id, companyId, name, plate?, status("active"|"inactive"|"maintenance")`, plus:
  - `assignedInstructorId String?` — the **exclusive owner** (FK → `AutoscuolaInstructor`, `@relation("InstructorExclusiveVehicles")`, `onDelete: SetNull`). **No `@@unique`** anymore (an instructor may own several). Inverse: `AutoscuolaInstructor.exclusiveVehicles`.
  - `followsInstructorAvailability Boolean @default(true)` — only meaningful for an exclusive vehicle (it follows its owner); pool/open vehicles always use their own availability.
- `AutoscuolaVehiclePoolMember (vehicleId, instructorId)` — N:N shared pool. Empty + no exclusive owner = open.
- `AutoscuolaInstructorPreferredVehicle (instructorId, licenseCategory, vehicleId)` — optional tie-break when several compatible vehicles are free.
- `AutoscuolaAppointmentVehicle (appointmentId, vehicleId, role "primary"|"follow")` — multi-vehicle lessons. `AutoscuolaAppointment.vehicleId` is the **representative primary** (source of truth for existing reads). A moto guida may occupy **more than one moto**: extra motos are stored as additional `role="primary"` rows (ridden vehicles, distinguished from the representative only by id). `role="follow"` is the follow car (a category-B car).
- `CompanyService.limits.followCarMotoEnabled` — **single global toggle** for "auto al seguito": when on, EVERY moto guida (any category AM/A1/A2/A) additionally reserves a follow car. Back-compat: the legacy per-category map `followCarRules` is still read — `readFollowCarMotoEnabled` returns true if any moto category was enabled — and `parseFollowCarRulesFromLimits` now DERIVES the per-category map from the global flag (all-moto-on / off), so every existing call site keeps working.
- Migrations: `20260609120000_add_vehicle_fixed_instructor`, `20260609140000_add_license_category`, `20260623142838_vehicles_m2m_pool_followcar` (drops the unique, adds the 3 tables; non-destructive, backward-compatible by no-op).

## Vehicle resolution (shared helper)
`lib/autoscuole/vehicle-resolution.ts` (pure, unit-tested in `tests/unit/autoscuole/vehicle-resolution.test.ts` — 16 cases incl. backward compat) — **replaces** the old `fixed-vehicle.ts`:
- `buildVehicleResolutionMaps({vehicles, poolMembers, preferred})` → exclusive/pool/preferred maps.
- `resolveVehiclesForInstructor({...})` → `{ primary, follow? }`. Per-category exclusive-forced/pool-fallback; preferred tie-break then packing score; resolves a second category-B vehicle when `requireFollowCar`.
- `pickBestInstructorVehicleSet({...})` → `{ instructorId, vehicleId, followVehicleId, score }`.
- `lib/autoscuole/follow-car.ts` — `parseFollowCarRulesFromLimits`, `readFollowCarMotoEnabled`, `followCarRulesForEnabled`, `requiresFollowCar`, `isFollowCarVehicle`, `FOLLOW_CAR_CATEGORY="B"`, `FOLLOW_CAR_LIMITS_KEY`.
- `lib/autoscuole/appointment-vehicles.ts` — `reconcileAppointmentVehicles(tx, apptId, primary, follow, extraMotoIds?)` and `buildAppointmentVehicleRows({primaryVehicleId, extraMotoVehicleIds?, followVehicleId?})` (create-path rows). Both order primary → extra motos (role primary) → follow, de-duped by id.

Applied at **all matcher sites** (keep in sync) — each also loads pool members + preferred + followCarRules, and busy-interval builders read both `vehicleId` AND the `AutoscuolaAppointmentVehicle` join:
- `lib/autoscuole/slot-matcher.ts` (`findBestAutoscuolaSlot`)
- `lib/actions/autoscuole-availability.actions.ts`: `createBookingRequest` (writes primary+follow join rows + both vehicle slots), `getAllAvailableSlots`, `getDateAvailabilityMap`
- Conflict-check in `createAutoscuolaAppointment` / batch (`autoscuole.actions.ts`): the OR covers primary + follow and queries the join (catches a car used as a follow car elsewhere).

Vehicle queries use `status: "active"` → **maintenance** vehicles are excluded from matching like inactive (but keep their assignment and do NOT cancel appointments).

## Server actions (`lib/actions/autoscuole.actions.ts`)
- `getAutoscuolaVehicles()` — flattens pool membership into `poolInstructorIds` for the client.
- `createAutoscuolaVehicle({name, plate?, assignedInstructorId?, poolInstructorIds?, ...})`.
- `updateAutoscuolaVehicle({vehicleId, ..., assignedInstructorId?, poolInstructorIds?, status?})`:
  - No more 1:1 auto-reassign. `poolInstructorIds` diffs the pool in a transaction (owner-only; a plain INSTRUCTOR manages only their own exclusivity).
  - `status:"inactive"` clears the exclusive owner + cancels future appointments; `status:"maintenance"` keeps assignment + appointments.
- `setInstructorPreferredVehicle({instructorId, licenseCategory, vehicleId|null})` — owner or self.
- `getAutoscuolaAgendaBootstrapAction` returns `followCarRules` for the agenda.

## API routes (`app/api/autoscuole/`)
- `vehicles/route.ts` (GET/POST), `vehicles/[id]/route.ts` (PATCH spreads payload → `poolInstructorIds`/`status` pass through; DELETE = deactivate).
- `appointments/[id]/route.ts` (PATCH) → `updateAutoscuolaAppointmentDetails`. Now forwards `extraMotoVehicleIds` + `followVehicleId` from the body (previously dropped) so the **mobile "Gestisci guida" Veicoli block** can add/remove/swap extra motos and the follow car on an existing moto guide. See `reglo-mobile/docs/features/vehicles.md`.

## Web UI
- `AutoscuoleResourcesPage.tsx` — vehicle edit dialog: **"Modalità di utilizzo"** segmented (Aperto/Pool/Esclusivo; pool = instructor `ToggleChip` multiselect, exclusive = `Select`), exclusive-only follows-availability toggle, **Attivo/Manutenzione** status segment. `VehicleDetail` carries `poolInstructorIds`.
- `tabs/VehiclesTab.tsx` — card badges (usage mode + maintenance) + the **"Auto al seguito (moto)"** settings card, now a **single global toggle** → `followCarMotoEnabled` via `updateAutoscuolaSettings` (state lives in `AutoscuoleResourcesPage` as a boolean).
- `AutoscuoleAgendaPage.tsx` (create) — **mode-first**: a **"Modalità · Auto / Moto"** selector (same pattern as the group-lesson Standard/Moto) is chosen up front; the form layout is stable and does NOT mutate based on the picked vehicle. Auto → vehicle picker filtered to cars. Moto → picker filtered to motos + a required **"Auto al seguito"** Select (gated on the global rule) + a **"Moto aggiuntive"** chip multiselect. Switching mode resets the vehicle selection. `followVehicleId` + `extraMotoVehicleIds` sent on create.
- `EditAppointmentDialog.tsx` — editing an existing lesson keeps the vehicle-class-driven behaviour (the moto fields show when the current primary is a moto); no mode selector (the lesson's class is already set). The agenda bootstrap exposes `extraMotoVehicles` per appointment; the detail (`VehicleDetailLines`) groups a multi-vehicle moto guide into **"Moto"** (primary marked "(principale)" + extras) + **"Auto al seguito"** instead of one cramped line, and keeps a single **"Veicolo"** line for normal guides.

## Behaviour notes
- Assignment changes are **not retroactive** — only new bookings use the new rule; existing appointments keep their vehicles.
- Follow-car is now wired end-to-end:
  - **Display**: agenda detail cards (`AutoscuoleAgendaPage`) + mobile instructor agenda show "Auto al seguito". The bootstrap maps the `role="follow"` join into `followVehicle`.
  - **Edit**: `EditAppointmentDialog` edits the primary vehicle, follow car and extra motos on existing lessons; `updateAutoscuolaAppointmentDetails` accepts `followVehicleId` + `extraMotoVehicleIds` and reconciles the join rows transactionally (helper `reconcileAppointmentVehicles`, which also fixed a latent stale-join bug when changing the primary). **Picker filtering (2026-06-30, mirrors the mobile manage-lesson sheet)**: all three pickers are limited to vehicles the lesson's **instructor can use** (`instructorCanUseVehicle` from `lib/autoscuole/group-moto`); the **primary** vehicle also requires **student-license** eligibility (`vehicleServesLicense`, moto hierarchy); **extra motos** are *any* company moto the instructor can use (NOT student-filtered — they are just reservations); the **follow car** is a B car the instructor can use. The currently-assigned vehicle always stays selectable. Needs `poolInstructorIds` (now surfaced on the agenda-bootstrap vehicles) + the student's `licenseCategory`/`transmission` (passed into the dialog). NOTE: the **create** flow (mode-first, `AutoscuoleAgendaPage`) filters the primary by student eligibility but does **not** filter by instructor yet — symmetric with the mobile `BookingForm`.
  - **Empty-slot notifications** (`freeSlotLicenseKeysTomorrow`): a moto whose category requires a follow car is only "free" when a category-B car is also free at the slot; follow cars are reserved as busy (reads the `appointmentVehicles` join).
  - **Swaps** (`createSwapOffer` + `instructorSwapAppointments`): lessons with an auto al seguito are blocked from swapping (phase-1 decision #5).
- **Multiple motos per lesson (2026-06-30)**: a moto guida can occupy more than one moto. Set on `createAutoscuolaAppointment` / `createAutoscuolaAppointmentBatch` / `updateAutoscuolaAppointmentDetails` via `extraMotoVehicleIds` (extra motos are validated to be company motos). The instructor sets them from mobile (`BookingForm` "Moto aggiuntive"), the titolare from web. Extra motos are NOT auto-assigned by the matcher (manual only) but are reserved as busy (they live in the `appointmentVehicles` join, which every busy-builder reads). The mobile instructor booking path (`instructor-bookings/confirm` + `/confirm-batch` → `createAutoscuolaAppointment*`) now also supports `followVehicleId` + `extraMotoVehicleIds`; the batch path now writes `appointmentVehicles` rows (previously it wrote none).
- No `trigger:deploy` is required by this feature.

## License categories (B / AM / A1 / A2 / A + transmission)
Second brick of the Vehicles module. Each vehicle serves **one** license category + one transmission; each PRATICA student pursues one license path. Eligibility uses the **moto hierarchy AM < A1 < A2 < A** (since 2026-06-30): a moto student may train on any moto of category **≤** their own (an A2 student → A2/A1/AM, **not** A); **B** (car) is a separate class that only matches B; car↔moto never mix; transmission must still match exactly. This lives in `licenseCategoryEligible` / `vehicleServesLicense` (`lib/autoscuole/license.ts`) — the single chokepoint used by the matcher, availability, swaps, group-moto AND the booking pickers, so all surfaces agree.

**Booking eligibility (instructor/owner) (2026-06-30):** the student picker now shows a license badge (sourced from `listDirectoryStudents`, which exposes `licenseCategory`/`transmission` on the agenda bootstrap). Web create dialog: the student list is filtered by the Auto/Moto mode and the vehicle list by the chosen student (only eligible vehicles); submit is blocked on a mismatch. Mobile `BookingForm`: the vehicle picker only offers vehicles eligible for the chosen student, a now-incompatible vehicle is cleared when the student changes, and confirm is blocked on a mismatch.

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

## Group MOTO lessons reuse the follow car at the GROUP level (2026-06-25)
Besides per-appointment follow cars, a **group moto lesson** (`AutoscuolaGroupLesson.kind="moto"`) reserves a **fleet of motos** (`AutoscuolaGroupLessonVehicle`) + **one shared follow car** (`AutoscuolaGroupLesson.followVehicleId`) at the **container level** — the follow car is NOT replicated on each participant's `appointmentVehicles` (that would self-conflict between siblings). `lib/autoscuole/group-lesson-busy.ts` marks the fleet + follow car busy; `findGroupLessonOverlap` checks them. Per-participant moto auto-assignment lives in `lib/autoscuole/group-moto.ts`. See `features/group-lessons.md`.
