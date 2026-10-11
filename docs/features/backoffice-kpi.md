# Backoffice — KPI

Sezione **KPI** del backoffice interno (`/backoffice/kpi`, quarta voce dopo
Autoscuole): come va Reglo nel periodo scelto. Riservata al global admin come
il resto del backoffice (`requireGlobalAdmin` nel layout).

## Cosa mostra

1. **Sei card di sintesi**: MRR (+ARR), autoscuole attive, guide svolte, media
   guide al giorno, quota prenotata dall'app, istruttori attivi. Dove il
   confronto è onesto, ogni card porta la **variazione sul periodo precedente**
   (stessa durata, subito prima).
2. **Andamento delle guide** — area svolte + linea annullate.
3. **Qualità del periodo** — prenotate, tasso di annullamento (in rosso oltre il
   25%), no show, allievi attivi e nuovi.
4. **Da dove arrivano le prenotazioni** — barre impilate per canale + totali.
5. **Crescita** — nuove autoscuole per mese e MRR cumulato, **sempre ultimi 12
   mesi** (una curva di crescita sul filtro breve non direbbe niente).
6. **Ricavi** — MRR, ARR, ARPA, una tantum del periodo.
7. **Autoscuole nel periodo** — classifica per guide svolte, con quota app e
   ultima attività; chi è a zero resta in elenco in grigio (è il segnale di
   churn più utile con pochi clienti).
8. **Uso delle funzionalità** — quante autoscuole hanno usato ogni feature.
9. **Parco app** — dispositivi visti nel periodo, iOS/Android e versioni
   installate (serve a decidere quando alzare il floor del force-update).

Filtro periodo: Oggi · 7 giorni · 30 giorni · Mese · Trimestre · Anno ·
Personalizzato. L'intervallo vive nell'URL (`?da=YYYY-MM-DD&a=YYYY-MM-DD`), così
un periodo si manda per link. **Esporta CSV** scarica tutto (sintesi + serie +
tabelle) in un file solo, separatore `;` e BOM per Excel italiano.

## Due orologi, tenuti separati

- `startsAt` → quando la guida **si svolge**: volume, esiti, classifica.
- `createdAt` → quando è stata **prenotata**: domanda e canale.

Confonderli è l'errore classico di queste dashboard: "guide svolte" e "guide
prenotate" sono due numeri diversi e nella pagina stanno in due posti diversi.

## Saturazione dell'agenda istruttori (2026-09-13)

Card nel blocco **"Nel periodo"**: quante ore gli istruttori dichiarano
disponibili in agenda e quante di quelle ore sono davvero occupate da guide.

- **Ore disponibili**: le fasce risolte dallo **stesso risolutore dell'agenda**
  (`buildAvailabilityResolver`: `AutoscuolaWeeklyAvailability` con
  `rangesByDay` + eccezioni giornaliere `AutoscuolaDailyAvailabilityOverride`),
  quindi il numero è quello che il titolare vede a schermo. Da lì si
  **sottraggono** i blocchi istruttore (malattia, ferie, teoria:
  `AutoscuolaInstructorBlock`) e i **festivi** dell'autoscuola
  (`AutoscuolaHoliday`): un istruttore in ferie non è disponibile.
- **Ore occupate**: le guide non annullate con un istruttore assegnato,
  **intersecate** con le fasce disponibili. Le guide fatte fuori fascia non
  gonfiano il rapporto (che resta 0-100%) ma sono contate a parte e mostrate
  nel sottotitolo della card.
- Gli intervalli vengono **fusi prima** di sommarli: i posti di una stessa guida
  di gruppo sono un'ora sola, non una per allievo.
- ⚠️ Le fasce sono **orari da orologio italiano**, non istanti: in produzione il
  server gira a UTC, quindi la conversione passa da `romeWallClockToInstant`.
  Senza, ogni fascia slitterebbe di un'ora o due e non combacerebbe con le guide.
- **Fuori dal rapporto le autoscuole senza nemmeno una guida nel periodo**
  (2026-09-13): una scuola appena entrata che ha già dichiarato le fasce ma non
  ha ancora lavorato non ha "l'agenda vuota", non sta usando l'agenda. Con 8
  scuole in gioco una sola così (Solferino: 343 ore dichiarate, 0 guide) valeva
  14% del denominatore. Quante ne restano fuori è scritto nella nota in fondo.
- **Fuori dal rapporto anche gli istruttori senza nemmeno una guida nel
  periodo** (2026-09-14): stessa regola delle scuole ferme, un gradino più in
  basso. Sono titolari, segretarie o istruttori che se ne sono andati senza
  essere disattivati: le loro fasce dichiarate non sono capacità inutilizzata.
  Su prod erano 2 su 25 e da soli valevano 438 ore a zero, il 5,7% del
  denominatore (58,7% → 62,5% su 90 giorni). Anche questo è dichiarato nella
  nota in fondo alla pagina.
  ⚠️ L'esclusione vale **solo se l'istruttore non ha nemmeno un blocco** nel
  periodo: chi è stato in ferie o in malattia non guida per un motivo, e le ore
  che gli restano sono capacità persa vera. Senza questo distinguo la regola
  mordeva troppo sulle finestre brevi (+10 punti sui 30 giorni contro +4 sui 90,
  perché in un mese "zero guide" spesso vuol dire "era in ferie").
- **Spacco per prenotazione in app dell'allievo**: sotto la percentuale, "con
  app allievo X% · senza Y%" (`limits.appBookingActors` ∈ students|both = attiva,
  default students). Su prod lo scarto è enorme — **79% contro 35%** — e spiega
  da solo la media bassa: le scuole che tengono la prenotazione ai soli
  istruttori riempiono molto meno. Si è scelto di **mostrare lo spacco invece di
  filtrare** sulle sole app-enabled: filtrando, il KPI avrebbe nascosto 3 clienti
  su 8 e sarebbe saltato ogni volta che una scuola cambia impostazione. Gli
  override per percorso patente e per cluster istruttore (REG-426) qui si
  ignorano: per un KPI di piattaforma conta il default dell'autoscuola.
- **Solo ore già passate** (correzione 2026-09-13): la finestra viene tagliata a
  `now`. Le fasce dichiarate per i giorni che devono ancora arrivare non entrano
  né al numeratore né al denominatore — è un consuntivo, non una previsione. Un
  periodo tutto nel futuro dà 0 ore e rapporto 0, non una divisione per zero.
- **Autoscuole di prova escluse** come in tutto il resto della pagina (sotto).
- Istruttori considerati: stesso filtro dell'agenda (attivi, con utente, ruolo
  INSTRUCTOR/INSTRUCTOR_OWNER).
- I risolutori di disponibilità si costruiscono **una volta** sulla finestra che
  copre periodo corrente e precedente (servono per il confronto): due query per
  autoscuola, non quattro.

L'aritmetica sta in `lib/backoffice/agenda-saturation.ts` — modulo puro
(`mergeIntervals`, `subtractIntervals`, `intersectIntervals`, fuso orario) con
16 test: è l'unica parte che potrebbe sbagliare in silenzio.

## Autoscuole interne di prova

Le autoscuole con `excludeFromKpis: true` nei `limits` del servizio AUTOSCUOLE
sono **fuori da tutti i numeri della pagina**: MRR, clienti, guide, medie,
adozione, parco app, saturazione (decisione di prodotto 2026-09-13, estesa
dalla sola saturazione a tutto). Oggi è marcata "Autoscuola Maltese", che ha 11
istruttori che dichiarano disponibilità e quasi nessuna guida vera.

Nel codice l'elenco si legge **una volta all'inizio** di `computeKpis` e diventa
un `where` su ogni query: nessun filtro a posteriori, nessuna query che
dimentica l'esclusione. Se aggiungi una query alla funzione, aggiungi
`...notExcluded` al suo `where`.

L'esclusione **si dichiara in pagina**, nella nota in fondo: un cruscotto che
nasconde righe senza dirlo non è affidabile.

Si marca una company dal DB (nessuna UI, è un'operazione rara):
```sql
UPDATE "CompanyService"
SET limits = jsonb_set(limits::jsonb, '{excludeFromKpis}', 'true'::jsonb, true)::json
WHERE "companyId" = '<id>' AND "serviceKey" = 'AUTOSCUOLE';
```

## Data model

**Nessun modello nuovo, nessuna migrazione, nessun job.** Tutto è calcolato live
a ogni richiesta: i volumi sono minuscoli per una query analitica (~14k
appuntamenti, 21 autoscuole su prod a ottobre 2026) e una tabella di rollup
sarebbe solo un impianto in più da tenere in vita.

## Costo del calcolo (ottobre 2026)

La pagina era diventata inusabile sui periodi lunghi: cambiare filtro
richiedeva decine di secondi, tutti di CPU — che su Vercel è la voce che si
paga. **Non erano le query.** Misurato su prod: le ~18 query in parallelo
stanno in **1,15 s** (3,0 s se messe in fila), e il filtro "Anno" ne tocca
12.475 righe. Il costo stava in due posti:

1. **La conversione di fuso orario.** `romeWallClockToInstant` e `romeYmd`
   (`lib/backoffice/agenda-saturation.ts`) costruivano un
   `Intl.DateTimeFormat` **nuovo a ogni chiamata**: 27,8 µs contro 2,2 µs con
   il formatter già pronto. Il ciclo della saturazione le chiama una volta per
   istruttore per giorno, su due finestre (periodo + periodo precedente): sul
   filtro "Anno", con 51 istruttori, sono 37.230 iterazioni e **149.732
   chiamate**. Formatter a livello di modulo + memoizzazione per
   `(giorno, minuto)` → il ciclo passa da **4.194 ms a 85 ms** (misurato sul
   dato di prod). La chiave è per giorno **e minuto**, non per giorno: il 25
   ottobre l'offset cambia a metà giornata.
   Lo stesso ciclo vive in `lib/autoscuole/agenda-occupancy.ts` (report ore del
   titolare, pagina di cliente): beneficia della stessa correzione senza
   toccarlo.
2. **Il doppio calcolo per ogni click.** `applyRange` faceva `setRange` (→
   effetto → server action) **e** `router.replace`, che rigenera il server
   component della route → `getBackofficeKpis` una seconda volta, in parallelo.
   Ora l'URL si riscrive con `window.history.replaceState`: resta incollabile,
   ma il calcolo gira una volta sola.

Davanti al calcolo c'è poi una **cache Redis di 10 minuti**
(`backoffice:kpi:v1:<from>:<to>:<full|investor>`, dentro `computeKpis`, quindi
copre anche la pagina investor pubblica — che altrimenti ricalcola a ogni
anteprima link di WhatsApp o LinkedIn). Se Redis manca o risponde male si
calcola e si tira avanti: è un acceleratore, non una dipendenza. Il payload
porta `computedAt` e la testata scrive **"calcolati alle HH:MM"**, così il
numero non finge mai di essere del secondo esatto.

Il prossimo passo, se mai servisse, è trasformare le due findMany da 12k righe
in aggregati SQL — oggi non è il collo di bottiglia e non vale il rischio.

## File

| File | Ruolo |
|------|-------|
| `lib/backoffice/agenda-saturation.ts` | Aritmetica pura degli intervalli per la saturazione agenda + conversione orologio italiano → istante |
| `lib/backoffice/kpi-math.ts` | Modulo **puro** (niente Prisma): granularità dei bucket (`pickBucketUnit`, `buildBuckets`, `bucketKeyFor`), esiti (`isDoneStatus`/`isCancelledStatus`), canali (`SOURCE_BUCKETS`, `sourceBucketOf`), piani (`planMonthlyCents`), tipo account (`companyKindOf`) |
| `lib/actions/backoffice-kpi.actions.ts` | `getBackofficeKpis({from,to})`: solo la guardia `requireGlobalAdmin`, il calcolo è in `kpi-compute.ts` |
| `lib/backoffice/kpi-compute.ts` | `computeKpis`: cache Redis 10 min + `computeKpisFresh` (~18 query in parallelo, aggregazione in memoria, saturazione agenda), tipo `BackofficeKpis` con `computedAt` |
| `app/[locale]/backoffice/kpi/page.tsx` | Route: legge `?da=&a=` (default ultimi 30 giorni) e calcola il primo giro lato server (nessun flash di scheletri) |
| `components/pages/Backoffice/BackofficeKpiPage.tsx` | La pagina: filtro periodo sticky, card, sezioni, tabella autoscuole, export CSV |
| `components/pages/Backoffice/kpi/KpiPrimitives.tsx` | `KpiCard` (numero che sale, delta, sparkline), `DeltaPill`, `Sparkline`, `KpiSection`, `LegendDot` |
| `components/pages/Backoffice/kpi/KpiCharts.tsx` | Grafici recharts: andamento, canali, crescita, ciambella dispositivi + tooltip comune |
| `components/pages/Backoffice/kpi/kpi-format.ts` | Formattatori it-IT e costruzione del CSV |
| `components/pages/Backoffice/BackofficeHeader.tsx` | Voce di nav "KPI" |
| `tests/unit/backoffice/kpi-math.test.ts` | 14 test sul modulo puro |

`recharts` era **già** in `package.json` e non era usato da nessuna parte:
nessuna dipendenza nuova. Palette dalle variabili `--chart-1…5`.

## Scelte di prodotto (2026-09-13)

- **"Autoscuole attive" = stato Attivo nel sistema**, punto: nessuna distinzione
  fra contratto e operatività. Chi non ha fatto guide si vede nella classifica.
- **Gli account "Solo Segretaria" e "Consorzio" sono inclusi** in tutti i
  conteggi e nelle medie, ma **etichettati** nella classifica: per natura fanno
  pochissime guide e chi legge deve saperlo. Niente interruttore per escluderli.
- **Export CSV** richiesto esplicitamente.

## Limiti dichiarati (scritti nella pagina, non nascosti)

- MRR/ARR vengono dai **piani registrati a mano** in backoffice, non dal
  fatturato: la card dice sempre su quante autoscuole il piano esiste davvero.
- Le guide precedenti al campo `bookingSource` finiscono in **"Storico"**.
- **Lo storico dei cambi di stato delle autoscuole non è tracciato**: per questo
  "Autoscuole attive" è una fotografia di adesso, senza confronto col periodo
  precedente (e il churn non è un KPI di questa pagina). Se servisse davvero,
  è un piccolo modello di audit sugli stati di `CompanyService`.
- L'MRR cumulato del grafico crescita è una **stima**: ogni piano conta dalla
  sua data di registrazione.

## Design

Registro del backoffice (bianco, bordi `#ececec`, navy `#1a1a2e`) con più aria:
card 2xl che si sollevano in hover, numeri `tabular-nums` che salgono al
caricamento, sparkline nelle card con una serie, barra filtri sticky sotto
l'header, sezioni che entrano in `whileInView`, tooltip dei grafici disegnato in
casa. **Tutte le animazioni rispettano `prefers-reduced-motion`** (`useReducedMotion`).

## Connessioni

- **Company Plan** ([company-plan.md](company-plan.md)) — MRR/ARR/ARPA e posti
  istruttore venduti vengono da `CompanyPlan`; le una tantum da `CompanyLicensePurchase`.
- **Appointments** ([appointments.md](appointments.md)) — volume, esiti e
  `bookingSource` per i canali.
- **Secretary-only** / **Consorzio** — `limits.secretaryOnly` e
  `limits.accountKind` danno l'etichetta del tipo account.
- **Notifications/mobile** — `MobilePushDevice` (piattaforma, `appVersion`,
  `lastSeenAt`) alimenta il parco app; utile insieme a
  [notifications.md](notifications.md) e al floor del force-update.
