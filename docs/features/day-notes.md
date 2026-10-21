# Nota del giorno (REG-632) e mese nelle intestazioni (REG-631)

## Cosa fa
- **REG-631**: ogni colonna della vista settimana dell'agenda web (anche 7 giorni
  e colonne per istruttore o veicolo) mostra il mese abbreviato accanto al
  numero: «lun 16 nov». La vista giorno lo aveva già nella barra in alto.
- **REG-632**: una **nota del giorno** per tutta l'autoscuola («Genova quiz»),
  come sulle agende di carta. È un'etichetta per l'ufficio: **non blocca** le
  prenotazioni (a differenza dei festivi) ed esce anche nella **stampa**.

## Chi la vede
Solo l'ufficio sul web (titolare, segreteria, admin). Viaggia nel bootstrap
agenda, rotta **condivisa con il mobile** e con cache per autoscuola:
`withOfficeNotes` (in `lib/autoscuole/cancelled-lesson-blocks.ts`) la toglie
dopo la cache se manca `officeNotes=1` o il ruolo non è dell'ufficio. È lo
stesso filtro della nota del blocco annullato (REG-624).

## UI (web)
- **Settimana**: etichetta color carta (`DayNoteChip`, sfondo `#f3f1ec`, icona
  NotebookPen) sotto la data; il festivo resta ambra e maiuscolo. L'intestazione
  si alza da 52 a 70 px solo nelle settimane con una nota o un festivo con nome:
  in quel caso il nome del festivo sta nella stessa riga (prima era in alto a
  destra e si sovrapponeva al giorno).
- **Giorno**: l'etichetta sta nella barra in alto accanto alla data.
- **Come si aggiunge**: tasto destro sull'intestazione della data → menu
  «Nota del giorno» / «Segna festivo» (prima il tasto destro apriva subito il
  festivo); oppure menu «+» → «Nota del giorno»; un clic sull'etichetta la
  modifica o la toglie.
- **Dialog**: `dialogs/DayNoteDialog.tsx`, stessa cornice di `HolidayModal`,
  max 60 caratteri, testo vuoto o «Togli nota» = cancella.
- **Stampa**: `AgendaPrintColumn.note` (settimana) e `AgendaPrintData.dayNote`
  (giorno), resi da `PrintDayNote` con bordo (si legge anche senza colori di fondo).

## Dati
- Modello `AutoscuolaDayNote` (`companyId`, `date @db.Date`, `text`,
  `createdBy`, `updatedBy`), unica per `companyId + date`. Migrazione
  `20261022120000_autoscuola_day_note` (additiva).
- `lib/autoscuole/day-notes.ts`: `DAY_NOTE_MAX_LENGTH`, `dayNoteDate` /
  `dayNoteKey` (data sempre a mezzanotte UTC, chiave `YYYY-MM-DD`).

## File
- `lib/actions/autoscuole-day-notes.actions.ts` — `saveAutoscuolaDayNote` (upsert o delete, solo ufficio, invalida cache AGENDA)
- `app/api/autoscuole/day-notes/route.ts` — `PUT { date, text }`
- `lib/actions/autoscuole.actions.ts` — bootstrap: `dayNotes` nel range
- `app/api/autoscuole/agenda/bootstrap/route.ts` — filtro `withOfficeNotes`
- `components/pages/Autoscuole/AutoscuoleAgendaPage.tsx` — intestazioni, `DayNoteChip`, menu tasto destro, menu «+», dati di stampa
- `components/pages/Autoscuole/dialogs/DayNoteDialog.tsx`
- `components/pages/Autoscuole/AgendaPrintDialog.tsx`
- Test: `tests/e2e/reg631-632-agenda-intestazioni.auth.spec.ts`, `tests/unit/autoscuole/cancelled-lesson-blocks.test.ts`

## Note
- ⚠️ `deleteHoliday` azzera l'ora col fuso del **server**: su un dev server in
  ora di Roma una data `YYYY-MM-DD` finisce sul giorno prima e la cancellazione
  fallisce. Su Vercel (UTC) funziona. Non toccato da REG-632.
