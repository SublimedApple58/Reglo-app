# Plan: Road — Punti critici (idea 3) e Giro della prossima guida (idea 4, senza voce)

Stato: **APPROVATO da Tiziano (29/10/2026)**, task REG-641 → REG-651 (cycle 16). In lavorazione dal REG-641.
Concept di partenza: `/tmp/hiro-anteprime/road-idee/` (3-punti-critici, 4-piano-di-guida).

## Decisioni di Tiziano (29/10)
1. **Percorsi d'esame**: strada **B con aggancio alle strade** è la principale — il titolare mette i punti sulla mappa web e la linea segue le strade vere (routing tra i punti), mai a mano libera. La strada A (da una guida Road) resta come scorciatoia.
2. **Interruttori** «Proponi il giro della prossima guida» e «Avvisi delle tappe durante la guida»: nascono **accesi**.
3. **Punti critici** visibili **anche all'istruttore** nell'app mobile (task mobile REG-646).
4. **Segnalazioni a voce**: fuori da questo piano, idea a parte più avanti.
5. Idee 1 (riassunto AI / rivedi la guida) e 2 (prontezza all'esame): ferme.
6. **Rilascio diretto** (regola di Tiziano del 29/10, sostituisce «massimo fino a staging»): task finito e verificato → staging → produzione senza aspettare l'ok (Road in prod è acceso solo su «Autoscuola Maltese», tenant di prova); Done su Linear solo quando è in prod. Mobile: OTA in produzione **solo sul runtime 2.4.0** (TestFlight), mai agli store 2.3.0; niente build nativa.

Il piano si regge sui dati che Road già registra: ogni segnalazione ha posizione, via, giudizio (bene / da migliorare) e data; il briefing «nelle ultime 5 guide» esiste già (`lib/autoscuole/road/suggestions.ts`); la web app ha già la mappa (MapLibre). Nessuna build nativa: la parte mobile va in OTA sulla 2.4.0.

## Idea 3: Punti critici

| Punto | Fisso o configurabile | Dove si gestisce | Chi lo usa | Piattaforma | Cosa si riusa |
|---|---|---|---|---|---|
| Mappa dei punti critici (raggruppa per incrocio le segnalazioni «da migliorare») | **Fisso**: c'è sempre con Road acceso | Nessun setting | Titolare e titolare-istruttore (web), **istruttore (mobile)** | Web, mobile, backend | `RoadMarker` (posizione e via), mappa web `road-map.ts`, react-native-maps |
| Filtri (periodo, istruttore, patente, tipo di errore) | Filtri nella pagina | Web: pagina Road › vista «Punti critici»; mobile: tab Road › «Punti critici» | Titolare, istruttore | Web, mobile | I filtri dello Storico |
| Soglia minima: 3 errori di almeno 2 allievi | **Fisso** (toglie i casi isolati, protegge il singolo allievo) | — | — | Backend | — |
| Dettaglio di un punto (guide e allievi) | Fisso; **l'istruttore vede solo i suoi allievi** | Tocco sul punto → dettaglio guida | Titolare, istruttore | Web, mobile | `RoadSessionDetail`, `road-percorso` |
| **Percorsi d'esame** | **Configurabile**: ogni autoscuola i suoi, all'inizio nessuno | Web › Impostazioni › Reglo Road › «I tuoi percorsi d'esame» (lista + editor a pagina intera) | Titolare (web) | Web, backend | Tracciati Road (`track`) per la scorciatoia |
| Segno «sul percorso d'esame» sui punti | Fisso, solo se esiste almeno un percorso | — | Titolare, istruttore | Backend, web, mobile | — |
| Allievo | Non vede la mappa | — | — | — | — |

### Come si disegnano e si salvano i percorsi d'esame
- **B. A punti con aggancio alle strade (principale):** il titolare clicca sulla mappa web i punti del percorso, li trascina o li toglie; a ogni modifica il backend calcola la strada vera tra un punto e l'altro (Google Routes API `computeRoutes`, in auto, con punti intermedi; chiave server `GOOGLE_MAPS_API_KEY`, la stessa del proxy Places) e la mappa mostra la linea agganciata. Se il servizio non risponde: errore chiaro, nessuna linea a mano libera salvata.
- **A. Da una guida Road (scorciatoia):** dal dettaglio di una guida nello Storico «Usa come percorso d'esame», si tagliano inizio e fine con due maniglie; il tracciato segue già le strade.
- **Salvataggio:** si salvano sia i punti del titolare (`waypoints`, per riaprire l'editor) sia la linea agganciata semplificata a un punto ogni ~10 m (`path`), con la lunghezza. Max 25 punti. I percorsi non scadono; si archiviano.

## Idea 4: Il giro della prossima guida (senza voce)

| Punto | Fisso o configurabile | Dove si gestisce | Chi lo usa | Piattaforma | Cosa si riusa |
|---|---|---|---|---|---|
| Proposta del giro (max 3 tappe con motivo e minuti) | **Configurabile, acceso di default**: «Proponi il giro della prossima guida» | Web › Impostazioni › Reglo Road (autoscuola) | Titolare decide; istruttore usa (mobile) | Web, backend, mobile | `buildBriefing`, punti critici |
| Da dove vengono le tappe | Fisso: 1) errori ripetuti dell'allievo sul punto; 2) punto critico dell'autoscuola per il suo errore più frequente; 3) percorso d'esame meno percorso | — | — | Backend | Briefing, hotspots, percorsi d'esame |
| Numero di tappe e minuti | Fisso: max 3, adattate alla durata | — | — | Backend | — |
| Dove compare | Fisso: tab Road › «Con chi guidi?» (sotto il briefing), invito «Entri in Road?», foglio della guida | — | Istruttore | Mobile | `BriefStack`, `road-invite`, `manage-lesson` |
| Scelta per guida | «Parti con questo giro» / «Senza giro» | Nel foglio | Istruttore | Mobile | Flusso «Parti con …» |
| Avvisi in guida (card ~300 m prima, vibrazione, tappa raggiunta entro 40 m) | **Configurabile, acceso di default**: «Avvisi delle tappe durante la guida»; distanza fissa | Web › Impostazioni › Reglo Road | Istruttore in Road | Mobile | `tracking.ts`, `roadStore` |
| **Punti critici dell'allievo sulla mappa in Road** (i SUOI errori ripetuti: stesso tipo entro 60 m in almeno 2 guide diverse, ultimi 12 mesi; non quelli dell'autoscuola) | Fisso: con Road acceso | — | Istruttore in Road | Backend, mobile | Raggruppamento di `hotspots.ts`, `RoadMarkerPin` |
| **Navigazione suggerita**: linea discreta sulle strade vere da posizione → tappe (ordine ottimizzato) → eventuale percorso d'esame → **sede**, con riaggancio se si devia | Fisso: c'è quando la guida ha un giro (segue l'interruttore del giro) | — | Istruttore in Road | Backend, mobile | Routes API + cache per tratto di REG-642 (`snap.ts`) |
| Esito («2 tappe su 3») | Fisso | Riepilogo Road, dettaglio guida web | Istruttore, titolare | Mobile, web, backend | Riepilogo, `RoadSessionDetail` |
| Allievo | Non vede il giro (forse in futuro) | — | — | — | — |

**Modifica di Tiziano (29/10, dopo l'ok ai punti critici in app)** — sostituisce la vecchia riga «non la strada, solo tappe»:
- In Road la mappa mostra le tappe numerate **e una navigazione suggerita, non obbligatoria**: una linea discreta che segue le strade vere, calcolata con la Routes API e la cache per tratto di REG-642 (`road:snap:v1:*`).
- Sulla mappa in Road compaiono anche i **punti critici di quell'allievo** (i suoi errori ripetuti), non quelli dell'autoscuola.
- Niente voce, niente indicazioni svolta per svolta: solo la linea e le tappe.
- Se la Routes API non risponde: restano tappe e punti, senza linea; nessun errore a schermo.

**Seconda decisione di Tiziano (29/10 sera)** — corregge la prima su due punti (REG-653, REG-654):
- **Il giro si chiude sempre in sede**: posizione di partenza → tappe sui punti critici dell'allievo (ed eventuale percorso d'esame) → **sede dell'autoscuola**. Coordinate della sede già salvate (`AutoscuolaLocation`); se mancano, geocodifica dell'indirizzo, risultato in cache. Anche i minuti del giro contano il ritorno in sede.
- **Ordine delle tappe ottimizzato** con `optimizeWaypointOrder` della Routes API, una volta alla partenza (tariffa più alta, quindi una richiesta sola); il percorso d'esame resta un blocco (entra dall'inizio, esce dalla fine).
- **Riaggancio se si devia** (sostituisce «nessun ricalcolo»): fuori percorso = oltre ~50 m dalla linea per almeno 10–15 s; allora la linea si ricalcola dalla posizione attuale alla prossima tappa non raggiunta, poi il resto fino alla sede. Al massimo un ricalcolo ogni 30–60 s, con la cache per tratto di REG-642. Una tappa saltata apposta, dopo un po', si lascia perdere e si prosegue. La linea si aggiorna in modo morbido; niente voce né svolta per svolta.

Ordine delle tappe «più vicina prima», minuti stimati in linea d'aria a 25 km/h (indicativi).

## Modello dati e migrazioni (solo additive, una migrazione in REG-641)
- **Nuova tabella `RoadExamRoute`**: `id`, `companyId`, `name`, `examSite?`, `licenseCategories String[]`, `waypoints Json` (punti del titolare), `path Json` (linea agganciata `[[lat,lng],…]`), `lengthMeters Int`, `sourceSessionId?`, `createdById?`, `archivedAt?`, `createdAt`, `updatedAt`; indice `(companyId, archivedAt)`.
- **Nuove colonne `RoadSession`**: `plan Json?` (tappe scelte alla partenza), `planReached Json?` (tappe raggiunte, a fine guida). La linea suggerita non si salva: si ricalcola dalla cache per tratto.
- **Punti critici**: nessuna tabella, calcolo alla lettura sugli ultimi 12 mesi + cache Redis 10 min (job notturno Trigger solo se diventa lento).
- **Impostazioni** nel JSON `limits` esistente, nessuna migrazione: `roadPlanEnabled`, `roadPlanAlertsEnabled` (assenti = accesi).

## Task Linear (team Reglo, assegnati a Tiziano, cycle 16)

| ID | Task | Piattaforma | Punti | Dipende da |
|---|---|---|---|---|
| REG-641 | Migrazione additiva (`RoadExamRoute`, `RoadSession.plan/planReached`) e API dei percorsi | Backend | 2 | — |
| REG-642 | Aggancio alle strade (Routes API) e scorciatoia da guida Road | Backend | 2 | 641 |
| REG-643 | Punti critici: calcolo e API (titolare e istruttore), segno sul percorso d'esame | Backend | 2 | 641 |
| REG-644 | Punti critici: vista web nella pagina Road | Web | 3 | 643 |
| REG-645 | Percorsi d'esame: editor web in Impostazioni con aggancio | Web | 3 | 642 |
| REG-646 | Punti critici nell'app istruttore | Mobile | 3 | 643 |
| REG-647 | Giro: calcolo delle tappe, punti critici dell'allievo, copertura dei percorsi d'esame | Backend | 3 | 643 |
| REG-648 | Giro: API, salvataggio, interruttori (accesi), linea suggerita sulle strade (Routes API + cache) | Backend | 3 | 647, 642 |
| REG-649 | Giro nei fogli di partenza | Mobile | 3 | 648 |
| REG-650 | Giro: avvisi in Road ed esito nel riepilogo | Mobile | 3 | 648 |
| REG-653 | Linea che si chiude in sede, ordine ottimizzato (`optimizeWaypointOrder`), sede geocodificata | Backend | 2 | 648 |
| REG-652 | Mappa in Road: linea suggerita, tappe e punti critici dell'allievo | Mobile | 3 | 648, 653 |
| REG-654 | Riaggancio quando si esce dal percorso (50 m per 10–15 s, max un ricalcolo ogni 30–60 s, tappa saltata lasciata perdere) | Mobile | 3 | 652, 653 |
| REG-651 | Interruttori web, giro nel dettaglio guida, documentazione | Web | 1 | 648 |

Totale **36 punti** (erano 27: +1 a REG-648 per la linea, +3 con REG-652 spacchettato da REG-650, +2 con REG-653 e +3 con REG-654 per la seconda decisione). Ordine: 641 → 646, poi 647 → 648 → 649 → 653 → 650 → 652 → 654 → 651 (653 anticipato da Tiziano, 29/10 sera). Un task alla volta, ognuno con il suo branch `feat/reg-<num>-<slug>` da `origin/staging` e worktree `reglo-worktrees/reg-<num>`; rilascio diretto fino in produzione (decisione 6).

## Regole UI (tutte le schermate)
Design premium, niente pillole/badge decorativi; animazioni veloci (150–200 ms) che non si spengono con `prefers-reduced-motion` / «Riduci movimento»; web responsive a 390 px; mobile: form sheet nativi senza grabber, skeleton, fluidità §15. Verifica con Playwright, screenshot ritagliati in `/tmp/hiro-anteprime/road-punti-critici/`.

## Rischi
- **Segnalazioni in ritardo** (5–20 s, 50–150 m dopo l'errore): raggruppare per via + tipo con raggio ~60 m; in futuro spostare il punto indietro lungo il tracciato.
- **Pochi dati**: stato vuoto chiaro («servono ancora circa N guide registrate»); il giro funziona anche solo col briefing.
- **Conservazione 12 mesi**: la mappa guarda al massimo un anno (scritto in pagina).
- **Privacy**: dati aggregati (≥ 2 allievi); l'istruttore vede la mappa aggregata ma nel dettaglio solo i suoi allievi.
- **Costo del giro in Road**: una richiesta con `optimizeWaypointOrder` alla partenza (tariffa Advanced), poi riagganci limitati a uno ogni 30–60 s e quasi sempre dalla cache per tratto.
- **Routes API**: abilitata sulla chiave (verificato 29/10, la stessa su dev e staging). Costo per richiesta solo mentre si modifica un percorso, endpoint solo titolare. Decisione di Tiziano (29/10): chiamare Google solo quando si lascia o si salva un punto (debounce nell'editor), cache dei tratti già calcolati e ricalcolo solo del tratto toccato → cache Redis per tratto + tratti consecutivi in una richiesta (≤ 10 intermedi, tariffa base).
- **Percorsi «d'esame»**: non ufficiali della motorizzazione → «I tuoi percorsi d'esame».
- **Distrazione**: linea sottile e neutra che si riaggancia da sola e in modo morbido (niente avvisi né voce quando si esce dal giro); una card alla volta, testo breve, solo vibrazione, interruttore.
- **Stima tempi**: indicativa.

## Avanzamento
- 29/10 — piano approvato, task creati, avvio REG-641.
- 29/10 — REG-641 su staging (82b995c). Road acceso sull'autoscuola di test di staging «Autoscuola Reglo» (solo quella).
- 29/10 — REG-642: `POST /road/exam-routes/snap` (aggancio con cache per tratto) e `POST /road/exam-routes/from-session` (scorciatoia A).
- 29/10 — REG-643: `GET /road/hotspots` e `/road/hotspots/[key]`. Modifica al piano: i gruppi si fanno per tipo + 60 m e la via non li divide (a un incrocio la stessa manovra arriva su due vie diverse); la via più frequente dà il nome.
- 29/10 — Nuova regola di Tiziano per il lavoro Road: task finito e verificato → staging → produzione senza attendere l'ok (Road in prod è acceso solo su «Autoscuola Maltese», tenant di prova); Done su Linear solo quando è in prod. Mobile: OTA produzione runtime 2.4.0, niente build nativa.
- 29/10 — REG-641/642/643 in produzione (main f93479f).
- 29/10 — **Runtime mobile (chiarito da Tiziano)**: sugli store c'è la **2.3.0**; la **2.4.0** (moduli nativi di Road) è solo la build **TestFlight** con cui si prova Road. Store e TestFlight leggono lo stesso canale EAS `production`: a separarli è solo il `runtimeVersion`. Le OTA di Road (REG-646, 649, 650) vanno **solo sul runtime 2.4.0**, mai agli utenti 2.3.0: prima di ogni `eas update` verificare `app.json` → `runtimeVersion: "2.4.0"`, `--branch production` e il runtime stampato da eas update. Floor force-update resta 2.3.0.
- 29/10 — REG-644: vista web «Punti critici» nella pagina Road. MapLibre con `essential: true` per non perdere le animazioni con «Riduci movimento» (corretto anche «Dal vivo»).
- 29/10 — REG-645: editor web dei percorsi d'esame (Impostazioni › Reglo Road, rotta `road/percorsi/[id]`) + «Usa come percorso d'esame» con maniglie Inizio/Fine nel dettaglio guida. Google solo al rilascio/aggiunta/rimozione di un punto (350 ms) o al salvataggio, solo i tratti mancanti; verificato con Playwright (trascinamento = 0 richieste, rilascio = 1).
- 29/10 — REG-646: punti critici nell'app istruttore (tab Road › «Punti critici», mappa + lista, foglio del punto), OTA solo runtime 2.4.0 (master 8c4235a). Approvato da Tiziano.
- 29/10 — **Modifica al giro (Tiziano)**: in Road i punti critici dell'allievo sulla mappa e una navigazione suggerita sulle strade vere (Routes API + cache REG-642), non obbligatoria, senza ricalcoli insistenti né voce. Sostituisce «non la strada, solo tappe». REG-648 passa a 3 punti; la parte mappa di REG-650 diventa il nuovo REG-652 (3 punti).
- 29/10 — REG-647: motore del giro (`lesson-plan.ts` + `lesson-plan-service.ts`): punti critici dell'allievo (errori ripetuti in ≥ 2 guide), tappe per priorità con durata, copertura dei percorsi d'esame (30 m, cache 10 min). Nessuna API: arriva con REG-648.
- 29/10 — REG-648: API del giro (`GET /road/plan`, `POST /road/plan/route`), `plan` all'ingresso in Road, `planReached` a fine guida, interruttori `roadPlanEnabled` / `roadPlanAlertsEnabled` (accesi se assenti) in impostazioni e in `/road/state`. Modifica: il giro NON entra in `/road/free` né in `eligibleLesson` di `/road/state` (si chiede al foglio di partenza con allievo e durata: `/road/state` è interrogato spesso e il giro costa una lettura dei tracciati).
- 29/10 — REG-649 in produzione (OTA 2.4.0, master mobile 9c61658): il giro nei fogli di partenza.
- 29/10 sera — **Seconda decisione di Tiziano sul giro**: il giro si chiude in sede (coordinate della sede, o geocodifica in cache), ordine delle tappe con `optimizeWaypointOrder`, riaggancio se si devia (50 m per 10–15 s, max uno ogni 30–60 s, tappa saltata lasciata perdere). Nuovi REG-653 (backend, 2) e REG-654 (mobile, 3); REG-652 aggiornato. Totale 36 punti.
- 29/10 sera — REG-653: il giro si chiude in sede (minuti col ritorno in sede, ordine che tiene conto del ritorno), sede geocodificata con Places `searchText` (non la Geocoding API) in cache e salvata sulla sede, `optimizeWaypointOrder` una volta alla partenza con l'ordine in cache e i tratti nella cache di REG-642; `/road/plan/route` restituisce `order` ed `end` e accetta `optimize: false` per il riaggancio. **Modifica al piano**: una sede oltre 15 km dalla partenza non chiude il giro (`PLAN_HQ_MAX_M`), altrimenti il giro si svuota (staging: sede a Milano, dati a Torino; prod: 15 sedi su 19 senza coordinate né indirizzo; su Maltese la sede di default è vuota e si ripiega su «Sede Basciano», l'unico luogo con coordinate).
- 29/10 sera — REG-650 in produzione (OTA 2.4.0 iOS 1734609a / Android 6f2a16c1, master mobile 4033399): card nera a 300 m dalla tappa (una alla volta, 10 s, vibrazione), «Tappa raggiunta» entro 40 m (3,5 s), interruttore «Avvisi delle tappe» da `/road/state`, riga «Giro: N tappe su M» nel riepilogo da `planReached`. Verificato su staging con la posizione simulata a Torino (Aurora: 2 tappe su 2). Una guida di prova Road libero di Aurora resta sullo staging (completata, 5 min).
