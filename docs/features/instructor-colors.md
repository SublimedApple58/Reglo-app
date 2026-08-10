# Instructor Colors

Owner-picked display color per instructor, used for the instructor's avatar
and availability bands in the web agenda. Falls back to the legacy positional
palette when unset. Dal 2026-08-10 il picker vive in Impostazioni → **Aspetto**
([appearance-settings.md](appearance-settings.md)), non più in Gestisci
istruttore; col criterio colore `"istruttore"` la tinta colora anche i blocchi
guida normali.

## Data model

- `AutoscuolaInstructor.color String?` — hex (`#RRGGBB`), null = automatic.
  Migration: `20260702145705_instructor_display_color` (additive).

## Files

| File | Role |
|------|------|
| `lib/autoscuole/instructor-colors.ts` | Curated palette (16 swatches) + tint derivation (`instructorTintStyles`: band alpha 0.10, avatar alpha 0.16, darkened text) |
| `components/ui/color-swatch-picker.tsx` | `ColorSwatchPicker` — custom picker (no native input): 7×7 trigger dot + dropdown swatch grid + "Automatico" reset + `taken` (swatch di altri istruttori disabilitati); awaits `onSelect` with spinner. Usato da `AspettoSettingsPane` (il vecchio `ColorPop` di InstructorsTab è stato rimosso 2026-08-10) |
| `components/pages/Autoscuole/AutoscuoleResourcesPage.tsx` | `changeInstructorColor` handler → `updateAutoscuolaInstructor({ instructorId, color })` + local state sync |
| `lib/actions/autoscuole.actions.ts` | `updateInstructorSchema.color` (hex regex, nullable) — OWNER only (stripped for self-instructor); persisted in `updateAutoscuolaInstructor` |
| `components/pages/Autoscuole/AutoscuoleAgendaPage.tsx` | `instructorColorMap` resolves stored hex → inline-style tints, else positional `INSTRUCTOR_COLORS`; `tintFor(id, idx)` fallback. Used by week/day avatars + availability bands |

## Behavior

- Only the owner can change it (`updateAutoscuolaInstructor` strips `color`
  for self-instructor edits, like `name`/`status`).
- Save is await-based (no optimistic UI): picker trigger spins until the
  action resolves, then local list state is updated.
- Agenda: con criterio colore `"durata"` (default) le event card tengono la
  palette durata/tipo e il colore istruttore tinge solo avatar e bande; con
  criterio `"istruttore"` colora anche i blocchi guida normali (vedi
  [appearance-settings.md](appearance-settings.md)).
- Custom hex → inline styles; unset → legacy Tailwind classes by alphabetical
  index (unchanged look for schools that never pick colors).

## Mobile

`color` flows automatically through `GET /api/autoscuole/instructors` and the
agenda bootstrap (both return raw `AutoscuolaInstructor` rows) — mobile does
not consume it yet.
