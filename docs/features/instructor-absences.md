# Instructor absences (Malattia / Ferie)

## What it does
Per-instructor time-off managed in **Impostazioni account → Istruttori → [istruttore]**, in two **separate** tabs — **Malattia** and **Ferie** — that do the *exact same thing* functionally but send a **different student notification**. Marking an absence over a date range (with optional half-day start) creates a full-day block per day, **cancels overlapping lessons**, refunds credits, and **notifies students**. Shown on the agenda (web + mobile) on that instructor's column; blocks booking.

## Data model
Reuses **`AutoscuolaInstructorBlock`** (no new table): one full-day block per day, `reason = "sick_leave"` (malattia) or `reason = "ferie"` (ferie). Same rendering/booking-block machinery for both.

## Key files
- `app/api/autoscuole/instructor-sick-leave/route.ts` — malattia: writes `sick_leave` blocks + cancels lessons with reason `instructor_sick`.
- `app/api/autoscuole/instructor-vacation/route.ts` — ferie: writes `ferie` blocks + cancels lessons with reason `instructor_vacation` (clone of sick-leave).
- `lib/autoscuole/operational-cancellation.ts` — per-reason student notification copy: `instructor_sick` = "🤒 …in malattia", `instructor_vacation` = "🌴 …in ferie".
- `lib/actions/autoscuole.actions.ts` — `listInstructorSickLeaves`/`deleteInstructorSickLeave` (reason `sick_leave`), `listInstructorFerie`/`deleteInstructorFerie` (reason `ferie`).
- `components/pages/Autoscuole/tabs/InstructorsTab.tsx` — `MalattiaTab` + `FerieTab` (clone: same UI, ferie copy, toast instead of overlay).
- `components/pages/Autoscuole/AutoscuoleAgendaPage.tsx` — `formatBlockReason`/`blockTint`: Malattia = arancio, Ferie = teal, generico = grigio.

## Colour palette (shared web ↔ mobile)
Malattia `#C2410C`, Ferie `#0F766E` (teal), Festivo aziendale `#D97706` (ambra), blocco generico grigio. Mobile mirror: `reglo-mobile/src/utils/weeklyAgenda.ts` `BLOCK_PRESENTATION`.

## Connected features
- **Appointments** — cancels overlapping lessons (`operationallyCancelAppointment`).
- **Holidays** — parallel concept: festivo = company-wide (`AutoscuolaHoliday`), ferie/malattia = per-instructor (`AutoscuolaInstructorBlock`).
- **Notifications** — `appointment_cancelled` push/email with reason-specific wording.
