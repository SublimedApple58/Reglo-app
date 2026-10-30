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
| GET | `/road/state` | istruttore | `{ roadEnabled, planEnabled, planAlertsEnabled, catalog: { base: [{key,label}], custom: [{id,label}] }, activeSession: Session+{lesson} \| null, eligibleLesson: Lesson \| null }` |
| POST | `/road/sessions` `{ appointmentId, plan? }` | istruttore della guida | crea o **riprende** (`resumed: true`) → `Session + { lesson, resumed }` |
| GET | `/road/sessions/[id]` | istruttore della guida, titolare | `Detail` |
| POST | `/road/sessions/[id]/points` `{ seq, points, street? }` | istruttore | `{ accepted, duplicate? , reason? }` — `accepted:false, reason:"SESSION_CLOSED"` se chiusa |
| POST | `/road/sessions/[id]/markers` `{ clientId, kind, label?, note?, lat, lng, street?, recordedAt? }` | istruttore | `Marker` (idempotente su clientId; accettato fino a 2 h dopo la chiusura) |
| DELETE | `/road/sessions/[id]/markers/[markerId\|clientId]` | istruttore | `{ removed: true }` («Annulla») |
| POST | `/road/sessions/[id]/hotspot-checks` `{ clientId, hotspotKey, kind, label, lat, lng, outcome: "better"\|"worse", recordedAt }` | istruttore | `{ id, clientId }` ripasso «Meglio / No» su un punto critico dell'allievo (REG-677; idempotente su clientId, fino a 2 h dopo la chiusura) |
| DELETE | `/road/sessions/[id]/hotspot-checks/[checkId\|clientId]` | istruttore | `{ removed: true }` («Annulla», REG-677) |
| POST | `/road/sessions/[id]/end` | istruttore | chiude + guida `completed` → `Detail` |
| GET | `/road/sessions/[id]/track?afterSeq=n` | titolare | `{ lastSeq, points: [[lat,lng,tMs]] }` (solo lotti nuovi) |
| GET | `/road/appointments/[appointmentId]` | allievo (con setting), istruttore, titolare | `Detail \| null` |
| GET | `/road/live` | titolare | `{ now, base: {name,lat,lng}\|null, sessions: [Session+{lesson, markerCount, markerKinds, recentMarkers}], atBase: [{id,name,plate,carColor,freeUntil}] }` |
| GET | `/road/today` | titolare | `[Lesson + { road: Session+{markerCount, markerKinds} \| null }]` guide singole in auto di oggi (Europa/Roma) |
| GET | `/road/history?from&to&instructorId&studentId&cursor&limit` | titolare | `{ items: [Session+{lesson, markerCount, markerKinds}], nextCursor }` |
| GET | `/road/plan?studentId&durationMin&lat&lng` | istruttore | `{ planEnabled, planAlertsEnabled, plan: { stops: PlanStop[], minutes } \| null, studentHotspots }` (REG-648) |
| POST | `/road/plan/route` `{ start: {lat,lng}, stops, optimize? }` | istruttore | `{ line: [[lat,lng]] \| null, lengthMeters, order: string[], end: {lat,lng} \| null, steps: RoadStep[] }` linea suggerita chiusa in sede, ordine delle tappe (REG-648, REG-653), svolte (REG-676) |

Tipi:
- `Lesson` = `{ appointmentId, startsAt, endsAt, status, student: {id,name}|null, instructor: {id,name,color,phone}|null, vehicle: {id,name,plate}|null, carColor }` — `phone` serve al «Chiama» del titolare; all'allievo arriva sempre `null`. `carColor` = chiave della variante colore dell'auto 3D, già risolta dal server (vedi «Colore delle auto»).
- `Session` = `{ id, appointmentId, status, startedAt, endedAt, distanceMeters, durationSec, lastSeq, last: {lat,lng,speed,heading,street,at}|null, plan: { stops, minutes, chosenAt } | null, planReached: { reached: string[], total } | null }` (`plan`/`planReached` da REG-648; all'allievo arrivano sempre `null`)
- `Marker` = `{ id, clientId, kind, label, note, lat, lng, street, recordedAt }`
- `Detail` = `Session + { lesson, markers: Marker[], hotspotChecks: HotspotCheck[], track: [[lat,lng,tMs]], evaluation?: { items: [{label, scaleMax, score, notApplicable}], updatedAt } | null }`
- `HotspotCheck` = `{ id, clientId, hotspotKey, kind, label, lat, lng, outcome: "better"|"worse", recordedAt }` (REG-677)
- `RoadStep` = `{ lat, lng, maneuver, text }` (REG-676)

«Titolare» = membership `admin` o ruolo OWNER/INSTRUCTOR_OWNER.

## File
- `lib/autoscuole/road/catalog.ts` — catalogo segnalazioni, parse custom, etichette.
- `lib/autoscuole/road/geo.ts` — punti, distanza (haversine con filtri).
- `lib/autoscuole/road/service.ts` — tutta la logica delle route (auth, regole).
  ⚠️ Si porta dietro l'autenticazione (`requireServiceAccess` → `@/auth` → `next-auth`): ogni modulo che la importa (`hotspots-service`, `lesson-plan-service`, `plan-service`) non si carica in uno script fuori da Next senza dirottare `next-auth`. Come fare: `docs/STAGING.md` › Reglo Road › «Script che chiamano i service Road».
- `lib/autoscuole/road/maintenance.ts` — chiusura sessioni orfane + retention (prisma iniettato, usato dal job).
- `trigger/autoscuole-road-maintenance.ts` — job ogni 15 min (va in prod con `pnpm trigger:deploy:prod`, **dopo** `migrate:prod`).
- `app/api/autoscuole/road/**` — route sottili.
- Backoffice: card «Reglo Road» in `components/pages/Backoffice/BackofficeCompaniesPage.tsx`.
- Test: `tests/unit/road/road-geo.test.ts`, e2e web `tests/e2e/reg638-road.auth.spec.ts`.

## Web (titolare)
Visibile solo con `isRoadEnabled(services)` (`lib/services.ts`: `roadEnabled === true` e mai per consorzio / solo Segretaria / consorziata senza Reglo). Senza modulo le pagine rimandano all'agenda.

- **Barra**: voce «Road» tra Allievi e Segretaria (`AutoscuoleNav.tsx`, icona `public/images/nav/road-3d.png`), pagina vera `/[locale]/user/autoscuole/road` come la Segretaria.
- **Pagina** `components/pages/Autoscuole/road/AutoscuoleRoadPage.tsx`: header + segmented «Dal vivo / Guide di oggi / Storico / Punti critici», vista in `?view=` (`live` di default). Rotta `app/[locale]/user/(autoscuole)/autoscuole/road/page.tsx`.
  - **Dal vivo** `RoadLiveView.tsx` (caricata con `dynamic(..., { ssr:false })`): pannello «In giro adesso» (KPI, righe istruttore con auto 3D e badge nella tinta, via, minuti, pillola segnalazioni, barra di avanzamento sulla durata; «In sede» con «Libera fino alle HH:MM») + mappa (percorsi nella tinta dell'istruttore al 55%, selezionato nero 6.5 px; auto `auto-su.png` ruotata con `last.heading`; etichetta «Nome · Allievo»; sede; ultime segnalazioni; legenda; zoom). Click su riga o auto = selezione + card «Guida in corso» (km, km/h, segnalazioni, ultime 2, «Apri la guida», «Chiama» solo se l'istruttore ha un telefono).
  - **Polling**: `GET /road/live` ogni 5 s **solo a scheda visibile** (si ferma su `visibilitychange` e riparte subito al ritorno). Per ogni sessione attiva: primo giro `track?afterSeq=-1`, poi solo i delta (`afterSeq=lastSeq`) quando `session.lastSeq` cresce. Lo spostamento dell'auto è interpolato in ~1 s (`animateCar`, requestAnimationFrame). L'inquadratura si fa una volta sola (lascia 400 px a destra per la card).
  - **Guide di oggi** `RoadTodayView.tsx` (`/road/today`, refresh 30 s): stato Road Da iniziare / In corso / Completata / Non registrata (passata senza sessione) / Chiusa in automatico; click → dettaglio se c'è sessione.
  - **Storico** `RoadHistoryView.tsx` (`/road/history`, 20 per pagina, «Carica altre» a cursore): filtri istruttore, allievo, periodo (7/30/90 giorni o da sempre).
  - **Punti critici** `RoadHotspotsView.tsx` (REG-644, `?view=hotspots`, caricata con `dynamic(..., { ssr:false })`): filtri periodo (30 giorni / 3 mesi / anno, default 3 mesi), istruttore, patente (dalle categorie dei veicoli, nascosto se ce n'è una sola), tipo di errore (base + personalizzate). Mappa: aloni di calore (`circle` con `circle-blur`, raggio e opacità in base agli errori; rosso = metà o più del punto peggiore, arancio = alcuni), puntine numerate nere, percorsi d'esame tratteggiati sotto il calore (`GET /road/exam-routes`), legenda. Pannello: lista numerata (via, tipo, «sul percorso d'esame», errori, allievi) → dettaglio del punto (errori / allievi / guide, percorso d'esame, allievi che ci sbagliano, le guide → dettaglio guida con `from=hotspots`, «Tutti i punti» per tornare). Stato vuoto con le segnalazioni «da migliorare» ancora isolate. Transizioni 200–280 ms `cubic-bezier(0.2,0,0,1)`, senza rimbalzo, mai spente da «Riduci movimento» (MapLibre con `essential: true`). A 390 px: segmented che scorre (la voce attiva si centra), filtri su due colonne, pannello sotto la mappa (al tocco di un punto la pagina ci scorre).
- **Dettaglio** `RoadSessionDetail.tsx` (rotta `road/[sessionId]?from=live|today|history`, guardia in `RoadSessionDetailPage.tsx`): breadcrumb, titolo, chip stato, «Usa come percorso d'esame» (REG-645, solo titolare = `company.role === "admin"`, guida chiusa con tracciato), «Apri in agenda» (`?tab=agenda&date=YYYY-MM-DD`), mappa con percorso nero, partenza e segnalazioni numerate, 3 numeri, segnalazioni in ordine di tempo (con nota «…»), il giro con le tappe raggiunte (REG-651, se la guida ne aveva uno), pagellino (stelle `#FACC15`) o «Pagellino non compilato», nota su cosa vede l'allievo (`studentNotesEnabled`). Se la sessione è attiva si ricarica ogni 5 s a scheda visibile.
- **Mappa** `road/road-map.ts`: `maplibre-gl` 4.7 con import dinamico (solo browser) + tile **solo** `https://tiles.openfreemap.org/styles/liberty`, ricolorate come `roadStyle()` del prototipo (niente POI/città, etichette `name:it`). **Attribuzione** OpenFreeMap / © OpenMapTiles / OpenStreetMap sempre visibile (controllo compatto in basso a destra; zoom spostato sopra). Gotcha: il contenitore della mappa riceve `position:relative` da MapLibre (va dentro un wrapper `absolute`), e la radice di un Marker non deve avere `position`/`transform` propri (stili e rotazione stanno sui figli, vedi `.road-*` in `road-ui.tsx`).
- **Simboli** `lib/autoscuole/road/symbols.ts`: chiave base → `public/images/road/*.png` (stop→s-stop, precedenza→s-prec, distanza→s-dist, velocita→f-vel, semaforo→f-sem, rotonda→f-rot, svolta→f-svo, corsia→f-cor, pedoni→f-ped, specchietti→f-spe, parcheggio→f-par, altro→f-alt, `custom:*`→f-cus). Client tipizzato delle API: `lib/autoscuole/road/client.ts`.
- **Impostazioni** › «Reglo Road» (`RoadSettingsPane.tsx`, voce con badge «Nuovo» in `AutoscuoleResourcesPage.tsx`, solo con modulo acceso): griglia delle 12 segnalazioni base (sola lettura) e «Le tue segnalazioni» (aggiungi / rinomina / togli, max 12, label max 40, id `crypto.randomUUID().slice(0,8)`), salvataggio immediato con toast. In cima «Il giro» con i due interruttori (REG-651). Sotto, «I tuoi percorsi d'esame» (REG-645, `road/RoadExamRoutesSection.tsx`). › Prenotazioni e allievi › App allievi: il toggle si chiama «Mostra note e percorsi nell'app allievi».
- **Dati di prova (solo dev)**: `scripts/seed-reg638-road.ts` (3 guide in corso con percorsi veri di Torino da `scripts/fixtures/reg638-routes.json`, guide di oggi, storico, pagellino; `--drive` muove le auto per ~60 s, `--cleanup` toglie tutto).

## Colore delle auto (2026-10-27)

- **Setting**: `AutoscuolaVehicle.color` (nullable, migrazione `20261031120000_reglo_road_vehicle_color`), campo «Colore» nella scheda veicolo (Impostazioni › Veicoli › Dettagli), visibile solo con Road acceso. Componente `components/pages/Autoscuole/road/VehicleColorField.tsx`, salvato da `updateAutoscuolaVehicle` (`color`: chiave o `null`).
- **Palette**: `lib/autoscuole/road/car-colors.ts` — 10 chiavi (bianco, argento, grigio, nero, rosso, arancio, giallo, verde, azzurro, blu). Le chiavi sono contratto con la mobile.
- **Risoluzione** (`resolveCarColor`): colore del veicolo → variante più vicina alla tinta dell'istruttore (solo varianti colorate) → bianco. Lato server in `lessonDTO` e in `atBase`.
- **Immagini**: varianti pre-generate (niente filtri CSS) in `public/images/road/cars/auto-{su,34}-<chiave>.png`; helper web `roadCarImages(key)` in `symbols.ts`. Mobile: `assets/road/cars/`, stesse chiavi. Generate ricolorando solo la carrozzeria dell'auto bianca (ombre e riflessi conservati; vetri, gomme, cerchioni e insegna intatti). **Dal 30/10/2026 (REG-672) sono le STESSE della mobile** (`reglo-mobile/assets/road/cars/*@3x.png`: 3/4 240×195, dall'alto 90×138), scelta di Tiziano.
- **Icona nav «Road»**: `public/images/nav/road-3d.png` = segnaposto rosso su tratto di strada (Gemini, stile icone 3D della barra), 128px.

## QA 27/10 sera — segno, minuti di guida, Road nel dettaglio allievo

- **Segno delle segnalazioni**: `RoadMarker.sentiment` (`"good"` | `"bad"` | null, migrazione `20261031130000_reglo_road_marker_sentiment`). `POST /markers` accetta `sentiment`; `normalizeSentiment` in `catalog.ts`. Le liste (live/today/history) hanno `markerGood` / `markerBad` oltre a `markerCount`. Web: segnaposto con bordo verde/rosso (`.road-sg.good/.bad`), `SymbolTile sentiment`, `SentimentCounts`, `MarkerPill good/bad`.
- **Minuti di guida**: `drivingSeconds(startedAt, end, lessonStartsAt)` in `geo.ts` — dall'inizio della guida se in Road si entra dopo. Calcolato alla lettura in `sessionDTO` (vale anche per sessioni già chiuse) e salvato in `finalizeRoadSession`.
- **Road nel dettaglio allievo (web)**: `GET /road/students/[id]` → `getRoadForStudent` (titolare: tutte; istruttore: le sue; con miniatura `thumb` ≤ 60 punti). Dal REG-660 (30/10, per il foglio «Road di <allievo>» dell'app, piano `plans/road/005-road-mobile-redesign.md`) risponde `{ items, briefing, hotspots }`: ogni guida ha anche `startedAt` (c'era già da `sessionDTO`) ed `evaluation: { done, total } | null` (voci valutate o «non applicabile» su voci attive, `evaluationProgress`; null col pagellino spento); `hotspots` = i suoi errori ripetuti (`loadStudentHotspots`, import dinamico per evitare il giro di import con `lesson-plan-service`). Solo campi aggiunti. Test: e2e `reg660-road-student.auth.spec.ts`. `components/pages/Autoscuole/road/StudentRoad.tsx`: `useStudentRoad`, `StudentRoadStrip` (miniatura montata solo a schermo), `StudentRoadPanel` (percorso dentro il pannello «Note» di `AutoscuoleStudentsPage`: dal 27/10 la striscia sta sotto la nota di ogni guida, perché «Guide» è il tab contabile).

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

### Punti critici — vista web (REG-644, 29/10)

Vedi la riga «Punti critici» nella sezione Web. File: `components/pages/Autoscuole/road/RoadHotspotsView.tsx`, client `roadApi.hotspots` / `hotspot` / `examRoutes` (`lib/autoscuole/road/client.ts`). Test: e2e `tests/e2e/reg644-road-hotspots-web.auth.spec.ts` (dati di prova `scripts/seed-road-hotspots.ts`). Screenshot: Chromium headless non ha WebGL, per vedere la mappa serve `--use-angle=swiftshader --enable-unsafe-swiftshader`.

### Percorsi d'esame — editor web (REG-645, 29/10)

- **Lista** in Impostazioni › Reglo Road › «I tuoi percorsi d'esame» (`road/RoadExamRoutesSection.tsx`): miniatura della forma, nome, sede · patenti · km; modifica (→ editor), archivia; «Archiviati (n)» apre l'elenco con «Ripristina» (`PATCH { restore: true }`); «Nuovo percorso». Stato vuoto che spiega anche la scorciatoia.
- **Editor a pagina intera** `road/RoadExamRouteEditor.tsx`, rotta `road/percorsi/[id]` (`nuovo` = nuovo; `nuovo?session=&fromMs=&toMs=` = da una guida; altrimenti l'id da modificare), guardia `RoadExamRouteEditorPage.tsx` (MapLibre solo nel browser). Clic sulla mappa = punto in fondo; clic sulla linea = punto in mezzo a quel tratto; trascina per spostare; X nella lista o Canc per togliere. Max 25 punti. Primo punto «P» (partenza), ultimo «A» (arrivo). Nome, sede d'esame, patenti (dai veicoli dell'autoscuola). Sede dell'autoscuola come riferimento (`GET /road/live` → `base`).
- **Aggancio e costo Google** (logica pura `lib/autoscuole/road/exam-route-editor.ts`): il client tiene i tratti agganciati per coppia di punti (`legKey`). Si chiama `POST /road/exam-routes/snap` solo 350 ms dopo che un punto è stato lasciato/aggiunto/tolto o al salvataggio, **mai durante il trascinamento** (lì i tratti toccati si disegnano dritti e tratteggiati, senza rete), e solo con i punti dei tratti mancanti (`missingLegRuns`: un pezzo consecutivo = una richiesta). Riaprendo un percorso la linea salvata si divide per punto (`splitPathAtWaypoints`), così spostare un punto ricalcola solo i suoi due tratti. Lato server resta la cache Redis per tratto (REG-642). Errore di Google = messaggio con «Riprova», niente linea dritta salvata.
- **Salvataggio**: `POST /road/exam-routes` o `PATCH /road/exam-routes/[id]` con `waypoints` + `path` (tratti uniti, il server semplifica a ~10 m e ricalcola i km). Se la geometria non è stata toccata (percorso riaperto o bozza da guida) si salva la linea così com'è, senza chiamare Google.
- **Scorciatoia** dal dettaglio guida: «Usa come percorso d'esame» → due maniglie «Inizio» / «Fine» che scorrono sul tracciato (`nearestIndex`), card con km e orari del tratto → «Continua» apre l'editor con la bozza di `POST /road/exam-routes/from-session`.
- Animazioni 200–260 ms `cubic-bezier(0.2,0,0,1)` (puntine, card, righe), mai spente da «Riduci movimento» (MapLibre `essential: true`). A 390 px: mappa sopra, pannello sotto, card del tratto compatta.
- Test: unit `tests/unit/road/road-exam-route-editor.test.ts`, e2e `tests/e2e/reg645-road-exam-route-editor.auth.spec.ts` (chiama davvero Google Routes per pochi tratti; archivia il percorso creato).

### Giro della prossima guida — motore (REG-647, 29/10)

Solo backend, nessuna API ancora: la espone REG-648 (che controlla ruolo, allievo dell'autoscuola e interruttori prima di chiamare qui).

- **Logica pura** `lib/autoscuole/road/lesson-plan.ts`:
  - `buildStudentHotspots(markers)`: **punti critici dell'allievo**, cioè i SUOI errori ripetuti (segnalazioni «da migliorare» raggruppate come `clusterMarkers`, stesso tipo entro 60 m, in almeno 2 guide diverse). Mai quelli dell'autoscuola. Servono alla tappa 1 e alla mappa in Road (REG-652). `studentErrorKinds` = i suoi tipi di errore dal più frequente.
  - `examRouteCoverage(path, tracks)`: quota del percorso d'esame (campionato ogni 10 m) passata entro 30 m dai tracciati delle sue guide; griglia di celle per restare veloce.
  - `buildLessonPlan(input)`: max 3 tappe per priorità: 1) punti dell'allievo (max 2 se ci sono le altre fonti); 2) punto critico dell'autoscuola per il suo errore più frequente, non già tra le sue tappe; 3) percorso d'esame meno coperto (sotto l'80%), tappa all'inizio del percorso, da lì si riparte dalla fine. Ordine «più vicina prima» dalla partenza (senza partenza: ordine di priorità). Minuti in linea d'aria a 25 km/h, 5 min di lavoro per tappa (il percorso d'esame: la sua lunghezza a 25 km/h); si tolgono le tappe meno importanti finché andata + lavoro + ritorno stanno nella durata della guida.
  - Ogni tappa (`PlanStop`): `key` (chiave del punto critico o `exam:<id>`, per `planReached`), `source`, `kind`, `title` (via o nome), `reason` («Precedenza da migliorare 3 volte in 2 guide», «Qui sbagliano in tanti: stop, 7 errori di 4 allievi», «Percorso d'esame fatto al 20%»), `minutes`, `lat/lng`, `endLat/endLng` per il percorso d'esame.
- **Loader** `lib/autoscuole/road/lesson-plan-service.ts`: `computeLessonPlan({ companyId, studentId, durationMin, start })` → `{ plan, studentHotspots }`; `loadStudentHotspots` per la sola mappa. Legge le segnalazioni «da migliorare» dell'allievo (12 mesi), i punti critici dell'autoscuola con `companyHotspots` (`hotspots-service.ts`, stessa cache della lista senza filtri) e, se ci sono percorsi d'esame, i tracciati delle ultime 30 guide dell'allievo (un punto ogni 3). Copertura in cache 10 minuti nel segmento `road`, chiave = allievo + guide + percorsi con `updatedAt`.
- Verificato su staging (Autoscuola Reglo, sola lettura): circa 0,7 s a freddo e 0,1 s dopo.
- Test: `tests/unit/road/road-lesson-plan.test.ts`.

### Giro della prossima guida — API, salvataggio e interruttori (REG-648, 29/10)

- **Interruttori** in `limits` (niente migrazione), **accesi se assenti**: `roadPlanEnabled` («Proponi il giro della prossima guida») e `roadPlanAlertsEnabled` («Avvisi delle tappe durante la guida»). `planSettings(limits)` in `lesson-plan.ts`. Esposti in `AutoscuolaSettingsData` e salvati da `updateAutoscuolaSettings` (UI web in REG-651); la mobile li legge da `/road/state` (`planEnabled`, `planAlertsEnabled`).
- **`GET /road/plan`** (`plan-service.ts › getRoadPlan`, solo istruttore, allievo dell'autoscuola, durata 15–240): giro proposto (`computeLessonPlan`) + `studentHotspots` (i suoi errori ripetuti, per la mappa in Road REG-652). Con «Proponi il giro» spento `plan: null`, i punti dell'allievo restano. Partenza = `lat/lng` del telefono, o la sede se mancano.
- **`POST /road/plan/route`** (`getRoadPlanRoute`): la **navigazione suggerita**. Pezzi (`planRoutePieces`): tratti partenza → tappe agganciati con `snapWaypoints` (Routes API + cache per tratto `road:snap:v1:*` di REG-642), i percorsi d'esame si usano come sono salvati e si riparte dalla loro fine. Una partenza entro 150 m dalla sede diventa la sede (`planStart`), così i tratti pescano dalla cache. La mobile la chiede **una volta** alla partenza; Google giù o nessuna strada = `line: null` (risposta riuscita, niente errore a schermo).
- **Salvataggio**: `POST /road/sessions` e `POST /road/free` accettano `plan` (le tappe scelte, come arrivano da `/road/plan`). `parseStoredPlan` tiene solo i campi noti, max 3 tappe; vuoto/assente = senza giro, malformato o interruttore spento = si parte senza giro (mai un errore). In ripresa di sessione il giro non si riscrive.
- **Esito**: a «Termina guida» `savePlanReached` scrive `RoadSession.planReached` = `{ reached: [key], total }`: tappa raggiunta se il tracciato passa entro 40 m; percorso d'esame se il tracciato lo copre almeno al 60%. Le sessioni chiuse come abbandonate dal job non lo calcolano.
- **Allievo**: non vede il giro (`plan`/`planReached` azzerati in `getRoadForAppointment`).
- Modifica al piano: il giro non entra in `/road/free` né in `eligibleLesson` (vedi registro del piano 003).
- Test: unit `tests/unit/road/road-lesson-plan.test.ts`; e2e `tests/e2e/reg648-road-plan.auth.spec.ts` (istruttore con token mobile, sola lettura; la linea chiama Google per pochi tratti).

### Giro chiuso in sede, ordine ottimizzato, sede geocodificata (REG-653, 29/10)

- **Sede** (`headquarters.ts › roadHeadquarters`): la `AutoscuolaLocation` di default non archiviata. Senza coordinate ma con l'indirizzo: geocodifica con **Places API (New) `places:searchText`** (stessa API e chiave server del proxy Places, niente Geocoding API da abilitare), cache Redis `road:geocode:v1:<indirizzo>` 90 giorni (il «non trovato» 1 giorno, un errore di Google non va in cache) e salvataggio sulla sede solo se indirizzo e coordinate non sono cambiati nel frattempo (`updateMany` condizionato). Niente ripieghi su altri luoghi (tolti in REG-655, vedi sotto).
- **Sede a portata** (`planEnd`, `PLAN_HQ_MAX_M` = 15 km): oltre 15 km dalla partenza la sede non chiude il giro (coordinate sbagliate, luogo di un'altra città, istruttore fuori zona), altrimenti il ritorno mangerebbe la guida e il giro resterebbe vuoto. Su staging è il caso normale: sede a Milano, dati a Torino (`docs/STAGING.md`).
- **Minuti e ordine della card** (`buildLessonPlan` con `end`): il giro conta il ritorno in **sede** (non più alla partenza; senza sede finisce all'ultima tappa). L'ordine è quello che fa meno strada in linea d'aria partenza → tappe → sede, provando tutte le combinazioni (max 3 tappe); a parità comincia dalla più vicina.
- **Linea** (`planRoutePieces(..., end)`): partenza → tappe (percorso d'esame come blocco: si entra dall'inizio, si riparte dalla fine) → sede.
- **Ordine sulle strade vere** (`plan-route.ts › optimizeStopOrder`): alla partenza una `computeRoutes` con `optimizeWaypointOrder` (tariffa più alta, quindi solo con sede e ≥ 2 tappe), ordine in cache `road:order:v1:<punti>` 90 giorni; i tratti della risposta vanno nella cache per tratto `road:snap:v1:*` (tranne quelli che escono dall'ingresso di un percorso d'esame), così la linea che segue non rifà richieste. Errore = ordine dato. `applyStopOrder` usa l'ordine di Google solo se è una permutazione valida.
- **`POST /road/plan/route`** ora restituisce `order` (chiavi delle tappe nell'ordine della linea) ed `end` (la sede usata, o null). Per il riaggancio (REG-654): `start` = posizione attuale, `stops` = solo le tappe rimaste (anche `[]`: dritti in sede), `optimize: false` (nessuna richiesta di ottimizzazione).
- Test: unit in `road-lesson-plan.test.ts` (ordine con ritorno, `planEnd`, pezzi chiusi in sede, ottimizzazione con fetch finto, cache dei tratti, geocodifica); e2e `reg648-road-plan.auth.spec.ts` esteso (Torino: `end: null`; riaggancio con ordine dato; vicino alla sede di Milano senza tappe: la linea arriva in sede).

### La sede è una sola (REG-655, 29/10) — piano `plans/road/004-sede-unica.md`
- **Sede = solo `AutoscuolaLocation` con `isDefault`, non archiviata.** `roadHeadquarters` non ripiega più su un altro luogo (prima: senza sede il primo luogo per nome, con la sede senza coordinate il primo luogo che le aveva). Resta la geocodifica dell'indirizzo della sede. Senza sede la linea del giro finisce all'ultima tappa.
- **Mappa live** (`getRoadLive`): `base` = la sede vera con le coordinate (prima un luogo qualsiasi, anche archiviato); `places` = gli altri luoghi non archiviati con le coordinate, per il segnaposto diverso (REG-657). La tab Road mobile (`headquarters` di `GET /road/free`) legge già solo la sede vera, ora anche non archiviata.
- **`GET /road/headquarters`** (`getRoadHeadquartersStatus`): `{ roadEnabled, missing, canEdit }`. `missing` = Road acceso e `roadHeadquarters` null; `canEdit` = titolare o admin. Lo legge il foglio della sede sulla web (REG-656): bloccante per chi può modificare, avviso per gli altri.
- Test: `road-headquarters.test.ts` (solo la sede vera, niente ripieghi, geocodifica dell'indirizzo).

### Foglio della sede (REG-656, 29/10)
- **`RoadHeadquartersGate.tsx`** (`components/pages/Autoscuole/road/`), montato in `app/[locale]/user/(autoscuole)/autoscuole/road/layout.tsx` (tutte le pagine Road: viste, dettaglio guida, editor dei percorsi) e in cima a `RoadSettingsPane`. Legge `GET /road/headquarters`; con `missing`:
  - **titolare** (`canEdit` = `isOwner`): foglio **bloccante** (niente X, Esc e clic fuori bloccati), si chiude solo a sede salvata. Indirizzo con l'autocompletamento Places (hook `locations/use-places-autocomplete.ts`, estratto da `LocationFormDialog`) oppure «Usa la mia posizione attuale» (solo se il browser ha `geolocation`): coordinate del browser + indirizzo più vicino da **`POST /api/places/nearby`** (Places API (New) `searchNearby`, raggio 80 m, stessa chiave; `lib/places/nearby-address.ts › pickStreetAddress` preferisce via e numero alla sola zona; se Google non risponde l'indirizzo sono le coordinate). Salva con `updateDefaultAutoscuolaLocation` (posizione precisa, nome della sede che c'è già, `sedeName`).
  - **altri** (admin Reglo; le pagine Road web sono già solo titolare/admin): avviso «Manca l'indirizzo della sede», si chiude, una volta per sessione (`sessionStorage` `reglo:road-hq-notice`).
- Sotto 640 px il foglio è lo sheet dal basso di `reglo-dialog`. Test: e2e `reg656-road-sede-gate.auth.spec.ts` (spegne «Posizione precisa» sulla sede di staging, foglio in Impostazioni e in Road, Esc non chiude, posizione → indirizzo, ricerca, salvataggio con la posizione: la sede di staging resta a 45.4654, 9.1859); unit `road-nearby-address.test.ts`.

### Segnaposto dei luoghi e partenza (REG-657, 29/10)
- **Mappa live** (`RoadLiveView`) ed **editor dei percorsi** (`RoadExamRouteEditor`): oltre alla sede (edificio 3D `ROAD_IMAGES.base`, etichetta nera `.road-sede`) i luoghi di `GET /road/live › places` con `placeMarkerElement` (`road-map.ts`): tondo bianco col glifo «map-pin» monocromatico e il nome sotto su fondo chiaro (`.road-luogo` in `RoadMarkerStyles`), senza clic. Nella legenda della mappa live compare «Luogo» quando ce n'è almeno uno. L'inquadratura iniziale non cambia (percorsi e sede).
- **Dettaglio guida** (`RoadSessionDetail`): la partenza è il punto `.road-start` con l'etichetta bianca «Partenza HH:MM» (`.road-start-lab`); prima aveva l'icona della sede, e una guida partita da un luogo sembrava partire dalla sede.
- Test: e2e `reg657-road-segnaposto-luoghi.auth.spec.ts` (una sede, un `.road-luogo` per luogo, nel dettaglio nessuna `.road-sede`).

### Riaggancio in guida (REG-654, mobile, 29/10)

Nessuna modifica al backend: l'app istruttore richiama `POST /road/plan/route` con `optimize: false` quando l'istruttore esce dalla linea (oltre 50 m per 12 s), al massimo una volta ogni 45 s e solo se l'auto si è spostata, con le sole tappe rimaste (le tappe saltate apposta si lasciano perdere). L'esito (`planReached`) resta quello calcolato dal server sul tracciato. Dettagli in `reglo-mobile/docs/features/reglo-road.md` › «Riaggancio dopo una deviazione».

### Interruttori e giro nel dettaglio guida, web (REG-651, 29/10)

- **Impostazioni › Reglo Road › «Il giro»** (`RoadSettingsPane.tsx`, in cima): due righe con `InlineToggle`, salvate al tocco con `updateAutoscuolaSettings({ roadPlanEnabled })` / `({ roadPlanAlertsEnabled })`, accese se assenti. Con il giro spento gli avvisi restano com'erano ma non si toccano (contano solo col giro). Test id `road-plan-settings`, `road-plan-toggle`, `road-plan-alerts-toggle`.
- **Dettaglio guida** (`RoadSessionDetail.tsx › RoadPlanBlock`, tra i numeri e le segnalazioni, solo se la guida aveva un giro): «Giro» con le tappe numerate nell'ordine scelto alla partenza, il motivo e, a guida chiusa, «Raggiunta» / «Non raggiunta» (da `planReached`; in testa «N tappe raggiunte su M»); a guida in corso «N tappe · circa M min». `RoadSession` del client (`client.ts`) ha ora `plan` e `planReached`.
- Test: e2e `reg651-road-plan-settings.auth.spec.ts` (avvisi spenti restano dopo il reload, giro spento = avvisi bloccati, poi tutto riacceso).

### Tracce pulite, sulle strade, con le soste (REG-665, 30/10) — piano `plans/road/006-road-qa2.md`
- **Perché**: il GPS da fermo «balla» di qualche metro a ogni fix; in sede o in sosta il percorso diventava un groviglio (QA di Tiziano, 30/10).
- **`lib/autoscuole/road/clean-track.ts`** (puro + fetch Google): via fix con precisione > 25 m e salti > 50 m/s; auto ferma (entro 30 m per ≥ 2 min, un fix «scappato» per meno di 60 s non interrompe) = due punti nello stesso posto (arrivo e ripartenza); ferma ≥ 5 min = **sosta** `{lat,lng,startMs,endMs,minutes}`. Poi Google Roads `snapToRoads` (`interpolate=true`) sulla traccia diradata a ~1 punto ogni 30 m, pezzi da 100 punti con un punto in comune. Fra due punti dati, se la linea di Google devia (> 1,5× la traccia pulita + 40 m) o taglia dritto (< 0,6× − 40 m), lì restano i punti puliti; punto agganciato a > 40 m da quello dato = torna al dato. Google che non risponde = traccia solo pulita con `retryAfter` (+24 h).
- **Dove vive**: `RoadSession.cleanTrack` (JSONB, migrazione `20261104120000_road_clean_track`): `{v, snapped, path:[[lat,lng,tMs]], stops, distanceMeters, thumb, retryAfter?}`. Si calcola a «Termina guida» (`endRoadSession`) o alla prima lettura del dettaglio (`sessionCleanTrack` in `service.ts`), e sovrascrive `distanceMeters` (i km del GPS da fermo erano gonfiati). Guida in corso: solo pulita, mai salvata. `CLEAN_TRACK_VERSION` cambiata = si ricalcola.
- **API**: il dettaglio (`buildDetail`: sessione, guida, allievo) restituisce `track` = la linea pulita (stessa forma `[lat,lng,tMs]`) e `stops`. Le liste (`getRoadForStudent`, guide recenti della tab Road) leggono solo `cleanTrack->'thumb'` (SQL), senza caricare il percorso; senza traccia salvata, miniatura pulita al volo senza Google. `getRoadTrackDelta` (mappa live web) resta grezzo.
- **Web**: `RoadSessionDetail` disegna le soste (punto nero + etichetta «Sosta X min», stile `road-stop`).
- **Script**: `scripts/road/backfill-clean-tracks.ts [--company <id>] [--prod --yes]` calcola le tracce delle sessioni finite che non ce l'hanno (≈ 0,07 € a guida).
- **Costo**: Roads API ~10 $/1000 richieste; 6–8 richieste per un'ora di guida, una volta sola.

### Giro modificato salvato sul server (REG-668, 30/10)
- **Perché**: il giro modificato nel foglio «Il giro» (REG-667) viveva solo nella memoria dell'app e si perdeva riavviandola.
- **Dove vive**: tabella `RoadLessonPlan` (migrazione additiva `20261105120000_road_lesson_plan`), una riga per guida (`appointmentId` chiave): `stops` (stessa forma di `RoadSession.plan.stops`, nell'ordine dell'istruttore), `minutes`, `updatedById`, `updatedAt`.
- **API** (`lib/autoscuole/road/saved-plan-service.ts`, route `app/api/autoscuole/road/plan/saved/route.ts`): `GET ?appointmentId` → `{ saved: {stops, minutes, updatedAt} | null }`; `PUT {appointmentId, stops, minutes}` (validato con `parseStoredPlan`, max 3 tappe) → upsert; `DELETE ?appointmentId` = «Torna al giro suggerito».
- **Chi**: l'istruttore della guida o il titolare/admin (`canSeeAll`). Si scrive solo su guide in programma (`ROAD_ELIGIBLE_STATUSES`) e non ancora partite in Road (`STARTED`).
- **Giro di base che cambia**: quello salvato è una fotografia e resta com'è finché non si torna al suggerito.
- **Partenza in Road**: `startRoadSession`, con il giro acceso (il telefono manda un giro), usa quello salvato per la guida e lo segna `plan.custom = true`, così la mobile non riottimizza l'ordine. «Senza giro» resta senza giro.

### Svolte del giro (REG-676)
- **Perché**: navigazione passo passo in Road sulla linea suggerita del giro.
- **`snap.ts › snapWaypointsWithSteps`**: come `snapWaypoints`, ma la richiesta `computeRoutes` chiede anche `routes.legs.steps.navigationInstruction,startLocation,distanceMeters` (stessa richiesta, campi in più). Ogni passo → `RoadStep` `{ lat, lng, maneuver, text }`: posizione d'inizio della manovra, `maneuver` = valore di Google (TURN_RIGHT, ROUNDABOUT_LEFT, NAME_CHANGE…, `STRAIGHT` se manca), `text` = prima riga dell'istruzione in italiano. Via i passi DEPART (`legSteps`).
- **Cache**: le svolte per tratto in `road:steps:v1:<lat,lng>><lat,lng>` (stesse chiavi per coordinate e TTL 90 giorni della linea). Un tratto «manca» se manca la linea o le svolte; quelli richiesti rinfrescano entrambe. Stesso raggruppamento (max 10 intermedi per richiesta). `snapWaypoints` / `fetchLegsFromGoogle` (editor dei percorsi d'esame) non cambiano.
- **Ottimizzazione** (`plan-route.ts`): la richiesta con `optimizeWaypointOrder` porta anche le svolte e semina `road:steps:v1:*` con le stesse regole dei tratti (`stepsToCache`), così la linea con le svolte che segue non rifà richieste.
- **`POST /road/plan/route`** → `steps: RoadStep[]` in ordine di linea; i percorsi d'esame non ne portano. Qualunque errore (o `line: null`) = `steps: []`, mai un errore per la mobile.
- Test: `road-snap.test.ts` (parsing, cache mancante solo per le svolte, raggruppamento, errori), `road-lesson-plan.test.ts` (`stepsToCache`, semina in `optimizeStopOrder`).

### Ripasso sui punti critici dell'allievo (REG-677)
- **Cosa**: passando su un suo punto critico l'istruttore tocca «Meglio» (questa volta meglio) o «No» (ancora no), con «Annulla».
- **Modello** (migrazione additiva `20261106120000_road_hotspot_checks`, solo tabella nuova): `RoadHotspotCheck` — `companyId`, `sessionId` (FK con cascade: si cancella con la sessione, quindi con la retention 12 mesi di `runRoadMaintenance`, nient'altro da toccare), `studentId?` (dalla sessione), `clientId` unico (idempotenza), copia del punto `hotspotKey`/`kind`/`label`/`lat`/`lng`, `outcome` `better|worse`, `recordedAt`. Indici `(sessionId, recordedAt)`, `(companyId, studentId, recordedAt)`.
- **API** (`service.ts › addRoadHotspotCheck` / `removeRoadHotspotCheck`, stesse regole delle segnalazioni: istruttore della guida o admin, accettato fino a 2 h dopo la chiusura). Codici: `INVALID`, `SESSION_CLOSED`, `NOT_FOUND`, `FORBIDDEN`.
- **Punti dell'allievo** (`lesson-plan.ts › buildStudentHotspots(markers, checks?)`, loader `loadStudentHotspots` / `computeLessonPlan` che leggono i ripassi dell'allievo nei 12 mesi): `StudentHotspot` ha in più
  - `note` = la nota più recente non vuota dell'istruttore sulle segnalazioni del punto;
  - `checks: { better, worse }`, `lastCheck: { outcome, at } | null`: ogni ripasso va al solo punto più vicino dello stesso tipo entro 60 m dal centro (`assignChecks`);
  - `status`: storia del punto in ordine di tempo (segnalazione «da migliorare» e «No» = errore, «Meglio» = meglio; a pari istante l'errore dopo); «Meglio» di fila dopo l'ultimo errore: 0 `open`, 1 `improving`, ≥ 2 `overcome` (`hotspotStatus`).
  Arrivano in `GET /road/plan › studentHotspots` e `GET /road/students/[id] › hotspots`.
- **Giro**: un punto `overcome` non diventa una tappa (resta sulla mappa) e non lascia il posto al punto dell'autoscuola dello stesso tipo lì vicino.
- **Riepilogo e dettaglio**: `Detail.hotspotChecks` (in ordine di tempo) in `GET /road/sessions/[id]`, `POST /road/sessions/[id]/end` e `GET /road/appointments/[id]`. Web: blocco «Ripassi sui punti critici» in `RoadSessionDetail` (sotto le segnalazioni, solo se ce ne sono; «Meglio» / «Ancora no» in testo semplice).
- Test: `road-lesson-plan.test.ts` (stato, assegnazione, nota, tappe senza i punti superati).
