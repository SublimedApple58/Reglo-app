# Aspetto (Impostazioni account)

Pannello "Aspetto" (icona tavolozza) nell'overlay Impostazioni dell'account:
personalizzazione visiva dell'agenda. Due sezioni: criterio colore dei blocchi
guida (durata | tipo patente) e colori istruttori (spostati qui da Gestisci
istruttore, 2026-08-10). Il colore istruttore tinge avatar/bande/stampa, NON i
blocchi.

## Data model

- Nessuna migrazione: `agendaColorCriterion` (valori `"durata"` default |
  `"patente"`), `agendaColorOverrides` (`{ durata?, patente?, eccezioni?:
  {key→hex} }`, colori personalizzati per voce) e `agendaColorExceptions`
  (`{key→boolean}`, on/off delle eccezioni pre-costruite) vivono nel JSON
  `CompanyService.limits`, normalizzati da `asAgendaColorCriterion` /
  `asAgendaColorOverrides` / `asAgendaColorExceptions` (chiavi note, default
  dal registry). Colore istruttore: `AutoscuolaInstructor.color`
  (vedi [instructor-colors.md](instructor-colors.md)).

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
- **Eccezioni pre-costruite** (`AGENDA_COLOR_EXCEPTIONS`, registry nel modulo
  condiviso): regole toggleabili che VINCONO sul criterio (prima che matcha
  vince, in ordine di registry), ognuna con colore personalizzabile
  (namespace `eccezioni`) e con un campo `criteria` che dice in quali
  criteri ha senso (mostrata + applicata solo lì). Attuali: `automatic`
  (veicolo/percorso automatico → ciano, **ON di default**, SOLO criterio
  durata — nel criterio patente la distinzione B/B autom. è NATIVA, voce
  `autom` della palette patenti), `exam_ready` (allievo "Pronto per
  l'esame" → viola, OFF, entrambi i criteri), `moto` (patente AM/A1/A2/A →
  stesso arancio per tutte, OFF, entrambi — nel criterio patente significa
  collassare le patenti moto in un colore unico). Match in
  `guideBlockColorStyle` via `isAutomaticLesson` + `studentColorFlagsById`
  (directory allievi: `licenseCategory`/`isMotoLicenseCategory`, `examReady`).
- Nel pannello le eccezioni sono nascoste dietro il link "Eccezioni" (badge
  col conteggio delle attive), accordion mutuamente esclusivo con
  "Personalizza i colori"; la lista mostra solo quelle del criterio attivo.
- La legenda mostra una sezione "Eccezioni" con le sole attive del criterio.
- La legenda agenda mostra i bucket durata oppure la palette patenti a
  seconda del criterio attivo, coi colori personalizzati applicati.
- Setting a livello autoscuola (non per-utente); salvataggio auto-save con
  rollback su errore. Cache Redis limits invalidata da `updateAutoscuolaSettings`
  (l'agenda rilegge al mount successivo).
- In "Gestisci istruttore" (InstructorsTab) il picker colore NON esiste più.

## Mobile

L'endpoint `/api/autoscuole/settings` è **già completo per il mobile**: auth via
`requireServiceAccess` → `getActiveCompanyContext`, che accetta sia session web
sia bearer token mobile.

- **Lettura (GET)**: `getAutoscuolaSettings` espone `agendaColorCriterion`,
  `agendaColorOverrides` e `agendaColorExceptions` a tutti i membri (nessun gate
  owner/admin), così anche un istruttore normale può leggere il criterio per il
  rendering. **Consumato dal mobile** (REG-403): la palette blocchi mobile è
  duplicata client-side in `reglo-mobile/src/utils/agendaColors.ts` (porta 1:1
  degli hex/soglie/eccezioni con resa "Airbnb soft" volutamente più soft del web)
  e legge questi campi via `AutoscuolaSettings`. Se cambiano hex/soglie/eccezioni
  o si aggiunge un criterio qui, aggiornare in parallelo quel file mobile.
- **Scrittura (PATCH)**: due strade sullo **stesso** JSON `limits`, dati coerenti.
  - **Web** (`AspettoSettingsPane`): `updateAutoscuolaSettings` (broad) —
    `canManageSettings = admin || isOwner`. Invariato.
  - **Mobile** (REG-403, pannello "Aspetto agenda"): endpoint **scoped**
    `PATCH /api/autoscuole/agenda-colors` → `updateAgendaColorSettings`, gate
    `canManageAgendaColors = admin || owner || instructor`. Scrive SOLO i 3 campi
    `agendaColor*` (nessun altro setting sensibile), quindi il permesso è allargato
    agli **istruttori** in sicurezza. Implementato in
    `reglo-mobile/src/screens/AppearanceSettingsScreen.tsx`. Per estendere l'editing
    agli istruttori **anche da web**, spostare le 3 chiamate del pane su questa
    action ed esporre il pane ai ruoli non-owner.
