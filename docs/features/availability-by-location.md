# Disponibilità per luogo (REG-705)

La disponibilità dell'istruttore si definisce per luogo e vale per gli allievi
di quel luogo; ogni allievo può avere più luoghi. Piano completo e decisioni di
Tiziano: `plans/availability/004-reg-705-706-disponibilita-per-luogo.md`.

> **Stato**: 705-a, 705-b, 705-c e 705-d (motore) fatti; 705-e fatto per la
> parte dati (sotto), la UI allievo aspetta l'ok sulle anteprime. Resta REG-706
> (codici per luogo).

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

## Motore (705-d)
Tutto in `lib/autoscuole/location-booking.ts` (puro + loader), test in
`tests/unit/autoscuole/location-booking.test.ts`, e2e via API in
`tests/e2e/reg705-motore-luoghi.auth.spec.ts`.
- **Filtro**: `scopeResolver` avvolge il resolver di disponibilità degli
  istruttori per le richieste di UN allievo: restano le fasce senza luogo o dei
  suoi luoghi. Le guide stanno dentro una fascia sola, quindi non scavalcano mai
  due luoghi. Applicato in `getAllAvailableSlots`, `getDateAvailabilityMap`,
  `createBookingRequest`, `findBestAutoscuolaSlot` (suggerimento istruttore) e
  `resolveSlotAssignmentForStudent` (waitlist: offerte, broadcast, accettazione).
- **Luogo della guida**: quello della fascia (`locationOfCoveringRange`); se la
  fascia non ne ha, la precedenza di sempre (`resolveStudentBookingLocationId`).
  Vale per la prenotazione dell'allievo e per l'accettazione della waitlist;
  `suggestInstructorBooking` restituisce `locationId`.
- **Slot con luogo**: a funzione accesa la lista slot emette uno slot per luogo
  (alla stessa ora istruttori liberi in luoghi diversi = due slot) con
  `locationId` + `locationName`; spenta, la risposta è identica a prima.
  `createBookingRequest` accetta `locationId` opzionale (assente = nessun vincolo,
  app vecchie; `null` = solo fasce senza luogo; uuid = solo quel luogo).
- **Pausa tra luoghi**: `passesLocationChangeBuffer` / `violatesLocationChangeBuffer`
  scartano uno start a meno di N minuti da una guida dello stesso istruttore in
  un luogo diverso (guide senza luogo = sede; fascia senza luogo = principale
  dell'allievo → sede). Le guide col luogo si caricano solo con la pausa attiva
  (`loadInstructorLocatedBusy`).
- **Scambi**: `createSwapOffer` notifica solo chi ha il luogo della guida,
  `getSwapOffers` mostra solo quelli, `respondSwapOffer` rifiuta chi non ce l'ha
  (`studentCanTakeLocation`).
- **Non coperto (follow-up)**: precompilazione del Luogo dalla fascia nelle
  prenotazioni manuali dello staff (agenda web, `BookingForm` mobile) e selettore
  del luogo in Calendario/Pubblicazione del web. Lo staff non è mai bloccato.

## Dati per l'app allievo (705-e)

- **Lista d'attesa**: `getWaitlistOffers` (`GET /api/autoscuole/waitlist/offers`) a
  funzione accesa aggiunge a ogni offerta `locationId` + `locationName` = luogo della
  fascia che il motore assegnerebbe all'allievo (`resolveSlotAssignmentForStudent`,
  `withLocationName`); `null` = fascia senza luogo. Spenta, risposta identica a prima.
- **Scambi**: `getSwapOffers` aggiunge `appointment.locationId` + `locationName` (luogo
  vero della guida ceduta), sempre.
- **Guide dell'allievo**: `getAutoscuolaAppointmentsFiltered` porta già `location`
  (nome, indirizzo, precisione) in entrambi i rami: nessuna modifica.
- **Prenotazione**: l'app manda `locationId` dello slot scelto (vedi mobile
  `src/utils/slotLocation.ts`); assente quando lo slot non lo porta.

## Codici di invito per luogo (REG-706)

- **Schema**: `AutoscuolaLocation.inviteCode String? @unique` (migrazione
  `20261109120000_location_invite_codes`, additiva, nessun backfill).
- **Generazione**: `ensureLocationInviteCode` (`lib/autoscuole/invite-codes.ts`), pigra
  e race-safe, stesso alfabeto dei codici istruttore. `isSignupCodeTaken` controlla
  autoscuola + istruttore + luogo ed è usato anche da `ensureInstructorInviteCode` e
  `getCompanyInviteCode`: il campo della registrazione è unico per i tre codici.
- **Lettura web**: `getLocationInviteCodes` (`lib/actions/autoscuole-location-invites.actions.ts`)
  → `{ enabled, locations[] }`; con la funzione spenta `enabled: false` e nessun codice
  generato. Stessi permessi del codice autoscuola.
- **Registrazione**: `resolveSignupInviteCode` (`lib/autoscuole/signup-invite.ts`, dipendenze
  iniettabili) cerca autoscuola → istruttore → luogo. Il codice luogo vale solo con la
  funzione effettiva e luogo non archiviato; `student-register` crea il membro con
  `defaultLocationId` = quel luogo e la riga `CompanyMemberLocation`. Altrimenti stesso
  errore generico «Codice di invito non valido» (mobile invariato).
- **Fuori v1**: allievi già iscritti che si aggiungono un luogo col codice (solo staff).
- **Modale «Chiave di accesso»** (anteprime approvate da Tiziano il 04/11):
  `InviteCodeDialog` riceve `locationCodes` (caricati dalla pagina Allievi con il
  codice autoscuola e ricaricati a ogni apertura). Con la funzione accesa, sotto
  il codice dell'autoscuola c'è «Codici per luogo» (numero dei luoghi, una riga
  di spiegazione, una riga per luogo con nome e indirizzo). Il codice è nascosto
  da sei punti e non sta nel DOM finché non si preme «Mostra»; poi lo stesso
  bottone copia e per 1,6 s dice «Copiato». Gli stati si incrociano in 200 ms
  (opacità + sfocatura per il codice, opacità + 4px per l'etichetta).
- Test: `signup-invite.test.ts`, `location-invite-codes.test.ts`; e2e
  `tests/e2e/reg706-codici-luogo.auth.spec.ts` (mostra, copia, codici tutti
  diversi, sezione assente a funzione spenta; `--workers=1`). Registrazione con
  codice luogo verificata sul DB dev il 04/11 (utente di prova cancellato).

## Connessioni
- **Locations (REG-392/409)**: archiviare un luogo lo toglie dai luoghi degli
  allievi e riassegna il principale.
- **Availability / Booking Engine** (705-c/d): fasce con luogo, filtro slot,
  luogo della guida, pausa tra luoghi, waitlist, scambi.
- **Mobile**: `locationIds` sugli allievi; route `PUT …/locations`.
