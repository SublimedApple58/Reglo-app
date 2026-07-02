# Piano — Colore personalizzato per istruttore (web)

> **Stato: implementato (2026-07-02, branch `feat/fix-macchiavello`).**
> Fatto: campo `AutoscuolaInstructor.color` (hex, nullable) + migration
> `20260702145705_instructor_display_color`; `updateAutoscuolaInstructor`
> accetta `color` (solo OWNER); `ColorSwatchPicker` custom (16 swatch +
> "Automatico") come prima azione sulla card istruttore in Configurazione →
> Istruttori; agenda (avatar giorno/settimana + bande disponibilità) usa il
> colore salvato con fallback alla palette posizionale. Docs in
> `docs/features/instructor-colors.md`.

## Piano originale approvato

### Fase 1 – Persistenza
- Nuovo campo `color String?` su `AutoscuolaInstructor` (migration additiva, hex).
- Estensione `updateInstructorSchema` + `updateAutoscuolaInstructor` (solo OWNER).
- Il campo fluisce automaticamente nella GET `/api/autoscuole/instructors`.

### Fase 2 – Color picker custom
- Componente `ColorSwatchPicker`: bottone tondo nella riga azioni della card
  (pallino con il colore corrente), popover con griglia di ~16 swatch curati +
  opzione "Automatico". Niente picker nativo del browser.
- Salvataggio immediato alla selezione (spinner, niente optimistic).

### Fase 3 – Agenda e avatar
- Avatar (vista giorno + settimana) e bande di disponibilità usano il colore
  salvato; se non impostato → fallback alla palette posizionale attuale.
- Varianti (sfondo tenue, testo scuro) derivate programmaticamente dall'hex.

### Fase 4 – Docs
- `docs/features/instructor-colors.md` + INDEX + impact-map.

## Amendment
- Nessuna preview iterativa: l'utente ha chiesto implementazione diretta.
- Mobile fuori scope: il campo `color` è già esposto dalle API ma non consumato.
