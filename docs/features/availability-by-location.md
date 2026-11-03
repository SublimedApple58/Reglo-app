# Disponibilità per luogo (REG-705)

La disponibilità dell'istruttore si definisce per luogo e vale per gli allievi
di quel luogo; ogni allievo può avere più luoghi. Piano completo e decisioni di
Tiziano: `plans/availability/004-reg-705-706-disponibilita-per-luogo.md`.

> **Stato**: 705-a (backend), 705-b (UI luoghi allievo + interruttore) e 705-c
> (luogo sulle fasce) fatti. Motore slot (705-d), prenotazione allievo (705-e)
> e codici per luogo (REG-706) arrivano nei sotto-task successivi.

## Regole
- **Interruttore** `limits.availabilityByLocation` (default spento), effettivo
  solo con **≥ 2 luoghi attivi** (`availabilityByLocationEnabled`). Spento =
  tutto come prima; i dati restano.
- **Allievo senza luoghi** = vede tutti i luoghi. **Fascia senza luogo** = vale
  per tutti i luoghi (`rangeServesStudent`, `studentLocationScope`).
- **Pausa tra luoghi diversi**: `limits.locationChangeBufferEnabled` +
  `locationChangeBufferMinutes` (5–120, passi di 5, default 30); effetto sul
  motore in 705-d (`effectiveLocationChangeBufferMinutes`).
- **Luogo principale**: `CompanyMember.defaultLocationId` (REG-392). Invariante:
  se l'allievo ha dei luoghi, il principale è uno di questi.

## Modello dati
- `CompanyMemberLocation(companyId, userId, locationId)` — PK composta, FK
  composta su `CompanyMember` (cascade) e su `AutoscuolaLocation` (cascade).
  Migrazione `20261108120000_company_member_locations` con **backfill** dal
  luogo di default.
- Fasce (705-c): `locationId?` dentro i JSON `ranges`/`rangesByDay`
  (`AutoscuolaWeeklyAvailability`) e `ranges`
  (`AutoscuolaDailyAvailabilityOverride`).

## File
- `lib/autoscuole/location-availability.ts` — regole pure (test:
  `tests/unit/autoscuole/location-availability.test.ts`).
- `lib/autoscuole/member-locations.ts` — **unico punto** di lettura/scrittura
  dei luoghi allievo: `getMemberLocationIds`, `setStudentLocations`,
  `setStudentDefaultLocationKeepingInvariant`, `detachArchivedLocationFromMembers`,
  `getLocationAvailabilityState`.
- `lib/actions/autoscuole-student-locations.actions.ts` — `setStudentLocations`
  (istruttore + titolare + admin).
- `app/api/autoscuole/students/[id]/locations/route.ts` — `PUT { locationIds }` (mobile).
- `lib/actions/autoscuole-settings.actions.ts` — i tre setting in
  `updateAutoscuolaSettings` / `getAutoscuolaSettings`.
- `lib/actions/autoscuole.actions.ts` — `setStudentDefaultLocation` passa
  dall'invariante; `locationIds` nelle liste allievi (`listDirectoryStudents`,
  `getAutoscuolaStudents`, `getAutoscuolaStudentsWithProgress`).
- `lib/autoscuole/locations.ts` — `softDeleteLocation` stacca il luogo dagli allievi.

## UI (705-b, anteprime approvate da Tiziano il 03/11)
- **Impostazioni → Sede e luoghi**: `locations/LocationAvailabilityCard.tsx`, sotto
  «Luoghi diversi per tipo di patente». Interruttore + riga «Pausa tra luoghi
  diversi» (minuti − / +, salvati 500 ms dopo l'ultimo clic, + interruttore)
  che si apre in 260 ms. Con la sola sede la card è spenta con la spiegazione.
  Ogni salvataggio manda e unisce **solo i suoi campi** (bug trovato in e2e:
  minuti salvati durante il salvataggio dell'interruttore riportavano la card
  a spenta).
- **Allievi → scheda**: `locations/StudentLocationsPicker.tsx` al posto del
  selettore «Luogo di default» quando la funzione è accesa: casella «Dove fa
  guida» + cerchio «Principale» (solo sui luoghi scelti), contatore «N di M» /
  «Tutti». Ogni clic salva (`setStudentLocations` / `setStudentDefaultLocation`).
  Nella lista la colonna Luogo mostra il principale e `+N` per gli altri.
- **Mobile**: vedi `reglo-mobile/docs/features/dettaglio-allievo.md` (foglio «Luoghi»).
- **E2E**: `tests/e2e/reg705-luoghi-allievo.auth.spec.ts` (rimette setting e luoghi com'erano).

## Luogo sulle fasce (705-c)
- **Dato**: `locationId` dentro gli oggetti fascia dei JSON. Schema zod unico
  `locatedRangeSchema` (`lib/autoscuole/range-locations.ts`); **ogni scrittura
  passa da `sanitizeRangeLocations` / `sanitizeScheduleByDayLocations` /
  `applyRangeLocations`**: tiene il luogo solo se è un luogo attivo
  dell'autoscuola e il proprietario è un istruttore, e omette la chiave quando
  è vuota (JSON identico a prima per chi non usa la funzione). Punti coperti:
  `createAvailabilitySlots` (mobile), `setAutoscuolaInstructorWeeklyAvailability`
  (web), `setWeeklyAvailabilityOverride`, `setRecurringAvailabilityOverride`,
  `setDailyAvailabilityOverride`; il setter dei veicoli toglie sempre il luogo.
- **Lettura**: `parseRanges`, `rangesForDay`, `publishInstructorWeek` e gli
  helper di `weekly-schedule.ts` copiano l'oggetto intero, quindi il luogo
  arriva a web, mobile e alle settimane pubblicate senza altre modifiche.
- **Web**: `locations/RangeLocationSelect.tsx` (menu «Tutti i luoghi» + luoghi
  con indirizzo) e `LocatedRangeList` in `tabs/InstructorsTab.tsx`, usati dal
  Predefinito (orari condivisi e giorno aperto di «Orari diversi per giorno»);
  `DayTimeline` mostra il nome del luogo sotto ogni tratto (grigio = tutti).
  **Calendario e Pubblicazione** conservano il luogo quando cambiano gli orari
  ma non hanno ancora il selettore (follow-up).
- **E2E**: `tests/e2e/reg705-luogo-fasce.auth.spec.ts` (`--workers=1` insieme a
  `reg705-luoghi-allievo`: toccano lo stesso setting).

## Connessioni
- **Locations (REG-392/409)**: archiviare un luogo lo toglie dai luoghi degli
  allievi e riassegna il principale.
- **Availability / Booking Engine** (705-c/d): fasce con luogo, filtro slot,
  luogo della guida, pausa tra luoghi, waitlist, scambi.
- **Mobile**: `locationIds` sugli allievi; route `PUT …/locations`.
