# Pagellino di valutazione (REG-443)

Ogni autoscuola decide **su cosa** i suoi istruttori valutano una guida. Le voci si
configurano in Impostazioni → **Pagellino**; l'istruttore le compila a **stelline** dal
foglio "Dettagli guida" dell'app.

Convive con `AutoscuolaAppointment.rating`, che resta la valutazione **complessiva**
a stelle della guida: il pagellino non la sostituisce.

## Modello dati

| Modello | Ruolo |
|---|---|
| `AutoscuolaEvaluationItem` | voce del pagellino di UNA autoscuola: `label`, `scaleMax` (3 o 5), `position` (ordine nell'app), `archivedAt` |
| `AutoscuolaAppointmentEvaluation` | punteggio di UNA voce su UNA guida, unique `(appointmentId, itemId)` |

`CompanyService.limits.evaluationSheetEnabled` (servizio AUTOSCUOLE) è l'interruttore
"Pagellino attivo". Sta dietro la cache Redis SETTINGS → `saveEvaluationSheet` la invalida.

**Le voci non si cancellano, si archiviano**: un punteggio dato mesi fa resta leggibile
con la sua etichetta anche se l'autoscuola ha cambiato pagellino. Una voce archiviata
ricompare nel foglio SOLO sulle guide che hanno un suo punteggio, marcata "(non più in uso)".

## File

| Cosa | Dove |
|---|---|
| Regole pure (scale, punteggio di partenza, clamp) | `lib/autoscuole/evaluation-sheet.ts` |
| Actions (lettura/salvataggio voci + interruttore, pagellino di una guida) | `lib/actions/autoscuole-evaluation.actions.ts` |
| Pane Impostazioni → Pagellino | `components/pages/Autoscuole/EvaluationSheetPane.tsx` (registrato in `AutoscuoleResourcesPage.tsx`) |
| API per l'app istruttore | `app/api/autoscuole/appointments/[id]/evaluation/route.ts` (GET) |
| Salvataggio punteggi | `updateAutoscuolaAppointmentDetails` in `lib/actions/autoscuole.actions.ts` (campo `evaluations`) + `app/api/autoscuole/appointments/[id]/route.ts` (PATCH) |
| Test | `tests/unit/autoscuole/evaluation-sheet.test.ts` |

## Regole

- **Scale ammesse: 3 o 5 stelline.** La scala 10 è stata provata e scartata: le stelline
  diventano troppo piccole per il pollice.
- **Punteggio di partenza = metà scala arrotondata per eccesso** (3 su 5, 2 su 3):
  l'istruttore tocca solo ciò che vuole correggere.
- Il foglio manda **sempre tutte le voci**: il salvataggio è una sostituzione integrale
  dei punteggi di quella guida, così una voce tolta dal pagellino sparisce anche da lì.
- I punteggi viaggiano nella **stessa PATCH** dei dettagli guida: un solo "Salva".
- Il pagellino da solo è una modifica salvabile (si può toccare solo le stelline).
- Voci di un'altra autoscuola o sparite nel frattempo vengono **ignorate**, non fanno
  fallire il salvataggio dell'istruttore.
- Vale il vincolo già esistente sulla valutazione: si valuta solo una guida **già
  effettuata** (`checked_in`/`completed`/`no_show`).
- Max 12 voci per autoscuola: oltre, il foglio non si compila più "in pochi secondi".

## Consultazione nello storico guide

I punteggi si consultano dallo **storico guide lato scuola**, senza aprire nulla di nuovo:

- **Web** — scheda allievo → tab **Note** ("valutazioni e note"): sotto la riga della guida una
  chip `★ Pagellino 4,2/5` espande l'elenco completo delle voci in sola lettura
  (`EvaluationRecap` in `AutoscuoleStudentsPage.tsx`). La media si calcola **solo** se tutte le
  voci hanno la stessa scala; con scale miste la chip mostra il numero di voci
  (`evaluationSummary`).
- **Mobile** — storico guide dell'allievo: la riga porta la stessa chip; toccando la guida si apre
  il foglio "Dettagli guida" con tutte le voci (in sola lettura se non più modificabile).

I punteggi viaggiano nei payload dello storico (`getAutoscuolaStudentDrivingRegister` per il web,
il ramo NON-`light` di `getAutoscuolaAppointmentsFiltered` per l'app istruttore): niente chiamata
per riga. Il ramo `light`, che serve l'app ALLIEVO, resta senza pagellino.

Le guide precedenti alla feature non hanno punteggi → nessuna chip, storico invariato.

## Stile delle stelline

**Gialle (`#facc15`), uguali su web e mobile.** Il web resta com'era; su mobile è stata aperta una
deroga esplicita al design system mono-navy (`StarRating` prop `tone="gold"`) per tenere le due
piattaforme identiche. La deroga vale SOLO per il pagellino: la valutazione complessiva su mobile
resta navy.

## Fuori scope (v1)

L'allievo **non** vede il pagellino nella sua app: resta interno all'autoscuola.
