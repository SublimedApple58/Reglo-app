# Disponibilità per luogo (REG-705)

La disponibilità dell'istruttore si definisce per luogo e vale per gli allievi
di quel luogo; ogni allievo può avere più luoghi. Piano completo e decisioni di
Tiziano: `plans/availability/004-reg-705-706-disponibilita-per-luogo.md`.

> **Stato**: 705-a fatto (backend: dati, setting, API di assegnazione). Editor
> delle fasce, motore slot, UI web/mobile e codici per luogo (REG-706) arrivano
> nei sotto-task successivi.

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

## Connessioni
- **Locations (REG-392/409)**: archiviare un luogo lo toglie dai luoghi degli
  allievi e riassegna il principale.
- **Availability / Booking Engine** (705-c/d): fasce con luogo, filtro slot,
  luogo della guida, pausa tra luoghi, waitlist, scambi.
- **Mobile**: `locationIds` sugli allievi; route `PUT …/locations`.
