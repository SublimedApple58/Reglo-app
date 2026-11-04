# Disponibilità per luogo (REG-705)

La disponibilità dell'istruttore si definisce per luogo e vale per gli allievi
di quel luogo; ogni allievo può avere più luoghi. Piano completo e decisioni di
Tiziano: `plans/availability/004-reg-705-706-disponibilita-per-luogo.md`.

> **Stato**: 705-a, 705-b, 705-c, 705-d (motore) e 705-e (dati + UI allievo,
> verificata sul simulatore il 04/11) fatti. REG-706 (codici per luogo) sta sul
> suo branch.

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

## Luogo sulle fasce in agenda web (05/11, approvato da Tiziano: variante A)
- **Dato**: `getInstructorAvailabilityForAgenda` aggiunge `locationName` a ogni
  fascia **solo** con la funzione effettiva (`getLocationAvailabilityState`):
  stringa = luogo attivo, `null` = fascia senza luogo (o luogo archiviato).
  Spenta, la chiave manca e la risposta è identica a prima.
- **UI**: `AvailabilityBandLabels` in `AutoscuoleAgendaPage.tsx`, viste
  settimana e giorno. Solo il nome del luogo (niente orario), testo grigio
  10–10,5px peso 500 in testa alla fascia; «Tutti i luoghi» più chiaro. Se una
  guida copre l'inizio il nome scende nel primo tratto libero ≥16px
  (`lib/autoscuole/agenda-band-label.ts`, testato); fascia tutta occupata = solo
  tooltip. Tra due fasce attaccate una linea sottile `bg-black/10`. Colori delle
  fasce invariati (quelli dell'istruttore). Sta sopra fascia e righe (z-[1]),
  sotto le guide (z-10). Dissolvenza 200 ms. La finestra oraria arriva dalle
  preferenze di vista (`startHour`/`endHour`), non dalle costanti di modulo.

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

- **Mai nelle letture generali**: `lib/autoscuole/locations.ts` omette
  `inviteCode` (`LOCATION_PRIVATE_FIELDS`) da elenco, crea, modifica, sede,
  archivia e categorie. Bug trovato il 05/11: `/api/autoscuole/locations` (lo
  chiamano anche allievi e istruttori) restituiva i codici di tutti i luoghi.
  L'e2e `reg706` ora controlla che l'elenco non abbia `inviteCode`.

## E2E contro staging

La variabile è `E2E_BASE_URL` (con `BASE_URL` Playwright accende il server
locale e gira sul DB dev). Su staging il titolare è anche in «Reglo E2E» (un
istruttore, un luogo): si punta «Autoscuola Reglo» con `E2E_COMPANY_ID` e un
allievo di Marco Bianchi o Giulia Conti con `E2E_STUDENT_EMAIL`, perché
`allievo@reglo.it` è di Chiara Marino, in pubblicazione senza settimane
pubblicate (0 slot a prescindere dai luoghi).

```bash
E2E_BASE_URL=https://staging.reglo.it \
E2E_COMPANY_ID=655e408a-72f4-4595-839b-9b92b1170d9e \
E2E_STUDENT_EMAIL=allievo26@reglo.it \
npx playwright test tests/e2e/reg705-*.auth.spec.ts tests/e2e/reg706-codici-luogo.auth.spec.ts \
  tests/e2e/invite-code.auth.spec.ts --project=setup --project=chromium-auth --workers=1
```

Nessuno prenota né notifica; ognuno rimette setting, fasce e luoghi
dell'allievo com'erano. Verdi davvero su staging il 04/11 (7 su 7).

## Connessioni
- **Locations (REG-392/409)**: archiviare un luogo lo toglie dai luoghi degli
  allievi e riassegna il principale.
- **Availability / Booking Engine** (705-c/d): fasce con luogo, filtro slot,
  luogo della guida, pausa tra luoghi, waitlist, scambi.
- **Mobile**: `locationIds` sugli allievi; route `PUT …/locations`.

## Note dalla verifica sul simulatore (705-e, 04/11)
- Lista d'attesa: il luogo dell'offerta è `null` quando l'ora cade in due fasce
  con luoghi diversi, o quando il motore assegna un istruttore con una fascia
  senza luogo. In quel caso l'app non mostra la riga e la prenotazione passa
  senza vincolo. È voluto, non è un difetto.
- Scambi: con un istruttore in modalità autonoma l'allievo vede solo gli scambi
  del suo gruppo (regola preesistente, non di REG-705).
