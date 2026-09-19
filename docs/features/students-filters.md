# Filtri della lista Allievi (REG-469)

Filtri multi-selezione nella toolbar di **Allievi**, con lo **stesso identico
design di quelli dell'agenda** — richiesta esplicita del ticket. Non una copia:
lo stesso componente.

## Files

| File | Ruolo |
|------|------|
| `components/pages/Autoscuole/filters/ToolbarFilters.tsx` | Il controllo: bottone "Filtri" col pallino, menu delle voci, dialog con le caselle. **Condiviso** con l'agenda. |
| `components/pages/Autoscuole/AutoscuoleStudentsPage.tsx` | Stato dei filtri, opzioni, `filteredStudents`, persistenza. |
| `components/pages/Autoscuole/AutoscuoleAgendaPage.tsx` | Usa lo stesso componente (prima aveva il markup inline). |

## I quattro filtri

| Filtro | Sorgente delle opzioni | Note |
|--------|------------------------|------|
| **Patente** | Le categorie **presenti fra gli allievi**, ordinate | Mostra solo quello che l'autoscuola ha davvero |
| **Cambio** | `TRANSMISSIONS` presenti fra gli allievi | Manuale / Automatico |
| **Luogo** | `getAutoscuolaLocations` + "Senza luogo" | Il gruppo sparisce se non ci sono luoghi |
| **Istruttore** | `instructorMap` + "Senza istruttore" | Il gruppo sparisce se non ci sono istruttori |

Le opzioni di Patente e Cambio si ricavano dagli allievi **non filtrati**:
altrimenti filtrando per "B" sparirebbero A1 e A2 dal dialog, e non si potrebbe
più allargare la selezione senza azzerare.

Le voci "Senza luogo" / "Senza istruttore" (valore `__none__`) esistono perché
sono una domanda che il titolare fa davvero: *chi non ha ancora un istruttore?*

## Dove si applica

`filteredStudents` sta **prima** di `studentsByPhase`. Così contatori dei tab,
paginazione, selezione multipla e blocco in bulk (REG-442) vedono tutti la
stessa lista senza doverlo sapere.

La testata passa a **"X di Y allievi"** quando un filtro è attivo: lasciare il
totale mentre la lista ne mostra meno è una contraddizione a schermo. E le liste
vuote distinguono "non c'è nessuno" da "l'hai nascosto tu"
(*"Nessun allievo con questi filtri"*).

## Persistenza

`localStorage["reglo-students-filters"]`, come l'agenda
(`reglo-agenda-filters`). Si legge **dopo il mount**, non nello stato iniziale:
sul server `localStorage` non esiste e leggerlo lì farebbe divergere l'HTML.

Un `useEffect` toglie gli id che non esistono più (luogo archiviato, istruttore
rimosso, cambio autoscuola): un filtro fantasma svuoterebbe la lista senza che
si capisca perché.

## Connections

- → **Agenda**: `ToolbarFilters` è lo stesso file. Chi lo tocca cambia entrambe
  le pagine — è il motivo per cui esiste. L'agenda ci passa Istruttore, Veicolo
  (solo con `vehiclesEnabled`), Tipo e Stato.
- → **Blocco prenotazioni in bulk** (`bulk-booking-block.md`): la selezione
  multipla agisce su `selectableList`, che discende da `studentsByPhase` e
  quindi rispetta i filtri. "Seleziona tutti" seleziona i **filtrati**.
- → **Locations** (`locations.md`) e **REG-392**: il filtro Luogo legge
  `CompanyMember.defaultLocationId`.
- → **Student phase** (`student-phase.md`): i filtri sono ortogonali ai tab di
  fase, si sommano.
