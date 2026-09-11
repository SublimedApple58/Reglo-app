# Pagellino di valutazione (REG-443)

Ogni autoscuola decide **su cosa** i suoi istruttori valutano una guida. Le voci si
configurano in Impostazioni → **Pagellino**; l'istruttore le compila a **stelline** dal
foglio "Dettagli guida" dell'app.

**Sostituisce** la vecchia valutazione a stellina singola (`AutoscuolaAppointment.rating`), che dal
2026-09-10 **non si compila più** né da web né da mobile. Il campo resta in tabella e nei payload
perché i voti già dati vanno letti: nello storico guide la stellina compare **solo** sulle guide
che non hanno punteggi pagellino (quelle create prima della feature), dove è l'unica valutazione
esistente. Il backend continua ad accettare `rating` nella PATCH: nessun contratto rotto.

## Modello dati

| Modello | Ruolo |
|---|---|
| `AutoscuolaEvaluationItem` | voce del pagellino di UNA autoscuola: `label`, `scaleMax` (3 o 5), `position` (ordine nell'app), `archivedAt` |
| `AutoscuolaAppointmentEvaluation` | punteggio di UNA voce su UNA guida, unique `(appointmentId, itemId)`. `score` è **nullable**: null + `notApplicable: true` = voce non valutabile su quella guida |

`CompanyService.limits.evaluationSheetEnabled` (servizio AUTOSCUOLE) è l'interruttore
"Pagellino attivo". Sta dietro la cache Redis SETTINGS → `saveEvaluationSheet` la invalida.

**Le voci non si cancellano, si archiviano**: un punteggio dato mesi fa resta leggibile
con la sua etichetta anche se l'autoscuola ha cambiato pagellino. Una voce archiviata
ricompare nel foglio SOLO sulle guide che hanno un suo punteggio, marcata "(non più in uso)".

## File

| Cosa | Dove |
|---|---|
| Regole pure (scale, punteggio di partenza, clamp, riepilogo/etichette) | `lib/autoscuole/evaluation-sheet.ts` |
| Actions (lettura/salvataggio voci + interruttore, pagellino di una guida) | `lib/actions/autoscuole-evaluation.actions.ts` |
| Pane Impostazioni → Pagellino | `components/pages/Autoscuole/EvaluationSheetPane.tsx` (registrato in `AutoscuoleResourcesPage.tsx`) |
| API per l'app istruttore | `app/api/autoscuole/appointments/[id]/evaluation/route.ts` (GET) |
| Salvataggio punteggi | `updateAutoscuolaAppointmentDetails` in `lib/actions/autoscuole.actions.ts` (campo `evaluations`) + `app/api/autoscuole/appointments/[id]/route.ts` (PATCH) |
| Test | `tests/unit/autoscuole/evaluation-sheet.test.ts` |

## Regole

- **Scale ammesse: 3 o 5 stelline.** La scala 10 è stata provata e scartata: le stelline
  diventano troppo piccole per il pollice.
- **Sul WEB non c'è precompilazione** (dal 2026-09-11): una voce senza stelline è "non
  valutata" e non viene salvata. Vedi "Opt-in" qui sotto. **Sul MOBILE il foglio precompila
  ancora a metà scala** (`defaultEvaluationScore`): il giro opt-in sull'app è il prossimo
  passo, fino ad allora le due piattaforme si comportano diversamente.
- Il salvataggio è una **sostituzione integrale** dei punteggi di quella guida: le voci non
  mandate vengono cancellate, così una voce tolta dal pagellino sparisce anche da lì.
- I punteggi viaggiano nella **stessa PATCH** dei dettagli guida: un solo "Salva".
- Il pagellino da solo è una modifica salvabile (si può toccare solo le stelline).
- Voci di un'altra autoscuola o sparite nel frattempo vengono **ignorate**, non fanno
  fallire il salvataggio dell'istruttore.
- Vale il vincolo già esistente sulla valutazione: si valuta solo una guida **già
  effettuata** (`checked_in`/`completed`/`no_show`).
- Max 12 voci per autoscuola: oltre, il foglio non si compila più "in pochi secondi".

### Voce "non valutabile" su una guida

Non tutte le guide toccano tutti i punti (l'autostrada in una guida di sole manovre). Ogni riga
si può marcare **non valutabile per QUELLA guida**, senza configurazione a priori — la strada
"aggancia la voce a un tag/tipo guida" è stata esclusa.

- **Web (dialog "Modifica guida")**: hover sulla riga → pillola ghost "Non valutabile" a sinistra
  delle stelline (le stelline restano ancorate a destra: niente salto di layout). La riga esclusa
  diventa grigia con chip + link "Ripristina". Il bottone è raggiungibile da tastiera (compare sul
  focus), non solo in hover.
- **Mobile**: un trattino `[—]` dedicato dentro la scala, prima delle stelline (variante scelta da
  Tiziano contro swipe e long-press: le uniche discutibili sul fatto che a riposo non comunicano
  nulla). Attivo = bordo e testo navy.
- Sul filo: la riga **si salva comunque**, con `score: null` e `notApplicable: true`. Una riga
  assente sarebbe indistinguibile da una voce **aggiunta al pagellino dopo** quella guida.
- "Ripristina" riporta il **voto di prima**, non il default: sul client lo stato delle esclusioni
  è separato da quello dei punteggi.
- Si possono escludere **tutte** le voci: il pagellino esiste, non ha media, e lo storico mostra
  "Pagellino non applicabile".
- Le voci escluse restano **fuori da media e conteggio** (`evaluationSummary` le filtra e le conta
  a parte in `skipped`).

## Compilazione dal web (agenda)

Il pagellino si compila anche dal web, nel dialog **"Modifica guida"** dell'agenda (blocco della
guida → Modifica), nella posizione in cui stava la stellina che ha sostituito. Una riga per voce
con stelline cliccabili; i punteggi entrano nella stessa "Salva modifiche" degli altri dettagli.

- Le voci arrivano da `getEvaluationSheet` (una fetch per apertura del dialog); i punteggi già dati
  viaggiano col bootstrap agenda, che ora seleziona `evaluations`.
- Nessun vincolo di stato: si valuta anche una guida programmata o in corso.

#### Opt-in: si valuta solo ciò che si è fatto

All'apertura **niente è precompilato**: le stelline partono vuote e la voce resta "non
valutata" finché qualcuno non la tocca. Ricliccando la stellina già scelta la voce torna
"non valutata" (prima non si poteva più azzerare).

Il perché: la precompilazione a metà scala **fabbricava giudizi** — un 3/5 che nessuno aveva
dato finiva nello storico e, da quando esiste la media per allievo, anche nelle medie. Con
molte voci configurate il problema diventava anche di fatica (disattivarne dieci a mano).

- L'intestazione della sezione conta le voci valutate ("3 di 10 valutate").
- Il menu **"Tutte"** fa le azioni in blocco: *Valuta tutte a metà scala* (un clic e torna il
  vecchio comportamento, per le scuole che vogliono il pagellino sempre pieno), *Segna non
  valutabili le restanti*, *Azzera il pagellino*.
- **Conseguenza accettata**: non vale più "una guida valutata ha sempre il pagellino
  completo". In cambio, un voto presente è un voto che qualcuno ha davvero dato.
- Niente soglia sul numero di voci: il comportamento è lo stesso con 3 e con 12, perché il
  gesto dell'istruttore non deve cambiare in base a come la sua scuola ha configurato il
  pagellino.
- Le voci **archiviate** che hanno un voto su quella guida restano in elenco (marcate "non più in
  uso"): il salvataggio sostituisce integralmente i punteggi, ometterle le cancellerebbe.
- Se l'autoscuola non ha configurato il pagellino, la sezione non compare.

## Consultazione nello storico guide

I punteggi si consultano dallo **storico guide lato scuola**, senza aprire nulla di nuovo:

- **Web** — scheda allievo → tab **Note** ("valutazioni e note"): sotto la riga della guida una
  chip `★ Pagellino 4,2/5` espande l'elenco completo delle voci in sola lettura
  (`EvaluationRecap` in `AutoscuoleStudentsPage.tsx`). La media si calcola **solo** se tutte le
  voci hanno la stessa scala; con scale miste la chip mostra il numero di voci
  (`evaluationSummary`). Le voci escluse si vedono lo stesso, come **"— non valutabile"**: serve a
  distinguere "non si applicava" da "dimenticata".
  Le tre etichette della chip (media, conteggio, `non applicabile`) vengono tutte da
  `evaluationSummaryLabel`, gemello di quello mobile: non scriverle a mano nei componenti.
- **Mobile** — storico guide dell'allievo: la riga porta la stessa chip; toccando la guida si apre
  il foglio "Dettagli guida" con tutte le voci (in sola lettura se non più modificabile).

I punteggi viaggiano nei payload dello storico (`getAutoscuolaStudentDrivingRegister` per il web,
il ramo NON-`light` di `getAutoscuolaAppointmentsFiltered` per l'app istruttore): niente chiamata
per riga. Il ramo `light`, che serve l'app ALLIEVO, resta senza pagellino.

Le guide precedenti alla feature non hanno punteggi → nessuna chip, storico invariato.

## Media per voce nella scheda allievo (web)

Scheda allievo → tab **Note**, in cima alla lista delle guide: card "Pagellino · media su
tutte le guide" con la media generale, una riga per voce (barra + media + "su N guide") e una
riga di lettura con la **voce più bassa** e quante voci non sono mai state valutate.

- Calcolo in `aggregateStudentEvaluations` (`lib/autoscuole/evaluation-sheet.ts`, unit-testato):
  fuori guide annullate, voci "non valutabili" e voci senza voto.
- **Zero query nuove**: i punteggi arrivano già col registro guide. L'ordine delle voci e il
  conteggio delle "mai valutate" vengono dalle voci attive del pagellino, caricate una sola
  volta per pagina (`getEvaluationSheet`).
- La media segue il **registro guide**, che tiene solo i tipi "guida": gli esami non entrano
  nel conto, come non compaiono nella lista sotto la card.
- Barre e non stelline: una media come 4,2 con le stelline richiederebbe mezze stelle finte.
- Scale miste (3 e 5) → niente media generale, restano quelle per voce.
- Le voci archiviate che hanno voti restano in coda, marcate "(non più in uso)".

Sul **mobile** la vista aggregata non c'è ancora: è il passo successivo.

## Stile delle stelline

**Gialle (`#facc15`), uguali su web e mobile.** Il web resta com'era; su mobile è stata aperta una
deroga esplicita al design system mono-navy (`StarRating` prop `tone="gold"`) per tenere le due
piattaforme identiche. La deroga vale SOLO per il pagellino: la valutazione complessiva su mobile
resta navy.

## Fuori scope (v1)

L'allievo **non** vede il pagellino nella sua app: resta interno all'autoscuola. Conseguenza
accettata: nel suo storico le guide nuove non mostrano alcuna valutazione, perché la stellina che
vedeva prima non viene più compilata.

Restano da decidere: la statistica "voto medio" nella scheda allievo mobile (oggi media delle
stelline storiche, si congela col tempo) e se aprire il pagellino all'allievo.
