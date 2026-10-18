# Stampa agenda (anteprima PDF della vista corrente)

Pulsante **Stampa agenda** nella toolbar dell'agenda web (titolari/segretarie): apre un'anteprima a schermo intero che ricostruisce una "fotografia" della vista corrente — **stesso intervallo di date, stessi filtri attivi, stessa modalità** (settimana/giorno) — in un foglio pensato per la carta. Il pulsante **Stampa / Salva PDF** chiama `window.print()`: il browser mostra l'anteprima PDF, da cui l'utente salva o stampa.

Nessun backend, nessuna dipendenza nuova: tutto client-side, read-only. La stampa usa il dialogo nativo del browser (Salva come PDF incluso), non una libreria di generazione PDF.

## File coinvolti (web)

| File | Ruolo |
|------|-------|
| `components/pages/Autoscuole/AgendaPrintDialog.tsx` | Componente **puro** dell'anteprima. Riceve `AgendaPrintData` già normalizzato e disegna il foglio: intestazione (Agenda + intervallo + modalità + "Generato il" + conteggio), chip filtri, griglia oraria con blocchi posizionati per orario e colorati. Include il packing a corsie dei blocchi sovrapposti (`packColumn`) e le regole `@media print` (nasconde tutto tranne `#agenda-print-root`, `@page size A4 portrait/landscape`, `print-color-adjust: exact`). Portal su `document.body`. |
| `components/pages/Autoscuole/AutoscuoleAgendaPage.tsx` | Pulsante toolbar "Stampa agenda" (`Printer`, accanto a Schermo intero) + stato `printOpen` + memo `agendaPrintData` che mappa lo stato corrente (`filtered`, `examGroups`, filtri, `viewMode`, `viewPrefs`, `dayViewInstructors`, `weekStart`/`dayFocus`) in `AgendaPrintData`. Calcolato **solo quando l'anteprima è aperta** (early-return `null`). |
| `lib/autoscuole/instructor-colors.ts` | Riusato: `instructorColorAlpha`/`instructorColorText` per i tint dei blocchi nell'anteprima. |
| `components/pages/Autoscuole/AgendaExamPrint.tsx` | REG-620: passo di scelta "Solo esami" (`ExamPrintSetup`: periodo + dettagli) e foglio A4 (`ExamPrintSheet`: tabella per giorno). |
| `lib/autoscuole/exam-print.ts` | REG-620, puro e testato: `buildExamPrintDays` raggruppa gli appuntamenti `esame` in sessioni (orario + istruttore, come l'agenda), per giorno, ordinate per orario; senza orario in cima. Elenco dettagli `EXAM_PRINT_FIELDS` + default. |
| `components/pages/Autoscuole/dialogs/RangeCalendar.tsx` | Calendario a due mesi con selezione intervallo, estratto da `HolidayModal` e condiviso con la stampa esami. `minDate` blocca il passato (festivi), senza si naviga libero (stampa). |

## Come mappa la vista

- **Colonne**: vista *settimana* → una colonna per **giorno visibile** (rispetta `viewPrefs.days`, oggi evidenziato); vista *giorno* → una colonna per **istruttore** (`dayViewInstructors`), più "Senza istruttore" se serve.
- **Blocchi**: guide/manovre/… colorati col **colore istruttore** (scelto dal titolare o palette posizionale); **guide di gruppo** teal (moto → arancio); **esami** viola. Titolo = allievo (o "Guida di gruppo · X/Y" / "Esame · N allievi"), sottotitolo = tipo · istruttore. Orario ritagliato alla fascia visibile (`viewPrefs.startHour`/`endHour`).
- **Filtri**: gli stessi della vista (istruttore/veicolo/tipo/stato + ricerca) sono applicati e riassunti nei chip in testata. Gli esami rispettano i filtri istruttore/tipo.
- **Orientamento**: settimana → landscape; giorno → portrait (o landscape con >4 istruttori). La scala verticale (`pxPerMin`) si adatta per far stare la fascia in una pagina, poi impagina.

## Note

- Web-only, titolari/segretarie (gli istruttori usano il mobile).
- L'anteprima è una **ricostruzione fedele dei dati**, non uno screenshot della griglia interattiva (che, essendo a scroll orizzontale con sotto-colonne istruttore, non si stamperebbe bene). Contiene gli stessi eventi che l'utente vede.
- `AgendaPrintDialog` segue il pattern degli altri dialog del progetto (`typeof document === "undefined"` + portal): si apre solo su click (client-side), quindi nessun mismatch SSR.

## Solo esami (REG-620)

Selettore **Agenda | Solo esami** nella barra dell'anteprima. "Solo esami" apre un passo di scelta:

1. **Periodo** con `RangeCalendar` (lo stesso dei festivi), indipendente dalla vista; proposto = i giorni visibili. Si possono scegliere anche giorni passati.
2. **Dettagli da stampare** (caselle): orario, istruttore, istruttori collegati, allievi, patente, note, esito. Default = quello che mostra il blocco esame in agenda (orario, istruttore, collegati, allievi, patente). Patente ed esito richiedono "Allievi".

"Mostra anteprima" carica gli esami del periodo con il bootstrap agenda (`type=esame`, `limit=600`; con una `AgendaSource` usa la sua `fetchBootstrap`) e mostra un foglio A4 verticale: una sezione per giorno, una riga per esame ordinata per orario, gli esami senza orario in cima come "Orario da definire". Le righe non si spezzano tra due pagine (`break-inside: avoid`). Solo esami di **pratica**: gli esami di teoria in agenda non esistono (c'è solo la data `AutoscuolaCase.theoryExamAt`, praticamente mai compilata), scelta di Tiziano 19/10/2026. Nessun backend nuovo.

Test: `tests/unit/autoscuole/exam-print.test.ts`, `tests/e2e/reg620-exam-print.auth.spec.ts` (integrazione + anteprime con dati di prova serviti via `page.route`).
