# Reglo Road — Guida in diretta (REG-638)

Modulo che le autoscuole attivano: durante una guida il telefono dell'istruttore entra in **modalità Road** (mappa a tutto schermo, GPS, percorso, segnalazioni degli errori dell'allievo sul punto esatto, pagellino, Termina guida, riepilogo) e in web app l'autoscuola vede **dal vivo** tutte le auto in guida. Niente dashcam né AI: le segnalazioni le mette l'istruttore a mano.

Piano e decisioni di prodotto: `plans/road/001-reglo-road.md`. Anteprime approvate (prototipi HTML): `/tmp/hiro-anteprime/reg-638/proto/`.

## Regole di prodotto
- **Interruttore**: `CompanyService.limits.roadEnabled` (nasce spento, vale solo `=== true`), si accende **solo dal backoffice** (drawer «Gestisci» di `BackofficeCompaniesPage.tsx`). Esposto read-only in `AutoscuolaSettingsData.roadEnabled` (`GET /api/autoscuole/settings`).
- **v1 solo guide singole in auto**: niente gruppi (`groupLessonId`), esami, moto (`motoLessonType` o veicolo AM/A1/A2/A). Vedi `isRoadEligibleLesson`.
- **Ingresso**: l'invito si apre 15 min prima dell'inizio (`ROAD_ENTRY_OPENS_MIN`); entrare porta la guida a `checked_in`.
- **«Termina guida»** = sessione chiusa **e guida `completed` subito**.
- **Allievo**: vede percorso e segnalazioni (a guida finita) solo se è attivo `limits.studentNotesEnabled` («Mostra note e percorsi nell'app allievi»).
- **Segnalazioni**: lista base uguale per tutti (`ROAD_BASE_MARKERS` in `lib/autoscuole/road/catalog.ts`) + voci custom per autoscuola in `limits.roadCustomMarkers` = `[{ id, label }]` (max 12, label max 40), modificabili dal titolare via `updateAutoscuolaSettings` (`roadCustomMarkers`). Nel DB `RoadMarker.kind` = chiave base o `custom:<id>`, e `label` è la copia del nome (lo storico non cambia se la voce viene rinominata/tolta).
- **Privacy**: GPS acceso solo a sessione attiva; sessioni dimenticate aperte chiuse come `abandoned` a fine guida + 30 min; percorsi e segnalazioni cancellati dopo **12 mesi**. Tutto nel job Trigger `autoscuole-road-maintenance` (ogni 15 min).
- **Pagellino**: indipendente da Road. Nel riepilogo compare `evaluation` (voci e punteggi) se esiste; da Road si apre il pagellino esistente.

## Modello dati (migrazione `20261030120000_reglo_road`, solo additiva)
- `RoadSession` — una per guida (`appointmentId` unico): `status` active|completed|abandoned, `startedAt/endedAt`, `distanceMeters`, `durationSec`, `pointCount`, `lastSeq`, `last*` (ultima posizione/velocità/direzione/via/ora).
- `RoadPointBatch` — lotti di punti `@@unique(sessionId, seq)` → upload idempotente. Punto = `[tMs, lat, lng, speedMs|null, heading|null, accuracyM|null]`.
- `RoadMarker` — segnalazione: `clientId` unico (idempotenza dalla coda offline), `kind`, `label`, `note?`, `lat/lng`, `street?`, `recordedAt`.

I km si sommano a ogni lotto (fix con accuratezza > 50 m e salti > 180 km/h scartati) e si **ricalcolano da zero** alla chiusura, su tutto il percorso in ordine.

## API (`app/api/autoscuole/road/**`, Bearer mobile o cookie web)
Tutte rispondono `{ success: true, data } | { success: false, message, code? }` (400 se errore). Codici: `ROAD_DISABLED`, `FORBIDDEN`, `NOT_FOUND`, `NOT_ELIGIBLE`, `TOO_EARLY`, `SESSION_CLOSED`.

| Metodo | Path | Chi | Cosa |
|---|---|---|---|
| GET | `/road/state` | istruttore | `{ roadEnabled, catalog: { base: [{key,label}], custom: [{id,label}] }, activeSession: Session+{lesson} \| null, eligibleLesson: Lesson \| null }` |
| POST | `/road/sessions` `{ appointmentId }` | istruttore della guida | crea o **riprende** (`resumed: true`) → `Session + { lesson, resumed }` |
| GET | `/road/sessions/[id]` | istruttore della guida, titolare | `Detail` |
| POST | `/road/sessions/[id]/points` `{ seq, points, street? }` | istruttore | `{ accepted, duplicate? , reason? }` — `accepted:false, reason:"SESSION_CLOSED"` se chiusa |
| POST | `/road/sessions/[id]/markers` `{ clientId, kind, label?, note?, lat, lng, street?, recordedAt? }` | istruttore | `Marker` (idempotente su clientId; accettato fino a 2 h dopo la chiusura) |
| DELETE | `/road/sessions/[id]/markers/[markerId\|clientId]` | istruttore | `{ removed: true }` («Annulla») |
| POST | `/road/sessions/[id]/end` | istruttore | chiude + guida `completed` → `Detail` |
| GET | `/road/sessions/[id]/track?afterSeq=n` | titolare | `{ lastSeq, points: [[lat,lng,tMs]] }` (solo lotti nuovi) |
| GET | `/road/appointments/[appointmentId]` | allievo (con setting), istruttore, titolare | `Detail \| null` |
| GET | `/road/live` | titolare | `{ now, base: {name,lat,lng}\|null, sessions: [Session+{lesson, markerCount, markerKinds, recentMarkers}], atBase: [{id,name,plate,carColor,freeUntil}] }` |
| GET | `/road/today` | titolare | `[Lesson + { road: Session+{markerCount, markerKinds} \| null }]` guide singole in auto di oggi (Europa/Roma) |
| GET | `/road/history?from&to&instructorId&studentId&cursor&limit` | titolare | `{ items: [Session+{lesson, markerCount, markerKinds}], nextCursor }` |

Tipi:
- `Lesson` = `{ appointmentId, startsAt, endsAt, status, student: {id,name}|null, instructor: {id,name,color,phone}|null, vehicle: {id,name,plate}|null, carColor }` — `phone` serve al «Chiama» del titolare; all'allievo arriva sempre `null`. `carColor` = chiave della variante colore dell'auto 3D, già risolta dal server (vedi «Colore delle auto»).
- `Session` = `{ id, appointmentId, status, startedAt, endedAt, distanceMeters, durationSec, lastSeq, last: {lat,lng,speed,heading,street,at}|null }`
- `Marker` = `{ id, clientId, kind, label, note, lat, lng, street, recordedAt }`
- `Detail` = `Session + { lesson, markers: Marker[], track: [[lat,lng,tMs]], evaluation?: { items: [{label, scaleMax, score, notApplicable}], updatedAt } | null }`

«Titolare» = membership `admin` o ruolo OWNER/INSTRUCTOR_OWNER.

## File
- `lib/autoscuole/road/catalog.ts` — catalogo segnalazioni, parse custom, etichette.
- `lib/autoscuole/road/geo.ts` — punti, distanza (haversine con filtri).
- `lib/autoscuole/road/service.ts` — tutta la logica delle route (auth, regole).
- `lib/autoscuole/road/maintenance.ts` — chiusura sessioni orfane + retention (prisma iniettato, usato dal job).
- `trigger/autoscuole-road-maintenance.ts` — job ogni 15 min (va in prod con `pnpm trigger:deploy:prod`, **dopo** `migrate:prod`).
- `app/api/autoscuole/road/**` — route sottili.
- Backoffice: card «Reglo Road» in `components/pages/Backoffice/BackofficeCompaniesPage.tsx`.
- Test: `tests/unit/road/road-geo.test.ts`, e2e web `tests/e2e/reg638-road.auth.spec.ts`.

## Web (titolare)
Visibile solo con `isRoadEnabled(services)` (`lib/services.ts`: `roadEnabled === true` e mai per consorzio / solo Segretaria / consorziata senza Reglo). Senza modulo le pagine rimandano all'agenda.

- **Barra**: voce «Road» tra Allievi e Segretaria (`AutoscuoleNav.tsx`, icona `public/images/nav/road-3d.png`), pagina vera `/[locale]/user/autoscuole/road` come la Segretaria.
- **Pagina** `components/pages/Autoscuole/road/AutoscuoleRoadPage.tsx`: header + segmented «Dal vivo / Guide di oggi / Storico», vista in `?view=` (`live` di default). Rotta `app/[locale]/user/(autoscuole)/autoscuole/road/page.tsx`.
  - **Dal vivo** `RoadLiveView.tsx` (caricata con `dynamic(..., { ssr:false })`): pannello «In giro adesso» (KPI, righe istruttore con auto 3D e badge nella tinta, via, minuti, pillola segnalazioni, barra di avanzamento sulla durata; «In sede» con «Libera fino alle HH:MM») + mappa (percorsi nella tinta dell'istruttore al 55%, selezionato nero 6.5 px; auto `auto-su.png` ruotata con `last.heading`; etichetta «Nome · Allievo»; sede; ultime segnalazioni; legenda; zoom). Click su riga o auto = selezione + card «Guida in corso» (km, km/h, segnalazioni, ultime 2, «Apri la guida», «Chiama» solo se l'istruttore ha un telefono).
  - **Polling**: `GET /road/live` ogni 5 s **solo a scheda visibile** (si ferma su `visibilitychange` e riparte subito al ritorno). Per ogni sessione attiva: primo giro `track?afterSeq=-1`, poi solo i delta (`afterSeq=lastSeq`) quando `session.lastSeq` cresce. Lo spostamento dell'auto è interpolato in ~1 s (`animateCar`, requestAnimationFrame). L'inquadratura si fa una volta sola (lascia 400 px a destra per la card).
  - **Guide di oggi** `RoadTodayView.tsx` (`/road/today`, refresh 30 s): stato Road Da iniziare / In corso / Completata / Non registrata (passata senza sessione) / Chiusa in automatico; click → dettaglio se c'è sessione.
  - **Storico** `RoadHistoryView.tsx` (`/road/history`, 20 per pagina, «Carica altre» a cursore): filtri istruttore, allievo, periodo (7/30/90 giorni o da sempre).
- **Dettaglio** `RoadSessionDetail.tsx` (rotta `road/[sessionId]?from=live|today|history`, guardia in `RoadSessionDetailPage.tsx`): breadcrumb, titolo, chip stato, «Apri in agenda» (`?tab=agenda&date=YYYY-MM-DD`), mappa con percorso nero, partenza e segnalazioni numerate, 3 numeri, segnalazioni in ordine di tempo (con nota «…»), pagellino (stelle `#FACC15`) o «Pagellino non compilato», nota su cosa vede l'allievo (`studentNotesEnabled`). Se la sessione è attiva si ricarica ogni 5 s a scheda visibile.
- **Mappa** `road/road-map.ts`: `maplibre-gl` 4.7 con import dinamico (solo browser) + tile **solo** `https://tiles.openfreemap.org/styles/liberty`, ricolorate come `roadStyle()` del prototipo (niente POI/città, etichette `name:it`). **Attribuzione** OpenFreeMap / © OpenMapTiles / OpenStreetMap sempre visibile (controllo compatto in basso a destra; zoom spostato sopra). Gotcha: il contenitore della mappa riceve `position:relative` da MapLibre (va dentro un wrapper `absolute`), e la radice di un Marker non deve avere `position`/`transform` propri (stili e rotazione stanno sui figli, vedi `.road-*` in `road-ui.tsx`).
- **Simboli** `lib/autoscuole/road/symbols.ts`: chiave base → `public/images/road/*.png` (stop→s-stop, precedenza→s-prec, distanza→s-dist, velocita→f-vel, semaforo→f-sem, rotonda→f-rot, svolta→f-svo, corsia→f-cor, pedoni→f-ped, specchietti→f-spe, parcheggio→f-par, altro→f-alt, `custom:*`→f-cus). Client tipizzato delle API: `lib/autoscuole/road/client.ts`.
- **Impostazioni** › «Reglo Road» (`RoadSettingsPane.tsx`, voce con badge «Nuovo» in `AutoscuoleResourcesPage.tsx`, solo con modulo acceso): griglia delle 12 segnalazioni base (sola lettura) e «Le tue segnalazioni» (aggiungi / rinomina / togli, max 12, label max 40, id `crypto.randomUUID().slice(0,8)`), salvataggio immediato con toast. › Prenotazioni e allievi › App allievi: il toggle si chiama «Mostra note e percorsi nell'app allievi».
- **Dati di prova (solo dev)**: `scripts/seed-reg638-road.ts` (3 guide in corso con percorsi veri di Torino da `scripts/fixtures/reg638-routes.json`, guide di oggi, storico, pagellino; `--drive` muove le auto per ~60 s, `--cleanup` toglie tutto).

## Colore delle auto (2026-10-27)

- **Setting**: `AutoscuolaVehicle.color` (nullable, migrazione `20261031120000_reglo_road_vehicle_color`), campo «Colore» nella scheda veicolo (Impostazioni › Veicoli › Dettagli), visibile solo con Road acceso. Componente `components/pages/Autoscuole/road/VehicleColorField.tsx`, salvato da `updateAutoscuolaVehicle` (`color`: chiave o `null`).
- **Palette**: `lib/autoscuole/road/car-colors.ts` — 10 chiavi (bianco, argento, grigio, nero, rosso, arancio, giallo, verde, azzurro, blu). Le chiavi sono contratto con la mobile.
- **Risoluzione** (`resolveCarColor`): colore del veicolo → variante più vicina alla tinta dell'istruttore (solo varianti colorate) → bianco. Lato server in `lessonDTO` e in `atBase`.
- **Immagini**: varianti pre-generate (niente filtri CSS) in `public/images/road/cars/auto-{su,34}-<chiave>.png`; helper web `roadCarImages(key)` in `symbols.ts`. Mobile: `assets/road/cars/`, stesse chiavi. Generate ricolorando solo la carrozzeria dell'auto bianca (ombre e riflessi conservati; vetri, gomme, cerchioni e insegna intatti).
- **Icona nav «Road»**: `public/images/nav/road-3d.png` = segnaposto rosso su tratto di strada (Gemini, stile icone 3D della barra), 128px.

## QA 27/10 sera — segno, minuti di guida, Road nel dettaglio allievo

- **Segno delle segnalazioni**: `RoadMarker.sentiment` (`"good"` | `"bad"` | null, migrazione `20261031130000_reglo_road_marker_sentiment`). `POST /markers` accetta `sentiment`; `normalizeSentiment` in `catalog.ts`. Le liste (live/today/history) hanno `markerGood` / `markerBad` oltre a `markerCount`. Web: segnaposto con bordo verde/rosso (`.road-sg.good/.bad`), `SymbolTile sentiment`, `SentimentCounts`, `MarkerPill good/bad`.
- **Minuti di guida**: `drivingSeconds(startedAt, end, lessonStartsAt)` in `geo.ts` — dall'inizio della guida se in Road si entra dopo. Calcolato alla lettura in `sessionDTO` (vale anche per sessioni già chiuse) e salvato in `finalizeRoadSession`.
- **Road nel dettaglio allievo (web)**: `GET /road/students/[id]` → `getRoadForStudent` (titolare: tutte; istruttore: le sue; con miniatura `thumb` ≤ 60 punti). `components/pages/Autoscuole/road/StudentRoad.tsx`: `useStudentRoad`, `StudentRoadStrip` (miniatura montata solo a schermo), `StudentRoadPanel` (percorso dentro il pannello «Note» di `AutoscuoleStudentsPage`: dal 27/10 la striscia sta sotto la nota di ogni guida, perché «Guide» è il tab contabile).

## Road libero — «Avvia guida» senza guida in agenda (piano A, 28/10)

Piano approvato: `plans/road/002-road-libero.md` (accesso A2, tab «Road»).

- **Nessuna impostazione** (decisione di Tiziano, 28/10): se Road è acceso per l'autoscuola, la tab «Road» e «Avvia guida» ci sono sempre. `GET /road/state` espone ancora `freeStartEnabled` (= `roadEnabled`) solo per le app 2.4.0 che lo leggono.
- **`GET /road/free`** → durate dell'istruttore (cluster → autoscuola), auto (pool + esclusive sue, niente moto; `busy` + `busyWith` = istruttore se impegnate adesso; `mine` = esclusiva o preferita dell'istruttore → «la tua»), `blockedStudentIds` (prenotazioni bloccate adesso, la mobile lo scrive nella lista allievi), `defaultVehicleId` (esclusiva → preferita → ultima usata → prima libera), allievi recenti, `currentLesson` (la sua guida di adesso), `todayCount`, `nextLessonAt`.
- **`POST /road/free { studentId, vehicleId, durationMin, confirmWeeklyLimit?, confirmNoBuffer? }`** → crea la guida VERA passando da `createAutoscuolaAppointment` (stessi controlli dell'agenda: conflitti istruttore/allievo/veicolo, crediti, pagamento, limite settimanale, pausa), da adesso al minuto, `status: checked_in`, poi `bookingSource: "road"`, e apre la sessione Road (`startRoadSession`). Codici: `ROAD_DISABLED`, `ACTIVE_SESSION`, `CURRENT_LESSON` (+ `lesson`: la mobile propone «Entra in Road» su quella), `STUDENT_BLOCKED_CONFIRM` (allievo con prenotazioni bloccate: come in agenda per REG-499 non blocca, si conferma con `confirmStudentBlocked`; dal 28/10, prima bloccava), `VEHICLE_RESERVED`, `NOT_ELIGIBLE`, `WEEKLY_LIMIT_CONFIRM` / `LESSON_BUFFER_CONFIRM` (la mobile chiede «Procedi comunque» e richiama col flag).
- **Fine**: «Termina guida» su una guida `bookingSource: "road"` riporta `endsAt` all'ora reale arrotondata ai 5' (min 5', mai oltre la fine prenotata: dopo può esserci un'altra guida) — `freeLessonEnd` in `geo.ts`. **Prezzo e crediti restano quelli fissati alla creazione** con la durata scelta (scelta voluta: ricalcolare dopo toccherebbe pagamenti già registrati).
- **Agenda web**: i blocchi delle guide nate da Road hanno «Road ·» nella riga dell'orario (`bookingSource` ora viaggia nel bootstrap agenda). KPI backoffice: `road` conta come «Staff (agenda)».
- Test: `tests/unit/road/road-free-start.test.ts`.

## Percorsi d'esame e giro — modello e API (REG-641, 29/10)

Piano: `plans/road/003-punti-critici-e-giro.md` (punti critici, percorsi d'esame, giro della prossima guida; task REG-641 → REG-651).

- **Migrazione `20261103120000_road_exam_routes`** (solo additiva):
  - tabella `RoadExamRoute` — percorso d'esame dell'autoscuola: `name`, `examSite?`, `licenseCategories[]`, `waypoints` (punti messi dal titolare, per riaprire l'editor), `path` (linea che segue le strade, semplificata a ~10 m), `lengthMeters`, `sourceSessionId?` (guida Road di origine, senza FK: le sessioni si cancellano dopo 12 mesi, il percorso resta), `createdById?`, `archivedAt?`. Non scade, si archivia.
  - colonne `RoadSession.plan` / `RoadSession.planReached` (Json, nullable): tappe del giro scelte alla partenza e quelle raggiunte (le scrive REG-648).
- **Logica pura** `lib/autoscuole/road/exam-routes.ts`: `parseExamRouteInput` (crea / modifica parziale; max 25 punti, nome ≤ 60, sede ≤ 80, patenti maiuscole senza doppioni), `simplifyPath` (Douglas-Peucker in metri), `pathLengthMeters`. La linea si semplifica e la lunghezza si ricalcola **sempre sul server**.
- **Service** `lib/autoscuole/road/exam-routes-service.ts` (usa `roadContext` / `canSeeAll` esportati da `service.ts`): leggere = titolare e istruttori (servono a punti critici e giro); scrivere = solo titolare/admin; tutto spento senza Road.

| Metodo | Path | Chi | Cosa |
|---|---|---|---|
| GET | `/road/exam-routes?archived=1` | titolare, istruttore | percorsi attivi (con `archived=1` anche gli archiviati, solo titolare) |
| POST | `/road/exam-routes` `{ name, examSite?, licenseCategories?, waypoints, path, sourceSessionId? }` | titolare | crea → `RoadExamRouteDTO` |
| PATCH | `/road/exam-routes/[id]` (campi parziali, `restore: true` toglie dall'archivio) | titolare | modifica |
| DELETE | `/road/exam-routes/[id]` | titolare | archivia → `{ archived: true }` |

Codici: `ROAD_DISABLED`, `FORBIDDEN`, `INVALID`, `NOT_FOUND`. Test: `tests/unit/road/road-exam-routes.test.ts`, e2e API `tests/e2e/reg641-road-exam-routes.auth.spec.ts`. 

### Aggancio alle strade e scorciatoia da guida Road (REG-642, 29/10)

- **`lib/autoscuole/road/snap.ts`** — `snapWaypoints(waypoints)`: ogni tratto fra due punti consecutivi diventa la strada in auto (Google Routes API `computeRoutes`, `TRAFFIC_UNAWARE`, punti intermedi come tappe → una «leg» per tratto; chiave server `GOOGLE_MAPS_API_KEY`, la stessa del proxy Places, abilitata il 29/10). Ogni tratto è semplificato a ~10 m.
- **Costo contenuto** (si paga a richiesta):
  - cache Redis per tratto `road:snap:v1:<lat,lng>><lat,lng>` (coordinate a 5 decimali ≈ 1 m, TTL 90 giorni; niente companyId né APP_ENV perché le strade sono uguali in ogni ambiente) → spostare un punto ricalcola solo i due tratti che lo toccano;
  - i tratti mancanti consecutivi vanno in una richiesta sola, al massimo 10 intermedi (oltre Google applica la tariffa Advanced): `planSnapRuns`;
  - il client (editor REG-645) chiama solo quando un punto viene lasciato o al salvataggio, con debounce, mai al movimento del mouse.
- Errori espliciti, mai una linea dritta salvata di nascosto: `SNAP_UNAVAILABLE` (Google non risponde, timeout 10 s, chiave assente), `NO_ROUTE` (nessuna strada in auto fra due punti).
- Scorciatoia: `examRouteFromSession` prende il tracciato GPS (`loadRoadTrack`) fra `fromMs` e `toMs` (istanti dei punti, quelli del `track` del dettaglio sessione; assenti = tutta la guida) → `path` semplificata + `waypoints` (≤ 25, `waypointsFromTrack` con tolleranza crescente) per riaprirla nell'editor.

| Metodo | Path | Chi | Cosa |
|---|---|---|---|
| POST | `/road/exam-routes/snap` `{ waypoints }` | titolare | `{ segments: LatLng[][], path, lengthMeters }` (la `path` si passa così com'è al POST/PATCH) |
| POST | `/road/exam-routes/from-session` `{ sessionId, fromMs?, toMs? }` | titolare | bozza `{ sourceSessionId, waypoints, path, lengthMeters }` |

Codici in più: `SNAP_UNAVAILABLE`, `NO_ROUTE`. Test: `tests/unit/road/road-snap.test.ts` (Google e cache finti: raggruppamento, solo i tratti toccati, errori), e2e `tests/e2e/reg642-road-snap.auth.spec.ts` (una chiamata vera, la seconda dalla cache).

### Punti critici — calcolo e API (REG-643, 29/10)

- **Logica pura** `lib/autoscuole/road/hotspots.ts`:
  - `clusterMarkers`: segnalazioni «da migliorare» (`sentiment = bad`) dello stesso tipo entro **60 m** dal centro del gruppo; raggruppamento goloso e deterministico (ordine di tempo, poi id), il centro è la media. **La via non divide i gruppi**: a un incrocio la stessa manovra finisce ora su una via ora sull'altra; la via più frequente dà il nome.
  - soglia fissa **≥ 3 errori da ≥ 2 allievi** (`HOTSPOT_MIN_ERRORS` / `HOTSPOT_MIN_STUDENTS`);
  - `examRoutes`: percorsi d'esame attivi che passano a ≤ **50 m** dal centro (`distanceToPathMeters`);
  - `key` = `tipo~lat~lng` (centro a 4 decimali); `findHotspot` la ritrova anche se il centro si è spostato di poco (stesso tipo, entro 60 m);
  - `parseHotspotFilters`: periodo mai oltre i 12 mesi di conservazione (default: ultimi 12 mesi), `instructorId` uuid, `license` maiuscola, `kind`.
- **Service** `lib/autoscuole/road/hotspots-service.ts`: titolare/admin = tutta l'autoscuola; **istruttore** = stessa mappa aggregata, ma nel dettaglio solo le guide sue (`hiddenSessions` conta le altre); allievo = `FORBIDDEN`. Funziona con cookie web e con token mobile (REG-646).
- **Cache**: lista in Redis 10 min per autoscuola + filtri nel nuovo segmento `AUTOSCUOLE_CACHE_SEGMENTS.ROAD`; i percorsi d'esame (crea / modifica / archivia) lo invalidano, così il segno «sul percorso d'esame» è subito giusto. Il dettaglio si calcola al tocco.

| Metodo | Path | Chi | Cosa |
|---|---|---|---|
| GET | `/road/hotspots?from&to&instructorId&license&kind` | titolare, istruttore | `{ from, to, hotspots: Hotspot[], totalErrors, examRoutes }` (`totalErrors` conta anche le segnalazioni sotto soglia: serve allo stato vuoto) |
| GET | `/road/hotspots/[key]` (stessi filtri) | titolare, istruttore | `{ hotspot, sessions[{ id, startedAt, student, instructor, errors, lastAt }], students[{ id, name, errors }], hiddenSessions }` |

`Hotspot` = `{ key, kind, label, lat, lng, street, errors, students, sessions, lastAt, examRoutes[{ id, name }] }`, ordinati per errori, poi allievi, poi il più recente. Test: `tests/unit/road/road-hotspots.test.ts`, e2e `tests/e2e/reg643-road-hotspots.auth.spec.ts` (servono i dati di prova di `scripts/seed-road-hotspots.ts`, vedi `docs/STAGING.md` › Reglo Road su staging).
