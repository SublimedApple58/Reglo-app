# Aspetto (Impostazioni account)

Pannello "Aspetto" (icona tavolozza) nell'overlay Impostazioni dell'account:
personalizzazione visiva dell'agenda. Due sezioni: criterio colore dei blocchi
guida (durata | tipo patente) e "Istruttori in agenda" — una sola lista dove si
trascina per l'**ordine delle colonne** (REG-449, 2026-09-13) e si tocca il
pallino per il **colore** (spostato qui da Gestisci istruttore, 2026-08-10). Il
colore istruttore tinge avatar/bande/stampa, NON i blocchi.

## Data model

- Nessuna migrazione: `agendaColorCriterion` (valori `"durata"` default |
  `"patente"`), `agendaColorOverrides` (`{ durata?, patente?, eccezioni?:
  {key→hex} }`, colori personalizzati per voce) e `agendaColorExceptions`
  (`{key→boolean}`, on/off delle eccezioni pre-costruite) vivono nel JSON
  `CompanyService.limits`, normalizzati da `asAgendaColorCriterion` /
  `asAgendaColorOverrides` / `asAgendaColorExceptions` (chiavi note, default
  dal registry). Colore istruttore: `AutoscuolaInstructor.color`
  (vedi [instructor-colors.md](instructor-colors.md)).
- Ordine colonne: `agendaInstructorOrder` (array di id istruttore) nello stesso
  JSON `limits`, normalizzato da `asAgendaInstructorOrder`. Elenco anche
  **parziale**; array vuoto = ordine alfabetico (il comportamento storico).

## Files

| File | Role |
|------|------|
| `lib/autoscuole/agenda-color-criterion.ts` | Costante `AGENDA_COLOR_CRITERIA`, tipo, default, normalizzatori + palette (`DURATION_COLOR_ENTRIES`, `LICENSE_COLOR_ENTRIES`, `durationColorEntry`, `licenseColorEntryForTag`) + `agendaBlockStyle(entry, overrideHex?)` (override → tinta alpha 0.20 **appiattita su bianco**, opaca, + custom property `--agenda-card-ring`/`--agenda-card-shadow` lette da `.agenda-card`, REG-468) — modulo client-safe, condiviso action↔UI |
| `lib/actions/autoscuole-settings.actions.ts` | `agendaColorCriterion` in patch schema, `AutoscuolaSettingsData`, `resolveAutoscuolaSettingsData`, `nextLimits` e risposta di `updateAutoscuolaSettings` |
| `lib/autoscuole/agenda-instructor-order.ts` | `asAgendaInstructorOrder` (normalizzatore), `agendaInstructorComparator` (ordinati per posizione, gli altri alfabetici in coda) e `sortInstructorsForAgenda` — modulo client-safe condiviso action↔agenda↔pane |
| `components/pages/Autoscuole/AspettoSettingsPane.tsx` | Il pannello: card radio criterio (anteprima chip override-aware) + link "Personalizza i colori" che apre on-demand la chip strip (una chip pillola per voce del criterio attivo, tap → `ColorSwatchPicker` via `renderTrigger`, reset "Colore standard") + lista "Istruttori in agenda": `Reorder`/`useDragControls` di `motion/react` (drag dalla sola maniglia, ↑/↓ da tastiera), auto-save al rilascio con rollback, link "Ripristina l'ordine alfabetico" + `ColorSwatchPicker` per riga (`taken`) |
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
  A1 smeraldo, A2 arancio, A rosa, C ambra, D fucsia, ADR ardesia, patente non
  impostata grigio. **REG-461**: una voce per OGNI patente gestita (anche
  CE/C1/C1E, DE/D1/D1E, CQC, ADR): le sotto-categorie hanno `parent` (C o D;
  la CQC ha C) ed ereditano colore standard E override della madre finché non
  vengono personalizzate (`resolveColorOverride`). Nel pannello le chip sono
  raggruppate (`LICENSE_COLOR_GROUPS`: Auto, Moto, Camion, Autobus,
  Qualificazioni, Altro); la legenda agenda fonde nella riga della madre le
  sotto-categorie con lo stesso colore (`licenseLegendEntries`). Mirror mobile:
  `reglo-mobile/src/utils/agendaColors.ts`. Esami (viola), gruppi (teal/arancio), blocchi istruttore
  e stati no_show/cancelled (grigio) restano invariati.
- Colori personalizzabili per voce (entrambi i criteri): l'hex scelto dalla
  palette del picker viene declinato in tinta soft (alpha 0.20) + ombra in
  tinta così testo/badge restano leggibili; "Colore standard" rimuove
  l'override. I default replicano 1:1 le vecchie classi Tailwind.
- **REG-468 — contrasto blocco ↔ colonna istruttore**: ogni blocco dell'agenda
  (guide, esami, gruppi, blocchi istruttore, annullate) porta la classe
  `.agenda-card` (`assets/styles/globals.css`): alone bianco esterno + bordo
  1px interno nella tinta del blocco + ombra. Le tinte arrivano da
  `--agenda-card-ring` / `--agenda-card-shadow` — inline per le guide
  (`agendaBlockStyle`), come classe arbitraria per esami/gruppi/`blockTint`.
  Prima i pastelli dei blocchi si fondevano con la banda della colonna (stessa
  famiglia di colore) e con gli override, che erano **translucidi** (rgba
  0.20): ora la tinta override è appiattita su bianco, quindi opaca.
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
- **Ordine degli istruttori in agenda** (REG-449): l'ordine scelto nel pannello
  vale per tutta l'autoscuola e si applica a colonne vista Settimana, colonne
  vista Giorno, filtro "Istruttori", select istruttore dei dialoghi e anteprima
  di stampa. In `AutoscuoleAgendaPage` la lista `instructors` viene ordinata una
  volta sola (`sortInstructorsForAgenda`) e tutto il resto la eredita; le colonne
  della vista Settimana nascono invece dalle righe di
  `getInstructorAvailabilityForAgenda` e passano per lo stesso comparatore
  (`columnOrderComparator`). Casi limite: istruttore **nuovo** → in fondo, mai in
  mezzo; id di istruttore non più esistente → ignorato; filtro istruttori attivo →
  filtra soltanto, l'ordine relativo resta. La vista "colonne per Veicolo"
  (consorzio) non è toccata.
- ⚠️ La **palette colori posizionale** degli istruttori senza colore scelto resta
  agganciata all'**indice alfabetico** (due `sort` espliciti in agenda + stampa, e
  `alphaIndexById` nel pannello): riordinare le colonne non deve ricolorare
  nessuno.
- Setting a livello autoscuola (non per-utente); salvataggio auto-save con
  rollback su errore. Cache Redis limits invalidata da `updateAutoscuolaSettings`
  (l'agenda rilegge al mount successivo).
- In "Gestisci istruttore" (InstructorsTab) il picker colore NON esiste più.

## Mobile

L'endpoint `/api/autoscuole/settings` è **già completo per il mobile**: auth via
`requireServiceAccess` → `getActiveCompanyContext`, che accetta sia session web
sia bearer token mobile.

- **Ordine istruttori (REG-449)**: `agendaInstructorOrder` viaggia nello stesso
  payload GET ma il **mobile non lo consuma** (feature web-only per scelta: in
  app l'agenda istruttore è la propria, non una griglia di colonne). Se un domani
  servisse, basta ordinare la lista con `sortInstructorsForAgenda`.
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
