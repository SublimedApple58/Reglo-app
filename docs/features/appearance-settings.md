# Aspetto (Impostazioni account)

Pannello "Aspetto" (icona tavolozza) nell'overlay Impostazioni dell'account:
personalizzazione visiva dell'agenda. Due sezioni: criterio colore dei blocchi
guida e colori istruttori (spostati qui da Gestisci istruttore, 2026-08-10).

## Data model

- Nessuna migrazione: `agendaColorCriterion` vive nel JSON `CompanyService.limits`
  (valori `"durata"` default | `"istruttore"`), normalizzato da
  `asAgendaColorCriterion`. Colore istruttore: `AutoscuolaInstructor.color`
  (vedi [instructor-colors.md](instructor-colors.md)).

## Files

| File | Role |
|------|------|
| `lib/autoscuole/agenda-color-criterion.ts` | Costante `AGENDA_COLOR_CRITERIA`, tipo, default, normalizzatore (modulo client-safe, condiviso action↔UI) |
| `lib/actions/autoscuole-settings.actions.ts` | `agendaColorCriterion` in patch schema, `AutoscuolaSettingsData`, `resolveAutoscuolaSettingsData`, `nextLimits` e risposta di `updateAutoscuolaSettings` |
| `components/pages/Autoscuole/AspettoSettingsPane.tsx` | Il pannello: card radio criterio (con anteprima chip) + righe colori istruttori con `ColorSwatchPicker` (prop `taken`) |
| `components/pages/Autoscuole/AutoscuoleResourcesPage.tsx` | Wiring: `ConfigPane` union, `CONFIG_PANE_GROUPS` (gruppo Istruttori/Veicoli), `CONFIG_PANE_TITLES`, `PANES_NEEDING_RESOURCES`, `KeepAlivePane`; passa `instructors` + `changeInstructorColor` |
| `components/ui/proto-icons.tsx` | `PaletteProtoIcon` (tavolozza) |
| `components/ui/color-swatch-picker.tsx` | Esteso con `taken?: string[]` (swatch disabilitati se usati da altri) |
| `components/pages/Autoscuole/AutoscuoleAgendaPage.tsx` | Legge il criterio al mount (`getAutoscuolaSettings`, cache Redis); `instructorBlockStyleMap`/`instructorBlockStyle` (hex → sfondo alpha 0.18 + ombra in tinta); override nei due siti di composizione (settimana `instrCardClass`, giorno `dayCardClass`); legenda dinamica |

## Behavior

- Criterio `"istruttore"`: SOLO le guide individuali normali prendono la tinta
  dell'istruttore (colore scelto o hex posizionale `LEGACY_INSTRUCTOR_HEX`).
  Esami (viola), gruppi (teal/arancio), blocchi istruttore e stati
  no_show/cancelled (grigio) restano invariati. Il ciano "cambio automatico"
  esiste solo col criterio durata.
- La legenda agenda mostra i bucket durata oppure la lista istruttori+tinta a
  seconda del criterio attivo.
- Setting a livello autoscuola (non per-utente); salvataggio auto-save con
  rollback su errore. Cache Redis limits invalidata da `updateAutoscuolaSettings`
  (l'agenda rilegge al mount successivo).
- In "Gestisci istruttore" (InstructorsTab) il picker colore NON esiste più.

## Mobile

Non consumato dal mobile: la palette blocchi mobile è duplicata client-side.
Se si vuole estendere, esporre `agendaColorCriterion` via settings API e
replicare la logica in `reglo-mobile` (follow-up deliberato).
