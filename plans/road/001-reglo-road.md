# Plan: Reglo Road — guida in diretta (REG-638)

## Cosa è stato fatto
- **27/10/2026 — piano approvato** (approvazione generale, le domande di prodotto 1-5 e 7 sono in attesa di Tiziano).
- **Fase 1 (backoffice)**: flag `limits.roadEnabled` + card «Reglo Road» nel drawer «Gestisci» + campo `roadEnabled` in `AutoscuolaSettingsData`. Verificata in locale (desktop e 390px, accensione su DB dev, `/api/autoscuole/settings`). Rilascio: staging → verifica → prod via cherry-pick su `main`.
- Worktree: `reglo-worktrees/reg-638` (da `origin/staging`) e `reglo-mobile-worktrees/reg-638` (da `origin/master`), branch `feat/reg-638-reglo-road` su entrambi.

---

## 1. Cosa riusiamo
| Serve | Esiste | Uso |
|---|---|---|
| Flag per autoscuola | JSON `CompanyService.limits`, pattern «nasce spento» (REG-633, Aula) | `limits.roadEnabled`, niente migrazione |
| Toggle backoffice | Drawer «Gestisci» in `BackofficeCompaniesPage.tsx` → `updateCompanyService` | Card «Reglo Road» |
| Flag sul mobile | `/api/autoscuole/settings` → `useAutoscuolaSettings` | `useRoadEnabled` (`=== true`) |
| Guide di oggi | `agenda/bootstrap`, card live istruttore (`isLessonInProgressWindow`) | Aggancio «Entra in Road» |
| Stato guida | `checked_in` / `completed` + auto-complete cron | Ingresso Road → `checked_in` |
| Live effimero | Aula: Redis + polling 1,5 s | Stesso pattern per posizioni |
| Chiave Google | `GOOGLE_MAPS_API_KEY` (Places proxy) | Mappe web e Android |

Assenti: librerie mappe (web e mobile), GPS/permessi/coda offline sul mobile, realtime sul web.

## 2. Account e setting
- Interruttore del modulo: solo backoffice, spento di default.
- Istruttore (INSTRUCTOR / INSTRUCTOR_OWNER) su mobile: modalità Road.
- Titolare/segreteria (membership admin) su web: voce «Road».
- Allievo: niente in v1 (domanda aperta 4).

## 3. Modello dati (migrazioni solo additive, timestamp > `20261029120000`)
- `RoadSession`: companyId, appointmentId (unique), instructorId, studentId, vehicleId?, status (active/completed/abandoned), startedAt, endedAt, distanceMeters, durationSec, polyline, last* (posizione/velocità/via/ora).
- `RoadPointBatch`: sessionId, seq, points Json, `@@unique(sessionId, seq)` → upload idempotente.
- `RoadMarker`: sessionId, clientId unique, kind, note?, lat, lng, street?, recordedAt.
- Live in Redis `road:live:{companyId}` (TTL breve). Nome via calcolato dal telefono (geocoder nativo).

## 4. Backend
- Mobile: `POST /api/autoscuole/road/sessions`, `POST .../[id]/points`, `POST|DELETE .../[id]/markers`, `POST .../[id]/end`, `GET .../[id]`. Gate: Bearer + `roadEnabled` + istruttore della guida.
- Web live: polling 4–5 s su `GET /api/autoscuole/road/live?since=` da Redis, solo a tab visibile, interpolazione lato client.
- Chiusura automatica sessioni orfane a endsAt + 30 min (cron esistente).

## 5. Mobile
- Mappa `react-native-maps` (Apple Maps iOS / Google Android).
- GPS `expo-location` + `expo-task-manager`, BestForNavigation, AutomotiveNavigation, distanceInterval ~8 m; iOS `UIBackgroundModes: location` + permesso «Mentre usi l'app»; Android foreground service `location` (dichiarazione Play Store).
- Coda offline su file (`expo-file-system`), ripresa dopo kill. `expo-keep-awake`.
- Road = gate a tutto schermo che sostituisce le tab; invito con foglio nativo in orario di guida.
- ⚠️ Moduli nativi nuovi → versione/runtime **2.4.0**, build EAS iOS + Android (niente OTA).

## 6. Web
- Voce «Road» in `AutoscuoleNav` (solo se `roadEnabled`), `/autoscuole/road`: Dal vivo / Guide di oggi / Storico; dettaglio `/autoscuole/road/[id]`.
- Mappa: Google Maps JS con stile custom (chiave esistente).
- Esclusi: dashcam, AI, «Pronta per l'esame», «Ancora N guide», tasto Dashcam.

## 7. Segnalazioni
Catalogo fisso v1: Stop, Precedenza, Distanza di sicurezza (simboli esistenti), Velocità, Semaforo, Rotonda, Svolta, Posizione in corsia, Pedoni, Specchietti/sguardo, Parcheggio, Altro (nota). Simboli 3D da generare nello stesso stile.

## 8. Fasi
1. Backoffice → prod (cherry-pick su `main`). ✅ codice
2. Backend.
3. Anteprime HTML (cornice iPhone realistica per mobile; web) in `/tmp/hiro-anteprime/reg-638/` → stop per ok di Tiziano.
4. Mobile da anteprima approvata; catture con simulatore iOS (`xcrun simctl`, autorizzato per questo task).
5. Web da anteprima approvata.
6. Rilascio: staging → prod web + `migrate:prod` (+ `trigger:deploy:prod` se cambiano i job) → build EAS 2.4.0.

## Domande aperte (in attesa di Tiziano)
1. Privacy/art. 4 Statuto dei Lavoratori + conservazione dati (proposta 12 mesi).
2. Termina guida = guida `completed` subito? (consigliato sì)
3. Gruppi/moto esclusi dalla v1?
4. Allievo vede percorso/segnalazioni? (proposta fase 2)
5. Catalogo segnalazioni fisso o personalizzabile?
7. Riepilogo → link al pagellino se attivo?
