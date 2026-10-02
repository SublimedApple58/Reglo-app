# Booking Engine

## What it does
Slot matching, booking governance, waitlist broadcasting, instructor booking suggestions.

## Key files
- `lib/autoscuole/slot-matcher.ts` — find compatible slots
- `lib/autoscuole/booking-governance.ts` — booking rules and limits
- `lib/autoscuole/lesson-policy.ts` — lesson type constraints
- `lib/autoscuole/exam-priority.ts` — 14-day exam priority window
- `lib/actions/autoscuole-availability.actions.ts` — booking request flow, waitlist, suggestions

## Key functions
- `findBestAutoscuolaSlot()` — core slot matching (respects instructor, vehicle, student conflicts + lesson policy + governance)
- `getBookingGovernanceForCompany()` — weekly limits, booking actors, instructor booking mode
- `isLessonTypeAllowedForInterval()` — lesson type time/day restrictions
- `hasExamPriority()` — exam priority check (auto-detected from case or manual override)
- `broadcastWaitlistOffer()` — notify waiting students when slots open
- `suggestInstructorBooking()` — auto-suggest slots for instructors
- `getPublicationModeFilter()` — gate booking by publication status
- `getStudentBookingBlockStatus()` — check if student is blocked
- `createBookingRequest()` — student booking desire → slot matching → offer

## Slot proposal generation (packing-complete)
Gli slot proposti all'allievo (`getAllAvailableSlots` + `getDateAvailabilityMap`) vengono da `lib/autoscuole/slot-packing.ts`:
1. disponibilità istruttore − impegni (appuntamenti+blocchi) → intervalli liberi (`computeFreeIntervalsInRange`)
2. `computeAnchorAwareEntryPoints` in **packing-complete mode** (`allowedDurations` = durate del cluster): uno start è ammesso solo se il residuo che lascia su ALMENO un lato dell'intervallo libero è riempibile ESATTAMENTE con combinazioni delle durate consentite. Se esistono start "perfetti" (entrambi i residui riempibili) vengono emessi solo quelli. Se non ne esistono: intervallo con lunghezza riempibile da ALTRE durate → nessuna proposta per questa durata (l'intervallo resta alle durate giuste; liveness garantita: almeno una durata ha sempre uno start perfetto); intervallo genuinamente irrecuperabile (lunghezza ∉ R) → fallback alle ancore semi-perfette (un lato flush, spreco confinato). Granularità 15' enforced (coerente col guard di conferma). Simulazione 500 sequenze miste 30/45/60 su finestra 240': spreco 0' in tutti i casi. Esempio: 14:15–18:15 con guide da 60' → 14:15, 15:15, 16:15, 17:15 (mai 15:30, che lascerebbe 15' orfani). `roundedHoursOnly` vincola in più i punti non-ancora alla cascata oraria dal range start.
3. `buildCandidateStarts` (slot-matcher per `suggestInstructorBooking` + copia in `createBookingRequest` per i giorni alternativi) unisce la griglia legacy :00/:30 alla cascata ancorata all'inizio finestra (granularità 15') — lo scoring per adiacenza preferisce i candidati flush.
Test: `tests/unit/autoscuole/slot-packing.test.ts`.

## Waitlist ("slot liberato") — slot-assignment engine (2026-07-06)
`respondWaitlistOffer` / `broadcastWaitlistOffer` / `getWaitlistOffers` usavano il
meccanismo legacy delle righe `AutoscuolaAvailabilitySlot` "open" e **bypassavano
le regole veicoli** (pool/esclusiva, auto al seguito, status active, conflitti
reali). Ora tutti e tre passano da `lib/autoscuole/slot-assignment.ts`:
- `buildSlotAssignmentContext(companyId, rangeStart, rangeEnd)` carica UNA volta
  istruttori/veicoli/pool/preferred/followCarRules + resolver disponibilità +
  pubFilter + intervalli busy REALI (appuntamenti con join `appointmentVehicles`,
  blocchi istruttore, container guide di gruppo).
- `resolveSlotAssignmentForStudent(ctx, {licenseCategory, transmission, startsAt,
  endsAt})` → `{instructorId, vehicleId, followVehicleId} | null` — stesse regole
  del flusso di prenotazione (patente+cambio, esclusiva/pool/open, auto al
  seguito per percorsi moto). Pure in-memory: broadcast/visibilità la chiamano
  per-allievo/per-offerta sullo stesso context. Test:
  `tests/unit/autoscuole/slot-assignment.test.ts`.
- L'accept scrive le righe `appointmentVehicles` (primary+follow), prenota le
  righe slot dell'istruttore/veicoli assegnati (upsert) e ri-verifica i conflitti
  DENTRO la transazione contro gli appuntamenti reali (niente più fiducia nelle
  righe slot stantie).
- Restano ESCLUSI di proposito (semantica slot_fill storica): limite settimanale
  (bypass documentato per `bookingSource=slot_fill`), cutoff, lock cluster
  dell'allievo sull'istruttore assegnato.
- Fix collaterale: cancellazione/spostamento/annullamento operativo ora riaprono
  anche le righe slot dei veicoli collegati (auto al seguito, moto aggiuntive) —
  prima restavano "booked" per sempre.

## Governance settings
- `appBookingActors`: "students_only" | "instructors_only" | "both"
- `instructorBookingMode`: "manual_full" | "manual_engine"
- `weeklyBookingLimit`: max bookings per week
- `bookingCutoffTime`: no booking after this time
- `bookingBlocked` / `weeklyBookingLimitExempt`: per-student flags

## Booking gate coverage (`bookingMinStartDate` — "Prenotazioni aperte dal")
The `serviceLimits.bookingMinStartDate` gate is enforced **only** in
`createBookingRequest()` (student self-booking from the app). It does **not**
cover swap accepts (`respondSwapOffer`) — a student can still acquire an existing
appointment dated before the gate by accepting a swap. Repositioning used to
bypass it too, but repositioning is now retired (see
[repositioning.md](repositioning.md)) so cancellations no longer create
pre-gate appointments. If full gate coverage is ever required, add the
`bookingMinStartDate` check to `respondSwapOffer` as well.

## Connected features
- **Availability** — reads weekly, daily overrides, published weeks, holidays
- **Appointments** — creates appointments when booking confirmed
- **Payments** — captures payment snapshot on booking
- **Instructor Clusters** — respects cluster assignments, autonomous mode, durations
- **Notifications** — waitlist broadcasts

## Chi è occupato: `appointment-busy.ts` (REG-591, 2026-10-02)

Il motore ragiona per **proprietario**: allievo, istruttore, veicolo, ognuno con la sua lista di intervalli occupati. Costruire quella lista vuol dire rispondere a una domanda sola — *questa riga chi impegna?* — e la risposta stava scritta a mano in **cinque** posti: `slot-matcher.ts`, `slot-assignment.ts` e tre builder dentro `autoscuole-availability.actions.ts`.

Non sono stati aggiornati insieme. Con REG-585 una guida di gruppo o un esame hanno potuto avere un **secondo istruttore** (`AutoscuolaAppointmentInstructor`), ma le cinque copie guardavano solo `instructorId`: per il motore il collega restava **libero** in quell'ora e gli allievi si prenotavano sopra. Doppia prenotazione vera.

Ora la risposta sta in `lib/autoscuole/appointment-busy.ts`:
- `appointmentBusyOwnerIds(appt)` → allievo + principale + **co-istruttori** + veicolo + veicoli del join;
- `appointmentBusyInstructorIds(appt)` → solo gli istruttori, per chi non tratta veicoli (report ore);
- `APPOINTMENT_BUSY_SELECT` → il `select` Prisma che li carica.

⚠️ **Funzione e select vanno in coppia**: un campo aggiunto alla funzione ma non al select è `undefined` a runtime e non impegna nessuno, **in silenzio**. È esattamente il modo in cui il bug può tornare.

Fuori dal motore valgono le stesse regole: `findGroupLessonOverlap` e il check istruttori dell'esame erano già a posto da REG-585; sono stati allineati `createAutoscuolaAppointment`, `createAutoscuolaAppointmentBatch`, lo **spostamento** guida, la creazione/spostamento di un **blocco** istruttore e il report ore. Le guide di gruppo **vuote** non hanno righe appuntamento: i loro co-istruttori arrivano dal contenitore, via `group-lesson-busy.ts`.

Test: `tests/unit/autoscuole/appointment-busy.test.ts`.
