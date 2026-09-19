# Filtri nella sezione Allievi (REG-469)

> **Stato:** implementato, su **staging**, in attesa della conferma di design.

## La richiesta

"Nella sezione ALLIEVI aggiungere filtri: per patente, tipo cambio, luogo etc.
**DA FARE NELLO STESSO IDENTICO DESIGN DEI FILTRI NELLA SEZIONE AGENDA.**"

## Come è stato fatto

**Estratto, non copiato.** Il controllo dell'agenda — bottone "Filtri" col
pallino, menu delle voci, dialog con le caselle a multi-selezione — viveva
inline dentro `AutoscuoleAgendaPage.tsx` (un IIFE nella toolbar più un `Dialog`
1500 righe più in basso). È diventato
`components/pages/Autoscuole/filters/ToolbarFilters.tsx`, e ora lo usano
entrambe le pagine.

"Stesso identico design" chiedeva questo: due copie si somigliano finché
qualcuno non tocca una delle due. Così sono lo stesso file.

Il componente possiede solo lo stato dell'interfaccia (menu aperto, bozza in
modifica). I valori restano della pagina: l'agenda ricalcola gli appuntamenti,
Allievi ricalcola la lista.

## I quattro filtri

Patente, Cambio, Luogo, Istruttore — l'"etc." del ticket. Le opzioni di Patente
e Cambio si ricavano dagli allievi **non filtrati**, altrimenti filtrando "B"
sparirebbero A1 e A2 dal dialog e non si potrebbe più allargare la selezione.
Luogo e Istruttore hanno la voce "Senza", che è una domanda che il titolare fa
davvero.

I gruppi Luogo e Istruttore spariscono del tutto se l'autoscuola non ha luoghi o
istruttori: un filtro sempre vuoto è solo rumore.

## Scelte da ricordare

- **`filteredStudents` sta prima di `studentsByPhase`**: contatori dei tab,
  paginazione, selezione multipla e blocco in bulk (REG-442) ereditano il filtro
  senza saperne niente. "Seleziona tutti" seleziona i **filtrati**.
- **La testata diventa "X di Y allievi"** con un filtro attivo. Lasciare il
  totale mentre la lista ne mostra meno è una contraddizione a schermo.
- **Le liste vuote distinguono** "non c'è nessuno" da "l'hai nascosto tu".
- **Persistenza come l'agenda** (`localStorage`), letta **dopo il mount** — sul
  server `localStorage` non esiste — con pulizia degli id spariti, altrimenti un
  luogo archiviato svuoterebbe la lista senza spiegazioni.

## Verifiche

Su dev, col browser: menu con le quattro voci, dialog "Filtra per patente" con
le sole categorie presenti (A1, A2, B), filtro "B" applicato → **35 → 28**
allievi e testata "28 di 35 allievi", "Rimuovi filtri" → di nuovo 35.
Confronto affiancato agenda/Allievi: menu e dialog identici.

`tsc --noEmit` pulito, lint pulito (l'unico warning su `AutoscuoleAgendaPage`
esisteva già identico prima del refactor, verificato con `git stash`).

## Un problema trovato per strada, NON mio

Sull'agenda in **locale** i filtri Istruttore e Veicolo risultano vuoti. Non è
una regressione del refactor: si ripresenta identico anche con le mie modifiche
stashate. La causa è l'ambiente — `/api/autoscuole/agenda/bootstrap` risponde
**400** sul dev server perché quel processo tiene in memoria un client Prisma
vecchio (mancano le colonne aggiunte oggi da REG-409 e REG-442). Serve un
riavvio del dev server, che è nel terminale di Tiziano.

Di conseguenza la verifica dei filtri dell'agenda è stata fatta **su staging**,
dove il server è fresco.

Anteprime: `/tmp/hiro-anteprime/reg-469/`.
