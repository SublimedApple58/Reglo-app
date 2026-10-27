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
| GET | `/road/live` | titolare | `{ now, base: {name,lat,lng}\|null, sessions: [Session+{lesson, markerCount, markerKinds, recentMarkers}], atBase: [{id,name,plate,freeUntil}] }` |
| GET | `/road/today` | titolare | `[Lesson + { road: Session+{markerCount, markerKinds} \| null }]` guide singole in auto di oggi (Europa/Roma) |
| GET | `/road/history?from&to&instructorId&studentId&cursor&limit` | titolare | `{ items: [Session+{lesson, markerCount, markerKinds}], nextCursor }` |

Tipi:
- `Lesson` = `{ appointmentId, startsAt, endsAt, status, student: {id,name}|null, instructor: {id,name,color}|null, vehicle: {id,name,plate}|null }`
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
- Test: `tests/unit/road/road-geo.test.ts`.
