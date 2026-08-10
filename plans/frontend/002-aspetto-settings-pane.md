# Sezione "Aspetto" nelle Impostazioni account (web)

**Stato: implementato 2026-08-10** su branch `feature/aspetto-settings` (in attesa
di verifica locale di Tiziano prima di staging/prod).

## Cosa è stato fatto

- Nuovo pannello `AspettoSettingsPane.tsx` (icona `PaletteProtoIcon`) nel gruppo
  Istruttori/Veicoli dell'overlay Impostazioni: card radio criterio colore
  agenda (con anteprima chip) + righe "Colori istruttori".
- Colore istruttore SPOSTATO (non duplicato) da "Gestisci istruttore": rimossi
  `ColorPop`, swatch e prop `changeInstructorColor` da `InstructorsTab`;
  riusato `ColorSwatchPicker` (era orfano) esteso con `taken`.
- Nuovo setting company `agendaColorCriterion` (`"durata"` default |
  `"patente"`) nel JSON `CompanyService.limits` — nessuna migrazione DB.
  Modulo condiviso `lib/autoscuole/agenda-color-criterion.ts` (+ palette
  patenti `LICENSE_COLOR_ENTRIES`).
- Agenda: col criterio "patente" le guide normali prendono il colore della
  patente della guida (via `licenseTagFor`; " autom." → ciano, così B ≠ B
  automatica); esami/gruppi/blocchi/annullate-assenti invariati; legenda
  dinamica; `LEGACY_INSTRUCTOR_HEX` condiviso con la stampa.

## Piano originale (fasi)

1. Scheletro pannello Aspetto (icona + 4 punti di wiring in ResourcesPage)
2. Spostamento colore istruttore (picker + rimozione da InstructorsTab)
3. Backend criterio colore (patch schema + resolve + nextLimits + risposta)
4. Controllo criterio nel pannello (card radio + anteprima)
5. Applicazione in agenda (2 siti di composizione + legenda)
6. Docs + QA

## Decisioni prese in corso

- Setting a livello autoscuola (infra `CompanyService.limits` esistente), non
  per-utente.
- 2 criteri, campo estendibile (`AGENDA_COLOR_CRITERIA`).
- **Amendment 2026-08-10**: il secondo criterio era nato come "istruttore";
  su richiesta di Tiziano è diventato "tipo patente" (B distinta da B
  automatica). Il colore istruttore resta solo su avatar/bande/stampa.
- Rimozione secca del picker da Gestisci istruttore (nessun hint residuo).
- Il ciano "cambio automatico" esiste solo col criterio durata.
- Mobile fuori scope (palette duplicata client-side): follow-up separato.

## Docs

`docs/features/appearance-settings.md` (nuova), `instructor-colors.md`
aggiornata, `INDEX.md` + `impact-map.md` aggiornati.
