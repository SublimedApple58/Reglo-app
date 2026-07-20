# Instructor Hours (Ore di guida)

## What it does
Reports an instructor's completed driving hours, with the share worked **outside** the configured working-hours window. Two consumption modes via one route.

## Key files
- `lib/actions/autoscuole.actions.ts`:
  - `getInstructorDrivingHours({ instructorId?, weekStart, monthStart? })` → **legacy** week+month shape (`InstructorHoursEntry`: `weekly.byDay`, `monthly`). Used by the **web dashboard**.
  - `getInstructorDrivingHoursRange({ instructorId?, from, to })` → **range** shape (`InstructorHoursRange`: `total`, `buckets[]`, `granularity`). Used by the **mobile** period selector.
  - Helpers: `computeOutsideMinutes` (Europe/Rome window clamp), `ITALY_DAY_LABELS`, `ITALY_MONTH_LABELS`, `parseInstructorSettings`.
- `app/api/autoscuole/instructor-hours/route.ts` — GET; branches: `from`&`to` → range action; else `weekStart` → legacy action.
- `components/pages/Autoscuole/InstructorHoursDashboard.tsx` — web dashboard (legacy shape).

## Range mode
- `from`/`to` inclusive `YYYY-MM-DD`. Granularity derived server-side: span ≤ 14 days → daily buckets; longer → Mon–Sun weekly buckets.
- Appointments counted: `status in (completed, checked_in, no_show)`, `type != esame`, `startsAt ∈ [from, to+1)`.
- Authorization mirrors the legacy action: instructor sees own; owner/admin sees all (or a specific `instructorId`).
- **No DB migration.** Read-only over `AutoscuolaAppointment`.

## Ore di lezione teorica (categoria separata)
Entrambe le action includono `theoryMinutes` (block `AutoscuolaInstructorBlock`
con `reason:"theory_lesson"` nello stesso range): shape legacy `weekly.theoryMinutes`
+ `weekly.byDay[].theoryMinutes` + `monthly.theoryMinutes`; shape range
`total.theoryMinutes` + `buckets[].theoryMinutes`. **NON** sono sommate a
`totalMinutes` (che resta solo guide). Web: pill indaco "Lezione teorica" nella
card istruttore + totale team header. Mobile: card indaco nell'hero. Vedi
`features/lezione-teorica.md`.

## Connected features
- **Instructor Clusters / Settings** — `workingHoursStart/End` (the window for "fuori orario") comes from instructor settings.
- **Lezione teorica** — le ore teoriche compaiono qui come categoria separata (`theoryMinutes`).
- **Mobile** — `reglo-mobile` Ore di guida screen + `more/hours-period` period picker consume the range shape.
