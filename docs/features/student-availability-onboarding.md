# Disponibilità dell'allievo a fasce + onboarding in app (REG-802)

> Stato (27/11/2026): backend, web (drawer allievo) e app fatti e provati su dev (simulatore + e2e), branch `feat/reg-802-onboarding-allievo` su entrambi i repo. Backend su staging; prod e OTA solo col via. Piano e decisioni di Tiziano: `/tmp/hiro-anteprime/reg-802/piano.md` (§10). Doc mobile gemella: `reglo-mobile/docs/features/` (da scrivere con l'app).

## Cosa fa
- L'allievo indica, **giorno per giorno** (lun–dom), tre fasce fisse: **Mattina 8–13, Pomeriggio 13–18, Sera 18–21** («posso venerdì pomeriggio e lunedì sera»). Prima l'app permetteva una fascia sola uguale per tutti i giorni.
- **Non sono vincoli** per l'allievo: dall'app prenota qualunque orario libero (`selectedStartsAt` salta le sue disponibilità). Decidono però chi riceve «Si è liberato un posto», le offerte della lista d'attesa, gli scambi `available_only`, i posti liberi di domani (`availability_matching`) e cosa propone `slot-matcher` all'istruttore. **Senza disponibilità l'allievo non riceve nessuno di questi avvisi**: per questo l'app le chiede con un onboarding.
- Istruttore e titolare le **vedono in sola lettura** (app e web) da `availability/default` (`scheduleByDay`).

## Modello
- Nessuna tabella nuova: la settimana tipo dell'allievo è la riga `AutoscuolaWeeklyAvailability` con `ownerType: "student"`, nel modello per giorno (`rangesByDay`) già usato dagli istruttori. Le fasce si salvano **in minuti**, fuse se adiacenti (mattina+pomeriggio = 8–18); i campi piatti prendono il primo giorno attivo e `daysOfWeek` tutti i giorni attivi. I lettori del motore leggono solo con `rangesForDay` (vedi `availability.md`, sezione REG-802).
- `CompanyMember.availabilityConfirmedAt` — quando l'allievo le ha confermate dall'app (null anche con una riga legacy). Per il web: «Indicate il …».
- `CompanyMember.availabilityPromptSnoozedUntil` — «Configura in seguito».
- Migrazione `20261127150000_student_availability_onboarding` (due colonne nullable).

## Fasce ↔ minuti (`lib/autoscuole/student-availability.ts`, puro)
- `STUDENT_AVAILABILITY_BANDS` — le fasce; viaggiano nella risposta dell'API, l'app non le conosce a memoria (domani configurabili senza release).
- `bandsToRangesByDay`, `weeklyRowFromBands` — scrittura.
- `rowToBandsByDay` — lettura per l'editor: una fascia è «scelta» se gli intervalli del giorno la coprono **per almeno metà** (righe legacy con orari liberi). Al primo salvataggio dall'app la riga si normalizza sulle fasce.

## Quando si chiede (criterio «fase guide»)
`isInDrivingPhase` / `studentAvailabilityStepMode`, allineati a chi può prenotare guide dall'app (`ensureStudentCanBookFromApp`):

| Allievo (autoscuola attiva) | Step Disponibilità |
|---|---|
| ha già una riga con fasce (anche legacy) | nessuno |
| `PRATICA` con percorso patente aperto, o senza percorsi registrati (storici pre REG-458) | **bloccante** |
| `AWAITING` / `TEORIA` | **rimandabile**: X o «Configura in seguito» → `availabilityPromptSnoozedUntil = adesso + 3 giorni`; ricompare alla prima apertura dopo la scadenza, oppure subito se entra in fase guide |
| `PATENTATO`, o `PRATICA` con tutti i percorsi chiusi | nessuno (non fa più guide) |

## Onboarding (`lib/autoscuole/student-onboarding.ts`, puro)
`GET /api/mobile/me` → `onboarding: { steps: [{ key, required }] } | null` (solo allievi; le app vecchie lo ignorano):
- `User.profileCompletedAt` null = **prima volta in app** (account creato dall'autoscuola con email e password, mai entrato) → `name`, `email` (solo se non segnaposto), `phone`;
- profilo completo ma senza cellulare → `phone` (sostituisce il PhoneGate dell'app);
- poi `availability` secondo la tabella sopra.

`profileCompletedAt` lo valorizzano: la fine di questo onboarding, il Primo accesso col telefono (già prima), la **registrazione dall'app** (`student-register`, dal REG-802). Migrazione dati `20261127160000_backfill_profile_completed_at`: `profileCompletedAt = createdAt` per chi ha (o ha avuto) un `MobileAccessToken` o un `MobilePushDevice` → chi usa già l'app non rivede l'onboarding. Margine accettato: chi è entrato, è uscito e non ha mai registrato le notifiche lo vede una volta (campi precompilati).

## API
| Rotta | Cosa |
|---|---|
| `GET /api/autoscuole/me/availability` | `{ bands, days, confirmedAt, hasAvailability }` dell'allievo (sempre le sue) |
| `PUT /api/autoscuole/me/availability` | `{ days: { "1": ["evening"], "5": ["afternoon"] } }`, almeno una fascia; segna la conferma e azzera il rinvio |
| `POST /api/autoscuole/me/availability/snooze` | «Configura in seguito»; **409** in fase guide |
| `POST /api/autoscuole/me/onboarding` | `{ firstName?, lastName?, phone?, availability? }`: ricontrolla gli step dovuti e pretende i dati di quelli obbligatori; nome → `User.name` (+ `syncInstructorName`), cellulare E.164 (`validateStudentPhone`: con +39 almeno 9 cifre), disponibilità come il PUT; risponde `{ onboarding }` ricalcolato |
| `POST /api/mobile/auth/first-access/complete` | accetta anche `availability: { days }` (step prima del riepilogo); un errore lì non blocca l'attivazione |
| `GET /api/autoscuole/students/:id/availability` | lettura staff (titolare, istruttori, admin della stessa autoscuola) già in fasce, con `confirmedAt`: `getStudentAvailabilityForStaff` (`lib/actions/autoscuole-student-availability.actions.ts`). La usano il dettaglio allievo dell'app e il drawer web |
| `GET /api/autoscuole/availability/default?ownerType=student&ownerId=…` | lettura grezza in minuti (`scheduleByDay`); l'allievo solo le sue (`canReadAvailability`) |

## Web — drawer allievo
`components/pages/Autoscuole/StudentAvailabilitySection.tsx`: sezione «Disponibilità» in sola lettura (un giorno per riga, fascia in grassetto + orari, «—» per i giorni liberi, «N giorni» a destra, piede «Indicate da Sara il 27 novembre 2026. Non vincolano le prenotazioni: servono a proporre orari adatti e ad avvisare dei posti liberi.»; vuota: «Non ancora indicate» con la spiegazione). Testi neutri (il genere dell'allievo non si sa). `useStudentAvailabilityForStaff` nella pagina: la sezione entra in `DetailSections` solo con la risposta dell'allievo aperto (un figlio vuoto lascerebbe un separatore). Non nella vista ridotta (affiliate).

## Conversione delle esistenti
`scripts/reg-802-convert-student-availability.ts` — a vuoto di default, `--apply` per scrivere. Copia le fasce delle righe legacy su ogni giorno attivo in `rangesByDay` (senza perdita, idempotente, solo dove `rangesByDay` è vuoto) e stampa quanti allievi incontreranno lo step (bloccante / rimandabile). Su staging e prod **solo col via di Tiziano**, dopo `migrate`.

## Prove
- Unit: `tests/unit/autoscuole/student-availability.test.ts`, `student-onboarding.test.ts`, `availability-record.test.ts`, `slot-matcher-student-ranges.test.ts`, `availability-read-scope.test.ts`, `student-availability-staff.test.ts`.
- E2E: `tests/e2e/reg802-disponibilita-drawer.auth.spec.ts` (onboarding da API di Sara + drawer pieno e vuoto; seed e pulizia da sé).
- Dev (27/11): `scripts/seed-reg802.ts` crea Marta Galli (solo telefono `+39 333 000 0803`, da attivare col Primo accesso), Sara Conti (`reg802.pratica@e2e.reglo.test`, PRATICA, mai entrata) e Luca Ferri (`reg802.teoria@e2e.reglo.test`, TEORIA) nell'autoscuola del titolare di prova (password del titolare; `--cleanup` per toglierli). Provato: step attesi in `/me`, rinvio rifiutato in fase guide e accettato in teoria, completamento con errori (numero corto, disponibilità mancante) e riuscito, letture staff e divieto tra allievi, `instructor-bookings/suggest` che propone lunedì 18:00 e venerdì 14:00 per «lunedì sera + venerdì pomeriggio».

## Connessioni
- **Availability / Booking engine / Swaps / lista d'attesa**: leggono la riga con `rangesForDay` (`availability.md`).
- **Student phase / percorsi patente**: il criterio dello step (`student-phase.md`, `license-paths.md`). Chi cambia le fasi o lo specchio del percorso guardi `isInDrivingPhase`.
- **Allievo col telefono / Primo accesso**: `profileCompletedAt` e la disponibilità nel `complete` (`allievo-telefono.md`).
- **Mobile**: `/api/mobile/me` `onboarding`, nuove rotte `me/availability*`, `me/onboarding`.

## REG-813 — «Un orario preciso» (27/11)
Le tre fasce erano troppo larghe: chi è libero solo dalle 15 alle 17 non poteva dirlo. Ora sono una **scorciatoia** e l'allievo può indicare, giorno per giorno, anche **un orario preciso**: fino a **due intervalli al giorno**, a **passi di 30 minuti**, fra le **6 e le 22**, lunghi almeno quanto la guida più breve dell'autoscuola (`bookingSlotDurations`).

- **Nessuna migrazione e nessuna conversione**: `rangesByDay` conteneva già minuti; le righe salvate a fasce restano valide così come sono (8–13 è un intervallo come un altro). Motore, lista d'attesa e scambi non cambiano (leggono con `rangesForDay` e vogliono la guida tutta dentro l'intervallo: con 15–17 una guida 15–16 sì, 16:30–17:30 no).
- **Regole pure** (`lib/autoscuole/student-availability.ts`): `STUDENT_RANGE_RULES`, `normalizeRangesByDay` (arrotonda al passo, taglia ai limiti, fonde gli intervalli che si toccano, toglie i troppo corti; unico errore: più di due in un giorno; indulgente apposta con le righe vecchie fuori passo), `availabilityInputToRanges` (fasce o intervalli → intervalli canonici), `rowToRangesByDay` (lettura senza arrotondare), `weeklyRowFromRanges`, schema `studentAvailabilityInputSchema`.
- **Store** (`student-availability-store.ts`): la risposta aggiunge `ranges` (orari veri per giorno) e `rules` (`minMinutes`, `maxMinutes`, `stepMinutes`, `maxPerDay`, `minDurationMinutes`); `resolveStudentAvailabilityInput(companyId, input)` + `saveStudentAvailability(companyId, userId, ranges)`.
- **API**: `PUT me/availability`, `POST me/onboarding` (`availability`) e `first-access/complete` (`availability`) accettano `{ ranges }` (app nuova) oppure `{ days }` (app fino al REG-802). `days` resta nella risposta per le app vecchie: lì un orario preciso è arrotondato alla fascia (≥ metà) o non compare.
- **Web** (`StudentAvailabilitySection`): la riga mostra «Pomeriggio · 13–18» quando gli orari coincidono con fasce intere, altrimenti solo le ore («15–17:30, 18:30–20:30»).
- **Non toccato**: l'avviso dei posti liberi di domani (guarda il giorno; c'è già l'impostazione «a tutti / solo ai disponibili»), per decisione di Tiziano.
- **Rilascio**: backend prima dell'OTA (l'app nuova manda `ranges`).
- Test: `tests/unit/autoscuole/student-availability.test.ts` (blocco «REG-813 — orari precisi»).
