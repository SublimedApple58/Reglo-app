# Instructor Hours (Ore di guida)

## What it does
Reports an instructor's completed driving hours, with the share worked **outside** the configured working-hours window, plus — nella settimana mostrata — quante delle ore **dichiarate in agenda** sono davvero **occupate** (REG-444). Two consumption modes via one route.

## Key files
- `lib/actions/autoscuole.actions.ts`:
  - `getInstructorDrivingHours({ instructorId?, weekStart, monthStart? })` → **legacy** week+month shape (`InstructorHoursEntry`: `weekly.byDay`, `monthly`). Used by the **web dashboard**.
  - `getInstructorDrivingHoursRange({ instructorId?, from, to })` → **range** shape (`InstructorHoursRange`: `total`, `buckets[]`, `granularity`). Used by the **mobile** period selector.
  - Helpers: `computeOutsideMinutes` (Europe/Rome window clamp), `ITALY_DAY_LABELS`, `ITALY_MONTH_LABELS`, `parseInstructorSettings`.
- `app/api/autoscuole/instructor-hours/route.ts` — GET; branches: `from`&`to` → range action; else `weekStart` → legacy action.
- `components/pages/Autoscuole/AutoscuoleOreGuidaPage.tsx` — la pagina web (overlay `/user/autoscuole/ore-guida`, raggiungibile dal menu hamburger). Legge la shape legacy.
- `components/pages/Autoscuole/ore-guida-export.ts` — `buildOreGuidaCsv` + `downloadCsv` (export, REG-444/ex REG-447).
- `lib/autoscuole/agenda-occupancy.ts` — ore dichiarate vs occupate: funzioni pure, nessun Prisma. Unit test `tests/unit/autoscuole/agenda-occupancy.test.ts`.

## Range mode
- `from`/`to` inclusive `YYYY-MM-DD`. Granularity derived server-side: span ≤ 14 days → daily buckets; longer → Mon–Sun weekly buckets.
- Appointments counted: `status in (completed, checked_in, no_show)`, `type != esame`, `startsAt ∈ [from, to+1)`.
- **`record_cleanup` + asimmetria `keepInHours` (2026-07-20)**: la "Rimuovi dallo storico" (`removeAppointmentFromRecord`) marca `cancellationKind = "record_cleanup"` ma il suo effetto sulle ORE dipende dall'opzione scelta dal titolare:
  - **`keepInHours = false`** (default): `status → cancelled` → la guida esce anche dalle ore (le action filtrano solo `completed`/`checked_in`/`no_show`).
  - **`keepInHours = true`**: **stato invariato** (es. `completed`) → la guida **CONTINUA a contare** nelle ore dell'istruttore anche se è sparita dallo storico allievo e dall'agenda. Il conteggio ore filtra solo per `status`, **non** per `cancellationKind`, quindi non serve alcuna modifica qui. È una **asimmetria voluta**: fuori dallo storico allievo, dentro le ore istruttore (la guida è stata comunque svolta). Vedi `features/appointments.md`.
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

## Ore disponibili vs occupate (REG-444)
`weekly.occupancy` (`AgendaOccupancy`) sta nella shape legacy — **solo web**, la shape
range del mobile non è stata toccata. Calcolata **solo sulla settimana mostrata**: il
mese non ha una barra dove stare e sommare due periodi nella stessa card confonde.

- **Disponibili** = fasce da `buildAvailabilityResolver` (settimana tipo + eccezioni
  giornaliere; le settimane pubblicate SONO override, quindi ci entrano), materializzate
  giorno per giorno sull'orologio **italiano** — le fasce sono ore da orologio, non
  istanti, e il server gira a UTC. Meno ferie/malattia/teoria/blocchi
  (`AutoscuolaInstructorBlock`, criterio di **sovrapposizione**) e meno i giorni di
  chiusura (`AutoscuolaHoliday`).
- **Occupate** = tutto ciò che tiene impegnato l'istruttore e **non è annullato**:
  guide ancora da svolgere comprese (lo slot è venduto), **esami compresi** (occupano
  l'agenda anche se non contano come ore di guida) e contenitori di guide di gruppo
  (`fetchGroupLessonBusyRows`), anche vuoti. Gli intervalli si **fondono** prima di
  essere misurati: i tre posti di una guida di gruppo + il contenitore sono un'ora sola.
- ⚠️ **`occupancy.busyMinutes` NON è `weekly.totalMinutes`.** Filtri diversi *di
  proposito*: le ore del report sono le guide SVOLTE, l'occupazione è l'agenda PRESA.
  Nei giorni futuri divergono sempre. La banda in pagina lo dice a parole.
- **Fuori fascia** (`outsideMinutes`): occupato che cade fuori dalle fasce dichiarate.
  Contato a parte, **non** entra nel rapporto (né al numeratore né al denominatore).
  Da non confondere con `outsideWorkingHoursMinutes`, che è un'altra cosa (la finestra
  `workingHoursStart/End` dei settings istruttore) e in pagina non si vede.
- **Pause fra una guida e l'altra (REG-484)**: sono `AutoscuolaInstructorBlock` con
  `reason: "lesson_buffer"`, ma **NON** vanno fra le indisponibilità — ci finirebbero
  per distrazione, visto che sono blocchi. Sono ore consumate *da* una prenotazione:
  se togliessero disponibilità, le ore disponibili si accorcerebbero a ogni guida
  prenotata (un denominatore che si muove da solo, impossibile da spiegare a un
  titolare). Vanno fra le **occupate**. `splitBlocksByNature` fa la separazione ed è
  il posto da toccare se nasce un altro `reason` di questa natura.
- **Rapporto sui totali, non media dei rapporti** (`sumOccupancy`): un istruttore con
  due ore dichiarate non deve pesare come uno che ne ha quaranta.
- Tre stati distinti in UI, e vanno detti diversamente: nessuna fascia dichiarata
  (`declaredMinutes === 0`), fasce tutte coperte da blocchi (`declaredMinutes > 0`,
  `availableMinutes === 0`), ore vere da riempire.
- **Niente clamp sul futuro**, a differenza del KPI del backoffice: lì misura la
  piattaforma a posteriori, qui il titolare guarda la settimana in corso e vuole sapere
  quanto è già pieno. Le settimane future sono navigabili e sensate.
- La matematica sugli intervalli è condivisa con il KPI (`lib/backoffice/agenda-saturation.ts`):
  **stessa definizione di proposito**, così il numero del titolare e il nostro coincidono.

## Export (REG-444, ex REG-447)
Bottone "Esporta" accanto alla navigazione settimana → `reglo-ore-guida_<lunedì>.csv`.
CSV con `;` e BOM, **non** `.xlsx`: è quello che l'Excel italiano apre con un doppio
clic senza procedura di importazione, ed è già il precedente della casa (backoffice →
Esporta CSV). Zero dipendenze nuove. Le ore escono in **decimale con la virgola**
(Excel-IT le somma come numeri) con accanto il minutaggio leggibile. Blocchi: riepilogo
settimana → riga per istruttore → dettaglio per giorno → note. Tutto client-side dai
dati già in pagina: nessun endpoint nuovo.

## Connected features
- **Instructor Clusters / Settings** — `workingHoursStart/End` (the window for "fuori orario") comes from instructor settings.
- **Lezione teorica** — le ore teoriche compaiono qui come categoria separata (`theoryMinutes`).
- **Availability / Holidays / Instructor Absences / Group lessons** — alimentano le ore disponibili e occupate (REG-444). Vedi `impact-map.md` → "Instructor Hours".
- **Pausa tra le guide (REG-484)** — i blocchi `lesson_buffer` contano come ore OCCUPATE, non come indisponibilità (`splitBlocksByNature`). Vedi `features/lesson-buffer.md`.
- **Backoffice KPI** — stessa matematica e stessa definizione di saturazione: cambiarle insieme o i due numeri divergono.
- **Mobile** — `reglo-mobile` Ore di guida screen + `more/hours-period` period picker consume the range shape. **`occupancy` NON è nella shape range**: il mobile non è toccato da REG-444.
