# Ore guida — occupazione al passato + filtro per periodo (REG-444, giro 2)

> **Stato:** implementato, in attesa di QA su staging.
> Giro 1 (banda occupazione + export CSV) era già su staging; questo giro
> corregge una scelta e aggiunge il selettore di periodo, su feedback di Tiziano.

## Cosa è cambiato rispetto al giro 1

**1. Le ore disponibili contano solo il passato.** Nel giro 1 avevo scelto di
misurare tutta la settimana, futuro compreso ("quanto è già pieno"). Tiziano ha
corretto: le ore disponibili devono essere solo quelle già trascorse. Il taglio
al momento attuale vale per **tutto** il conto, non solo per il denominatore.
Non per via del rapporto — l'intersezione fra occupato e disponibile lo tiene
già sotto l'1 da sola — ma perché una guida di stasera, che sta dentro le fasce
dichiarate, finirebbe contata come lavoro svolto FUORI fascia. Quindi: si costruisce una
finestra di misura `[inizio periodo, min(fine periodo, adesso))` e ci si ritaglia
dentro **fasce, blocchi e occupato**. Un periodo tutto nel futuro non è "vuoto":
è "non ancora iniziato", e va detto con parole diverse.

**2. Filtro per periodo.** La navigazione settimana-per-settimana diventa un
selettore vero (Settimana / Mese / 30 giorni / Personalizzato) con le frecce
‹ › che fanno scorrere il periodo scelto.

## Fasi

### Fase 1 — Il taglio al presente (`lib/autoscuole/agenda-occupancy.ts`)
`measurementWindow(period, now)` → la finestra davvero misurabile, `null` se il
periodo non è ancora iniziato. Funzione pura, testata.

### Fase 2 — Un solo posto che legge i dati (`lib/actions/autoscuole.actions.ts`)
Il giro 1 aveva messo il calcolo dentro `getInstructorDrivingHours` (la shape
legacy settimana+mese). Col filtro per periodo la pagina passa alla shape
**range**, quindi il calcolo si sposta in un helper condiviso
(`loadAgendaOccupancy`) e la action legacy torna com'era: niente codice morto,
niente query in più su un endpoint che nessuno chiama più così.

### Fase 3 — La shape range guadagna quello che serve alla pagina
`occupancy` + `total.lateCancellationMinutes` su `InstructorHoursRange`.
Entrambi **additivi**: il mobile legge la stessa shape e non se ne accorge.

### Fase 4 — La pagina
Selettore periodo al posto della sola navigazione settimana; le barre passano da
7 giorni fissi ai bucket del server (giorni fino a 14, poi settimane) con scala
comune a tutti gli istruttori; la riga "mese" in fondo alla card sparisce
(con un periodo arbitrario "Settembre 2026 · 64h" non vuole più dire niente —
lo sostituisce il preset "Mese"); le cancellazioni tardive si riferiscono al
periodo scelto e non più al mese.

### Fase 5 — Export
Il CSV segue il periodo scelto invece della settimana, e dichiara fino a quando
si è misurato.

## Scelte da ricordare

- **Il taglio vale per tutto.** Fasce, ferie, guide: stessa finestra. Non per
  tenere il rapporto sotto il 100% (ci pensa già l'intersezione), ma perché
  altrimenti le guide ancora da svolgere verrebbero contate come "fuori fascia".
  Lo fissa un test apposta.
- **Le cancellazioni tardive NON si tagliano al presente.** Sono un evento già
  avvenuto (l'allievo ha annullato), non capacità trascorsa: una guida di domani
  annullata tardi ieri conta nel periodo che la contiene.
- **La riga del mese sparisce.** Non è una perdita: il preset "Mese" dà lo stesso
  numero, e tenerla accanto a un periodo arbitrario era solo confusione.
- **Niente cache nuova, niente migrazioni, niente modelli nuovi.** Tutto in
  lettura sui modelli esistenti.
