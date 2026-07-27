# Lezione teorica (agenda)

## What it does
Nuovo tipo di evento in agenda: un blocco legato a un istruttore che occupa una
fascia oraria e la rende **indisponibile in modo duro**. In quella fascia gli
allievi non vedono slot prenotabili e non è possibile inserire guide, esami o
guide di gruppo sovrapposte per quell'istruttore. Si crea **solo da web app**
(titolare/segreteria) da due punti: il menu **＋** in alto a destra e il popover
di **prenotazione veloce** (clic sulla colonna dell'istruttore). Ha durata
(`DurationField`) e ricorrenza settimanale, niente allievi/argomento/note.

## Data model
Riusa `AutoscuolaInstructorBlock` (stessa tabella di Malattia/Ferie/blocco
generico) con `reason = "theory_lesson"`. La ricorrenza usa `recurrenceGroupId`
come per gli altri blocchi. Essendo un instructor block, passa
**automaticamente** da tutti i controlli di disponibilità/conflitto già esistenti
(nessuna query li filtra per reason, tranne le liste malattia/ferie).

**Migrazione `20260721130000_add_instructor_block_description`**: colonna
opzionale `description String?` sul blocco — descrizione libera (max 500) valida
per teorica **e** blocco generico. Separata da `reason` (che per la teorica è il
sentinel di tipo).

## Modifica (edit)
`updateInstructorBlock({ blockId, startsAt?, endsAt?, reason?, description? })`
(`autoscuole.actions.ts`) modifica un **singolo** blocco: orario e/o descrizione
(per il generico anche il titolo/`reason`; per la teorica il reason resta il
sentinel). Non tocca la ricorrenza (edita solo quell'occorrenza). Rifà gli stessi
controlli di conflitto della creazione, escludendo il blocco stesso. Auth: come
delete (istruttore solo i propri, titolare tutti). Esposto anche via
`PATCH /api/autoscuole/instructor-blocks/[id]` per il mobile.

## Key files
- `lib/actions/autoscuole.actions.ts`
  - `createInstructorBlock` — **riusato invariato**: accetta già `instructorId`,
    `startsAt/endsAt`, `reason`, `recurring`, `recurringWeeks`. Dal web si passa
    `reason: "theory_lesson"`.
  - Messaggi di conflitto: i sentinel-tipo (`theory_lesson`/`sick_leave`/`ferie`)
    sono tradotti in etichette leggibili (blocco vs blocco, e `verifyInstructorAvailability`).
- `components/pages/Autoscuole/AutoscuoleAgendaPage.tsx`
  - `formatBlockReason` → "Lezione teorica"; `blockTint` → indaco a righe.
  - Stato `blockKind: "generic" | "theory"` che parametrizza lo **stesso**
    dialog "blocco istruttore" (titolo/sottotitolo, nasconde il campo Titolo,
    forza `reason:"theory_lesson"`, avviso "bloccante", label bottone/toast).
  - Voce **Lezione teorica** nel menu ＋ (`plusMenuOpen`) e nel popover veloce
    (`slotMenu.options`), entrambe con `setBlockKind`.
  - Ghost/anteprima live in tinta indaco quando `blockKind === "theory"`.
  - **Modifica**: `blockEditId` mette il dialog blocco in modalità edit
    (`openBlockEdit(b)` pre-riempie da un blocco); i due popover di dettaglio
    blocco (vista giorno + settimana) hanno **"Modifica"** accanto a "Elimina" e
    mostrano la descrizione. In edit la ricorrenza è nascosta (blocco singolo).
  - Campo **Descrizione (opzionale)** (`Textarea`) nel dialog, per teorica e
    generico.

## Colour palette (shared web ↔ mobile)
Indaco: sfondo `#E6E9FF`, testo `#3730a3`, accento `#4F46E5`. Su **web** con
righe diagonali (hatch CSS, `repeating-linear-gradient`); su **mobile** tinta
piena (RN non ha il pattern a righe). Distinta dalle tinte già in uso: esame
`#F5F0FF`, gruppo auto `#ECFDF5`, gruppo moto `#FFEDD5`, blocco generico grigio.

## Connected features
- **Availability** — `getAllAvailableSlots`/`getDateAvailabilityMap` carvano già
  via `AutoscuolaInstructorBlock`: la fascia teorica sparisce dagli slot allievo.
- **Appointments / Booking** — `verifyInstructorAvailability` e i check di overlap
  in create/reschedule rifiutano guide/esami/gruppi sovrapposti alla teorica.
- **Instructor Absences** — stesso modello e stesso rendering (`blockTint`/
  `formatBlockReason`); la teorica NON è un'assenza (nessuna cancellazione guide).
- **Instructor Hours (Ore di guida)** — le ore teoriche compaiono nel report come
  categoria **separata** (`theoryMinutes`), non conteggiate come guida. Vedi
  `features/instructor-hours.md`.
- **Mobile** — visualizza e **crea** la teorica (istruttore per sé); vedi
  `reglo-mobile/docs/features/lezione-teorica.md`.
