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

## Data model

**Nessun modello nuovo, nessuna migrazione, nessun job.** Tutto è calcolato live
a ogni richiesta: i volumi sono minuscoli per una query analitica (~10k
appuntamenti, 14 autoscuole su prod a settembre 2026) e una tabella di rollup
sarebbe solo un impianto in più da tenere in vita. Se un giorno le query
diventassero lente, il primo passo è una cache Redis breve sull'action, non la
materializzazione.

## File

| File | Ruolo |
|------|-------|
| `lib/backoffice/kpi-math.ts` | Modulo **puro** (niente Prisma): granularità dei bucket (`pickBucketUnit`, `buildBuckets`, `bucketKeyFor`), esiti (`isDoneStatus`/`isCancelledStatus`), canali (`SOURCE_BUCKETS`, `sourceBucketOf`), piani (`planMonthlyCents`), tipo account (`companyKindOf`) |
| `lib/actions/backoffice-kpi.actions.ts` | `getBackofficeKpis({from,to})`: `requireGlobalAdmin`, ~18 query in parallelo, aggregazione in memoria, tipo `BackofficeKpis` |
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
