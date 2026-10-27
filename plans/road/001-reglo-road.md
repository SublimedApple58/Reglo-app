# Plan: Reglo Road — guida in diretta (REG-638)

## Cosa è stato fatto
- **27/10/2026 — piano approvato.** Lo stesso giorno sono arrivate le risposte di Tiziano alle domande di prodotto: vedi «Decisioni di prodotto». Valgono da mobile e web in poi.
- **Fase 1 (backoffice)**: flag `limits.roadEnabled` + card «Reglo Road» nel drawer «Gestisci» + campo `roadEnabled` in `AutoscuolaSettingsData`. Verificata in locale (desktop e 390px, accensione su DB dev, `/api/autoscuole/settings`). Staging verificato il 27/10 (ciclo acceso/spento da backoffice a 390px, API settings coerente subito dopo il salvataggio). Prod via cherry-pick su `main`, in attesa del via.
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
- Allievo (mobile): vede percorso e segnalazioni delle sue guide **solo se** è attivo il setting esistente `limits.studentNotesEnabled` («Mostra note nell'app allievi», `BookingsTab.tsx:1041`). Label e descrizione vanno aggiornate per coprire anche Road.
- Titolare (web, Impostazioni): segnalazioni personalizzate in aggiunta alla lista base. Pannello visibile solo con `roadEnabled`.

## 3. Modello dati (migrazioni solo additive, timestamp > `20261029120000`)
- `RoadSession`: companyId, appointmentId (unique), instructorId, studentId, vehicleId?, status (active/completed/abandoned), startedAt, endedAt, distanceMeters, durationSec, polyline, last* (posizione/velocità/via/ora).
- `RoadPointBatch`: sessionId, seq, points Json, `@@unique(sessionId, seq)` → upload idempotente.
- `RoadMarker`: sessionId, clientId unique, kind (chiave base oppure `custom:<id>`), label (copia del nome al momento della segnalazione, così rinominare o cancellare una voce custom non rompe lo storico), note?, lat, lng, street?, recordedAt.
- Segnalazioni personalizzate: in `limits.roadCustomMarkers` = `[{ id, label }]` (JSON, niente tabella).
- Live in Redis `road:live:{companyId}` (TTL breve). Nome via calcolato dal telefono (geocoder nativo).

## 4. Backend
- Mobile: `POST /api/autoscuole/road/sessions`, `POST .../[id]/points`, `POST|DELETE .../[id]/markers`, `POST .../[id]/end`, `GET .../[id]`. Gate: Bearer + `roadEnabled` + istruttore della guida.
- Web live: polling 4–5 s su `GET /api/autoscuole/road/live?since=` da Redis, solo a tab visibile, interpolazione lato client.
- Chiusura automatica sessioni orfane a endsAt + 30 min (cron esistente).
- **Termina guida** (`.../end`): chiude la sessione **e segna subito la guida `completed`**. Lo fa il server dentro l'endpoint Road; il PATCH status generico per l'istruttore resta com'è.
- Solo guide singole in auto: l'API rifiuta guide di gruppo (`groupLessonId`) e guide moto.
- Allievo: `GET /api/autoscuole/road/appointments/[id]` (percorso + segnalazioni), gate `roadEnabled && studentNotesEnabled` e allievo della guida.
- Conservazione 12 mesi: pulizia giornaliera di sessioni, punti e segnalazioni più vecchi (job Trigger → `trigger:deploy:prod` al rilascio, dopo `migrate:prod`).

## 5. Mobile
- Mappa `react-native-maps` (Apple Maps iOS / Google Android).
- GPS `expo-location` + `expo-task-manager`, BestForNavigation, AutomotiveNavigation, distanceInterval ~8 m; iOS `UIBackgroundModes: location` + permesso «Mentre usi l'app»; Android foreground service `location` (dichiarazione Play Store).
- Coda offline su file (`expo-file-system`), ripresa dopo kill. `expo-keep-awake`.
- Road = gate a tutto schermo che sostituisce le tab; invito con foglio nativo in orario di guida (solo guide singole in auto).
- Primo ingresso: un foglio informativo breve («la posizione si registra solo durante la guida in Road, conservata 12 mesi») che prepara anche la richiesta di permesso. GPS acceso solo a sessione attiva, con l'indicatore di sistema (pillola blu iOS, notifica fissa Android).
- Niente navigazione fatta in casa: mappa nativa Apple/Google, nessun turn-by-turn.
- **Pagellino dentro Road**: tasto nel pannello che apre il pagellino della guida (page sheet esistente) senza uscire da Road. Il riepilogo «Guida completata» porta al pagellino se è attivo. Road e pagellino restano indipendenti: nessuno dei due richiede l'altro.
- **Allievo**: nel dettaglio guida, minimappa + elenco segnalazioni → mappa a tutto schermo. Stesso binario 2.4.0.
- ⚠️ Moduli nativi nuovi → versione/runtime **2.4.0**, build EAS iOS + Android (niente OTA).

## 6. Web
- Voce «Road» in `AutoscuoleNav` (solo se `roadEnabled`), `/autoscuole/road`: Dal vivo / Guide di oggi / Storico; dettaglio `/autoscuole/road/[id]`.
- Mappa: Google Maps JS con stile custom (chiave esistente).
- Esclusi: dashcam, AI, «Pronta per l'esame», «Ancora N guide», tasto Dashcam.

## 7. Segnalazioni
Lista base uguale per tutti: Stop, Precedenza, Distanza di sicurezza (simboli esistenti), Velocità, Semaforo, Rotonda, Svolta, Posizione in corsia, Pedoni, Specchietti/sguardo, Parcheggio, Altro (nota). Simboli 3D da generare nello stesso stile.
In più, l'autoscuola aggiunge voci personalizzate da web (Impostazioni → pannello Road). Le voci custom usano un simbolo neutro unico.

## 8. Fasi
1. Backoffice → prod (cherry-pick su `main`). ✅ codice
2. Backend.
3. Anteprime HTML (cornice iPhone realistica per mobile; web) in `/tmp/hiro-anteprime/reg-638/` → stop per ok di Tiziano. In più rispetto al piano iniziale: pagellino dentro Road, vista allievo (dettaglio guida con percorso), pannello web delle segnalazioni personalizzate, nuova label del setting allievo.
4. Mobile da anteprima approvata; catture con simulatore iOS (`xcrun simctl`, autorizzato per questo task).
5. Web da anteprima approvata.
6. Rilascio: staging → prod web + `migrate:prod` (+ `trigger:deploy:prod` se cambiano i job) → build EAS 2.4.0.

## Decisioni di prodotto (Tiziano, 27/10)
1. **Privacy/GPS**: soluzione più semplice senza compromettere il prodotto. GPS solo a sessione Road attiva, indicatore di sistema, foglio informativo al primo ingresso, conservazione **12 mesi** con pulizia automatica. Ci si appoggia alle mappe native Apple/Google.
2. **Termina guida** → la guida diventa subito `completed`.
3. **v1**: solo guide singole in auto. Gruppi e moto esclusi.
4. **Allievo**: vede subito percorso e segnalazioni, ma solo con `studentNotesEnabled` attivo. Label/descrizione del setting aggiornate per coprire Road.
5. **Segnalazioni**: lista base uguale per tutti + voci personalizzate per autoscuola (setting web).
6. **Pagellino**: se attivo, il riepilogo porta al pagellino; l'istruttore può compilarlo anche da dentro Road. Road e pagellino sono indipendenti.
