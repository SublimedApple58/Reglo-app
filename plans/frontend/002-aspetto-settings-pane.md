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
  `"istruttore"`) nel JSON `CompanyService.limits` — nessuna migrazione DB.
  Modulo condiviso `lib/autoscuole/agenda-color-criterion.ts`.
- Agenda: col criterio "istruttore" le guide normali prendono la tinta
  dell'istruttore (`instructorBlockStyle`, alpha 0.18 + ombra in tinta);
  esami/gruppi/blocchi/annullate-assenti invariati; legenda dinamica;
  `LEGACY_INSTRUCTOR_HEX` condiviso con la stampa.

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
- Rimozione secca del picker da Gestisci istruttore (nessun hint residuo).
- Il ciano "cambio automatico" esiste solo col criterio durata.
- Mobile fuori scope (palette duplicata client-side): follow-up separato.

## Docs

`docs/features/appearance-settings.md` (nuova), `instructor-colors.md`
aggiornata, `INDEX.md` + `impact-map.md` aggiornati.
