# REG-449 — Ordine custom degli istruttori in agenda

> **Fatto** (2026-09-13, notturno, in autonomia): setting nel pane **Aspetto**,
> riordino drag&drop sulla lista istruttori già esistente lì, ordine salvato nei
> `limits` (`agendaInstructorOrder`) e applicato a colonne settimana, colonne
> giorno, filtro Istruttori, select dei dialoghi e stampa. Solo web.

## Il problema

L'agenda ordina gli istruttori **alfabeticamente per nome** (DB `orderBy: name asc`
+ `localeCompare` lato client in 3 punti). Le autoscuole però leggono l'agenda
con un ordine mentale loro — anzianità, aula, turni. Solferino lo ha scritto
esplicitamente: Daniele, Emidio, Giuseppe, Andrea, Cesare.

## Dove va il setting (la domanda vera)

L'idea nella issue dice "sezione Aspetto". Verificato nel repo: **è giusta**, e
per un motivo più forte di quanto immaginasse la nota — nel pane Aspetto **esiste
già una lista di istruttori**, quella dei colori ("Colori istruttori", spostata lì
da Gestisci istruttore il 2026-08-10). Alternativa scartata:

| Collocazione | Perché no |
|---|---|
| Pane **Istruttori** | È la gestione anagrafica (crea, disattiva, cluster, disponibilità). L'ordine non è un dato dell'istruttore, è un fatto di come si guarda l'agenda. |
| Popover **Visualizza** dell'agenda | Lì stanno le preferenze di vista (giorni, fascia oraria, zoom, colonne per veicolo) che sono **per-browser** (localStorage). L'ordine di Solferino deve essere lo stesso per il titolare e per le segretarie: è un setting di autoscuola, non di sessione. |
| Nuovo pane dedicato | Una seconda lista di istruttori nelle impostazioni per ordinarli, accanto a quella dove si scelgono i colori. Due liste della stessa cosa = confusione. |

**Decisione**: la sezione "Colori istruttori" diventa **"Istruttori in agenda"** —
una sola lista, due cose: si trascina per l'ordine, si tocca il pallino per il
colore. Zero superfici nuove.

## Come funziona il riordino

- **Drag & drop** con `Reorder` + `useDragControls` di `motion/react`: stesso
  identico pattern del pane Pagellino (maniglia `GripVertical`, `dragListener={false}`
  sulla riga così il drag parte solo dalla maniglia, `whileDrag` con ombra).
- **Auto-save al rilascio**, come ogni altra cosa in questo pane (nessun bottone
  Salva): ottimistico + rollback e toast se il salvataggio fallisce.
- **Tastiera**: la maniglia è un `<button>`; ↑/↓ spostano la riga. Il drag&drop
  puro sarebbe inaccessibile e la lista è cortissima (5-10 righe), costa 15 righe.
- Nota di riga: "1." "2." … no. Il numero d'ordine non aggiunge niente che la
  posizione verticale non dica già, e sporca una lista che è anche il pannello
  colori.

## Dove si applica l'ordine

Sorgente unica: `instructors` dell'agenda viene ordinato una volta sola
(`useMemo`), quindi **tutto quello che ne discende eredita l'ordine**: colonne
vista Giorno, filtro "Istruttori", select istruttore nei dialoghi (crea guida,
blocco, esame), anteprima di stampa. Le colonne della vista Settimana nascono
invece da `getInstructorAvailabilityForAgenda` (righe id+nome senza posizione):
si riordinano con lo stesso comparatore via mappa id→indice.

**Quello che NON cambia**: la palette colori posizionale degli istruttori senza
colore scelto resta agganciata all'**indice alfabetico** (due `sort` espliciti,
in agenda e in stampa). Se seguisse l'ordine custom, riordinare le colonne
ricolorerebbe mezza autoscuola — effetto collaterale inaccettabile per un
setting che si chiama "ordine". Stesso motivo per cui il pallino di anteprima
nel pane calcola il suo hex dall'indice alfabetico, non dalla posizione in lista.

## Casi limite

| Caso | Comportamento |
|---|---|
| Autoscuola che non ha mai toccato l'ordine | Lista vuota → tutto alfabetico, esattamente come oggi. |
| Istruttore **nuovo** dopo l'ordinamento | Non è nella lista → va **in fondo**, tra i non ordinati, in ordine alfabetico. Mai in testa, mai sparito. |
| Istruttore disattivato/cancellato | Il suo id resta nella lista ma non matcha nessuno: ignorato in lettura. Alla prima riordinata la lista si ripulisce da sola. |
| Colonna di sola disponibilità (id non nella directory) | Fallback alfabetico in coda, come i non ordinati. |
| Filtro istruttori attivo | Filtra e basta: l'ordine relativo resta quello custom. |
| Vista "colonne per Veicolo" (consorzio) | Non toccata: i veicoli hanno il loro ordine per nome. |

## Dati

Nessuna migrazione. `agendaInstructorOrder: string[]` nel JSON
`CompanyService.limits`, accanto agli altri setting d'aspetto dell'agenda
(`agendaColorCriterion`, `agendaColorOverrides`, `agendaColorExceptions`),
normalizzato da `asAgendaInstructorOrder`. Tre motivi:

1. l'agenda **legge già** `getAutoscuolaSettings` al mount per il criterio
   colore → l'ordine arriva senza una chiamata in più;
2. è già dietro la cache Redis SETTINGS, che `updateAutoscuolaSettings`
   invalida da sé;
3. una colonna `position` sull'istruttore avrebbe richiesto una migrazione su
   staging e su prod per un dato che è, letteralmente, una preferenza di vista.

## Permessi

Invariato: scrive chi può scrivere le impostazioni (`admin || owner`), cioè chi
già oggi apre il pane Aspetto da web. La lettura è aperta a tutti i membri
(stessa action `getAutoscuolaSettings`), quindi l'agenda di segretarie e
istruttori rispetta l'ordine scelto dal titolare.

## Verifica

- Unit test del comparatore (nessun ordine, ordine parziale, id fantasma,
  istruttore nuovo, ordine completo).
- Typecheck + `pnpm test:unit`.
- Preview reale su localhost via Playwright: pane con la lista trascinabile +
  agenda con le colonne nell'ordine scelto.
- Rilascio su **staging** (non prod): QA di Tiziano lì.
