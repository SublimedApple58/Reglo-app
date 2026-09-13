# Backoffice — sezione KPI

> **Fatto** (2026-09-13): nuova pagina `/backoffice/kpi`, quarta voce di nav.
> Piano approvato da Tiziano con tre decisioni (sotto). Rilasciata **diretta in
> produzione** su richiesta: è un tool interno, niente tappa staging.

## Scouting (cosa c'era prima)

- Backoffice a tre voci: Autoscuole (home) · Assistenza · Feedback, auth
  `requireGlobalAdmin` nel layout, pattern route server → action → client page.
- Unici "dati" esistenti: tre contatori **statici** in cima alla pagina
  Autoscuole (numero autoscuole, allievi su app, linee vocali attive). Nessuna
  dimensione temporale, nessun grafico in tutto il repo.
- `recharts` già in `package.json` e **mai usato**; variabili `--chart-1…5` già
  definite in `globals.css`.
- Volumi prod (settembre 2026): 14 autoscuole, 10.226 appuntamenti, 1.161 membri,
  659 chiamate voce, 985 dispositivi, 7 piani. **Minuscoli**: aggregazione live,
  niente rollup né cron.

## KPI inclusi e perché

| Blocco | KPI | Perché |
|---|---|---|
| Sintesi | MRR (+ARR), autoscuole attive, guide svolte, media guide/giorno, quota prenotata dall'app, istruttori attivi | i sei numeri che dicono in 5 secondi come va |
| Attività | prenotate, tasso di annullamento, no show, allievi attivi/nuovi | la salute dell'uso quotidiano |
| Canali | composizione per `bookingSource` nel tempo | la quota app è la promessa del prodotto: si deve vedere crescere |
| Crescita | nuove autoscuole/mese + MRR cumulato (12 mesi) | l'unica curva che conta per un SaaS giovane |
| Ricavi | MRR, ARR, ARPA, una tantum | soldi, separati dal ricorrente |
| Autoscuole | classifica con guide, allievi, quota app, ultima attività | con 14 clienti la lista nominativa vale più di ogni percentuale: chi è a zero è il churn di domani |
| Feature | adozione per funzionalità | dove investire, cosa dismettere |
| Parco app | dispositivi, iOS/Android, versioni | decide quando alzare il floor del force-update |

## Decisioni di Tiziano (2026-09-13)

1. **"Autoscuole attive" = stato Attivo nel sistema.** Niente distinzione
   contratto/operative: chi non fa guide si vede in classifica.
2. **Solo Segretaria e Consorzio inclusi nelle medie, ma etichettati.** Niente
   interruttore di esclusione: si segnala che sono account di natura diversa.
3. **Export CSV sì.**

## Collocazione

Nuova pagina `/backoffice/kpi`, nav: Autoscuole · **KPI** · Assistenza · Feedback.
La home resta l'elenco autoscuole, invariata (comprese le sue tre card statiche:
sono uno stato "adesso", non KPI di periodo — non duplicate).

## Cura del design (richiesta esplicita: livello prodotto, non tool interno)

- Card che si sollevano in hover, numeri `tabular-nums` che **salgono** al
  caricamento (easeOutCubic, 620ms), sparkline nelle card con una serie.
- Barra filtri **sticky** sotto l'header, opaca (la prima versione translucida
  lasciava trasparire i titoli delle sezioni: sembrava sporco).
- Grafici con griglia orizzontale tratteggiata, assi senza linea, **tooltip
  disegnato in casa** (quello di default di recharts stonava con tutto).
- Sezioni che entrano in `whileInView`, barre che crescono da zero.
- **Tutto rispetta `prefers-reduced-motion`.**
- Convenzioni tipografiche italiane: "300 €" (spazio), "12,5%" (attaccato).

### Trappole incontrate

- `pathLength` animato su una `<path>` dentro un SVG con
  `preserveAspectRatio="none"`: il tratteggio è calcolato in unità utente e la
  sparkline restava **tagliata a metà**. Risolto animando solo l'opacità.
- `React.useId()` chiamato dopo un early return → errore `rules-of-hooks`.
- `Intl` it-IT non raggruppa le migliaia a 4 cifre ("3604 €"): è corretto così,
  non è un bug da "sistemare".

## Limiti dichiarati nella pagina

MRR dai piani registrati a mano (non fatturato); guide vecchie senza
`bookingSource` in "Storico"; nessuno storico dei cambi di stato delle
autoscuole → "Autoscuole attive" senza confronto col periodo precedente; MRR
cumulato stimato dalla data di registrazione del piano.

## Verifica

- `npx tsc --noEmit` + `pnpm lint` puliti; `pnpm test:unit` 246/246 (14 nuovi sul
  modulo puro `kpi-math`).
- Preview reale su localhost con login backoffice via Playwright, tre
  inquadrature + full page, zero errori in console.
- Screenshot di verifica anche da **produzione** dopo il rilascio.
