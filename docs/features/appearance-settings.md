# Aspetto (Impostazioni account)

Pannello "Aspetto" (icona tavolozza) nell'overlay Impostazioni dell'account:
personalizzazione visiva dell'agenda. Due sezioni: criterio colore dei blocchi
guida (durata | tipo patente) e colori istruttori (spostati qui da Gestisci
istruttore, 2026-08-10). Il colore istruttore tinge avatar/bande/stampa, NON i
blocchi.

## Data model

- Nessuna migrazione: `agendaColorCriterion` (valori `"durata"` default |
  `"patente"`) e `agendaColorOverrides` (`{ durata?: {key→hex}, patente?:
  {key→hex} }`, colori personalizzati per voce) vivono nel JSON
  `CompanyService.limits`, normalizzati da `asAgendaColorCriterion` /
  `asAgendaColorOverrides` (chiavi note + hex validi). Colore istruttore:
  `AutoscuolaInstructor.color` (vedi [instructor-colors.md](instructor-colors.md)).

## Files

| File | Role |
|------|------|
| `lib/autoscuole/agenda-color-criterion.ts` | Costante `AGENDA_COLOR_CRITERIA`, tipo, default, normalizzatori + palette (`DURATION_COLOR_ENTRIES`, `LICENSE_COLOR_ENTRIES`, `durationColorEntry`, `licenseColorEntryForTag`) + `agendaBlockStyle(entry, overrideHex?)` (override → tinta alpha 0.20 + ombra in tinta) — modulo client-safe, condiviso action↔UI |
| `lib/actions/autoscuole-settings.actions.ts` | `agendaColorCriterion` in patch schema, `AutoscuolaSettingsData`, `resolveAutoscuolaSettingsData`, `nextLimits` e risposta di `updateAutoscuolaSettings` |
| `components/pages/Autoscuole/AspettoSettingsPane.tsx` | Il pannello: card radio criterio (anteprima chip override-aware) + link "Personalizza i colori" che apre on-demand la chip strip (una chip pillola per voce del criterio attivo, tap → `ColorSwatchPicker` via `renderTrigger`, reset "Colore standard") + righe colori istruttori (`taken`) |
| `components/pages/Autoscuole/AutoscuoleResourcesPage.tsx` | Wiring: `ConfigPane` union, `CONFIG_PANE_GROUPS` (gruppo Istruttori/Veicoli), `CONFIG_PANE_TITLES`, `PANES_NEEDING_RESOURCES`, `KeepAlivePane`; passa `instructors` + `changeInstructorColor` |
| `components/ui/proto-icons.tsx` | `PaletteProtoIcon` (tavolozza) |
| `components/ui/color-swatch-picker.tsx` | Esteso con `taken?: string[]` (swatch disabilitati se usati da altri) |
| `components/pages/Autoscuole/AutoscuoleAgendaPage.tsx` | Legge criterio+overrides al mount (`getAutoscuolaSettings`, cache Redis); `guideBlockColorStyle(item, licenseTag)` applica stile inline nei due siti di composizione (settimana `instrCardClass`, giorno `dayCardClass`) per ENTRAMBI i criteri; legenda dinamica override-aware |

## Behavior

- Criterio `"patente"`: SOLO le guide individuali normali prendono il colore
  della patente della guida, risolta via `licenseTagFor`/`studentLicenseById`
  (categoria allievo + suffisso " autom."). Il suffisso automatico vince sulla
  categoria → ciano dedicato (stesso hex del criterio durata): è così che una
  B automatica si distingue da una B. Famiglie: B blu, BE indaco, AM lime,
  A1 smeraldo, A2 arancio, A rosa, C/CE ambra, D/DE fucsia, patente non
  impostata grigio. Esami (viola), gruppi (teal/arancio), blocchi istruttore
  e stati no_show/cancelled (grigio) restano invariati.
- Colori personalizzabili per voce (entrambi i criteri): l'hex scelto dalla
  palette del picker viene declinato in tinta soft (alpha 0.20) + ombra in
  tinta così testo/badge restano leggibili; "Colore standard" rimuove
  l'override. I default replicano 1:1 le vecchie classi Tailwind.
- La legenda agenda mostra i bucket durata oppure la palette patenti a
  seconda del criterio attivo, coi colori personalizzati applicati.
- Setting a livello autoscuola (non per-utente); salvataggio auto-save con
  rollback su errore. Cache Redis limits invalidata da `updateAutoscuolaSettings`
  (l'agenda rilegge al mount successivo).
- In "Gestisci istruttore" (InstructorsTab) il picker colore NON esiste più.

## Mobile

Non consumato dal mobile: la palette blocchi mobile è duplicata client-side.
Se si vuole estendere, esporre `agendaColorCriterion` via settings API e
replicare la logica in `reglo-mobile` (follow-up deliberato).
