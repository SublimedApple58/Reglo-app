# Plan: Road — Punti critici (idea 3) e Giro della prossima guida (idea 4, senza voce)

Stato: **APPROVATO da Tiziano (29/10/2026)**, task REG-641 → REG-651 (cycle 16). In lavorazione dal REG-641.
Concept di partenza: `/tmp/hiro-anteprime/road-idee/` (3-punti-critici, 4-piano-di-guida).

## Decisioni di Tiziano (29/10)
1. **Percorsi d'esame**: strada **B con aggancio alle strade** è la principale — il titolare mette i punti sulla mappa web e la linea segue le strade vere (routing tra i punti), mai a mano libera. La strada A (da una guida Road) resta come scorciatoia.
2. **Interruttori** «Proponi il giro della prossima guida» e «Avvisi delle tappe durante la guida»: nascono **accesi**.
3. **Punti critici** visibili **anche all'istruttore** nell'app mobile (task mobile REG-646).
4. **Segnalazioni a voce**: fuori da questo piano, idea a parte più avanti.
5. Idee 1 (riassunto AI / rivedi la guida) e 2 (prontezza all'esame): ferme.
6. Rilascio massimo fino a staging; produzione solo con ok esplicito.

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
| Esito («2 tappe su 3») | Fisso | Riepilogo Road, dettaglio guida web | Istruttore, titolare | Mobile, web, backend | Riepilogo, `RoadSessionDetail` |
| Allievo | Non vede il giro (forse in futuro) | — | — | — | — |

La mappa del giro mostra le tappe numerate in ordine (al più un tratteggio), non la strada: l'istruttore conosce la città. Ordine «più vicina prima», minuti stimati in linea d'aria a 25 km/h.

## Modello dati e migrazioni (solo additive, una migrazione in REG-641)
- **Nuova tabella `RoadExamRoute`**: `id`, `companyId`, `name`, `examSite?`, `licenseCategories String[]`, `waypoints Json` (punti del titolare), `path Json` (linea agganciata `[[lat,lng],…]`), `lengthMeters Int`, `sourceSessionId?`, `createdById?`, `archivedAt?`, `createdAt`, `updatedAt`; indice `(companyId, archivedAt)`.
- **Nuove colonne `RoadSession`**: `plan Json?` (tappe scelte alla partenza), `planReached Json?` (tappe raggiunte, a fine guida).
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
| REG-647 | Giro: calcolo delle tappe e copertura dei percorsi d'esame | Backend | 3 | 643 |
| REG-648 | Giro: API, salvataggio, interruttori (accesi) | Backend | 2 | 647, 641 |
| REG-649 | Giro nei fogli di partenza | Mobile | 3 | 648 |
| REG-650 | Giro: avvisi in Road ed esito nel riepilogo | Mobile | 3 | 648 |
| REG-651 | Interruttori web, giro nel dettaglio guida, documentazione | Web | 1 | 648 |

Totale **27 punti**. Ordine: 641 → 642 → 643 → 644 → 645 → 646, poi 647 → 651. Un task alla volta, ognuno con il suo branch `feat/reg-<num>-<slug>` da `origin/staging` e worktree `reglo-worktrees/reg-<num>`; massimo fino a staging.

## Regole UI (tutte le schermate)
Design premium, niente pillole/badge decorativi; animazioni veloci (150–200 ms) che non si spengono con `prefers-reduced-motion` / «Riduci movimento»; web responsive a 390 px; mobile: form sheet nativi senza grabber, skeleton, fluidità §15. Verifica con Playwright, screenshot ritagliati in `/tmp/hiro-anteprime/road-punti-critici/`.

## Rischi
- **Segnalazioni in ritardo** (5–20 s, 50–150 m dopo l'errore): raggruppare per via + tipo con raggio ~60 m; in futuro spostare il punto indietro lungo il tracciato.
- **Pochi dati**: stato vuoto chiaro («servono ancora circa N guide registrate»); il giro funziona anche solo col briefing.
- **Conservazione 12 mesi**: la mappa guarda al massimo un anno (scritto in pagina).
- **Privacy**: dati aggregati (≥ 2 allievi); l'istruttore vede la mappa aggregata ma nel dettaglio solo i suoi allievi.
- **Routes API**: abilitata sulla chiave (verificato 29/10, la stessa su dev e staging). Costo per richiesta solo mentre si modifica un percorso, endpoint solo titolare. Decisione di Tiziano (29/10): chiamare Google solo quando si lascia o si salva un punto (debounce nell'editor), cache dei tratti già calcolati e ricalcolo solo del tratto toccato → cache Redis per tratto + tratti consecutivi in una richiesta (≤ 10 intermedi, tariffa base).
- **Percorsi «d'esame»**: non ufficiali della motorizzazione → «I tuoi percorsi d'esame».
- **Distrazione**: una card alla volta, testo breve, solo vibrazione, interruttore.
- **Stima tempi**: indicativa.

## Avanzamento
- 29/10 — piano approvato, task creati, avvio REG-641.
- 29/10 — REG-641 su staging (82b995c). Road acceso sull'autoscuola di test di staging «Autoscuola Reglo» (solo quella).
- 29/10 — REG-642: `POST /road/exam-routes/snap` (aggancio con cache per tratto) e `POST /road/exam-routes/from-session` (scorciatoia A).
