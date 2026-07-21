# Holidays

## What it does
Company holiday management with optional bulk appointment cancellation, plus a
national-holidays preset ("Festività non prenotabili", Impostazioni →
Prenotazioni) that materializes recurring Italian holidays as holiday rows.

## Key files
- `lib/actions/autoscuole-holidays.actions.ts`
- `lib/autoscuole/national-holidays.ts` — preset (12 festività, Pasqua via Meeus), date helpers, `parseNationalHolidaySettings` (client-safe)
- `lib/autoscuole/national-holidays-sync.ts` — `syncCompanyNationalHolidays` (materializza/riallinea righe con `presetId`), `processNationalHolidaysSync` (tutte le company)
- `trigger/autoscuole-national-holidays.ts` — cron giornaliero 04:00 (rolling window anno corrente + successivo)
- `components/pages/Autoscuole/tabs/SettingsTab.tsx` — UI pane Prenotazioni (banner + `NationalHolidaysCard` con toggle per festività)

## Agenda UI (Segna festivo)
- `components/pages/Autoscuole/dialogs/HolidayModal.tsx` — modale "Segna festivo" in agenda (replica del prototipo): tab **Singolo/Multiplo**, calendario a due mesi, selezione giorno o **intervallo** (click o trascinamento), step di conferma con scelta **mantieni/cancella guide**. Aperto dal menu "+" (tutte le viste) e dal click sulla cella-giorno. POST `from`/`to` a `/api/autoscuole/holidays`.
- `AutoscuoleAgendaPage.tsx` — rendering festivo **ambra** (non più rosso): colonna crema `#fffbf3` + **badge 🌴 sticky** (resta fisso in scroll; hover → X per rimuovere) in vista settimana; banner ambra in vista giorno; `formatBlockReason`/`blockTint` per le etichette+tinta dei blocchi istruttore (Malattia arancio, Ferie teal).

## Key functions
- `getHolidays()` — list holidays in date range
- `createHoliday()` — add holiday (single date), optionally cancel all appointments on that date
- `createHolidayRange({ from, to, label?, cancelAppointments })` — segna un **intervallo** (giorno singolo = from===to): una riga per giorno (upsert idempotente, date normalizzate a mezzanotte UTC), **una** notifica per allievo sull'intero periodo. Usata dal modale.
- `deleteHoliday()` — remove holiday
- `syncCompanyNationalHolidays()` — chiamata da `updateAutoscuolaSettings` quando il payload tocca `nationalHolidaysEnabled/Disabled`; crea le date attive future mancanti e rimuove le righe preset future non più attive; MAI tocca i festivi manuali (presetId null); `skipDuplicates` se esiste già un festivo manuale sulla stessa data. Nessuna cancellazione automatica delle guide esistenti.

## Settings (CompanyService.limits)
- `nationalHolidaysEnabled` (bool, default false)
- `nationalHolidaysDisabled` (string[] di preset id spenti)

## DB models
- `AutoscuolaHoliday` — companyId, date, label (optional), presetId (null = manuale, altrimenti id preset es. "natale"), createdBy

## Bulk cancellation flow
When `cancelAppointments: true`: finds all non-cancelled appointments for the day, cancels each, calls `refundLessonCreditIfEligible()` per appointment, sends push + email per student (grouped: one notification per student regardless of appointment count).

## Connected features
- **Appointments** — bulk cancel appointments on holiday
- **Payments** — `refundLessonCreditIfEligible()` for each cancelled appointment
- **Notifications** — push + email to affected students (`holiday_declared` kind)
- **Booking Engine** — slot-matcher excludes holiday dates
- **Cache** — invalidates AGENDA + PAYMENTS
