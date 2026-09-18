# Pausa tra una guida e l'altra (REG-484)

## Cosa fa

L'autoscuola può imporre un tempo di stacco fra due guide consecutive dello
stesso istruttore (cambio allievo, bagno, rientro in sede). Quando una guida
viene prenotata, il sistema crea **subito dopo di essa un blocco-slot
sull'istruttore**, lungo quanto il buffer impostato. La guida successiva di
quell'istruttore si potrà prendere solo passata la pausa.

Setting **per autoscuola** — non per istruttore, non per allievo. Nasce
**spento**: sulle autoscuole esistenti non cambia niente finché il titolare non
lo accende.

## Come funziona

La pausa è un normale `AutoscuolaInstructorBlock` con `reason = "lesson_buffer"`.
Questa è la scelta che tiene il lavoro piccolo: tutti i controlli di
disponibilità e di conflitto che già esistono (lista slot dell'allievo, mappa
giorni, slot-matcher, waitlist, guard di creazione, bande prenotabili della
timeline mobile) leggono già i blocchi istruttore, quindi **non è stato
necessario toccarne nessuno**.

Il blocco viene creato dopo che la guida è stata scritta a DB, da
`createLessonBufferBlock`:

- **no-op** se il setting è spento, se la guida non ha istruttore, o se dopo la
  guida non resta spazio;
- **troncato** all'impegno successivo dell'istruttore (un'altra guida o un altro
  blocco) se lo spazio è parziale — così la pausa non finisce mai sopra una
  guida vera;
- **tollerante agli errori**: se la creazione fallisce non fa fallire la
  prenotazione, che a quel punto è già andata a buon fine.

## Avviso "Non avrai tempo per una pausa"

Se lo staff prenota una guida che riempie esattamente (o quasi) il buco fra due
impegni, la pausa non ci starebbe. In quel caso `createAutoscuolaAppointment`
non crea niente e risponde `code: "LESSON_BUFFER_CONFIRM"` con il messaggio
«Non avrai tempo per una pausa. Vuoi procedere comunque?». Il client mostra una
domanda secca sì/no e, se l'utente conferma, ripassa con `confirmNoBuffer: true`
e la guida viene creata senza pausa.

L'avviso è **solo per lo staff**: `isStudentActor` lo salta, l'allievo non
decide l'agenda dell'istruttore.

## Setting

In `CompanyService.limits` (JSON, nessuna migrazione):

| Chiave | Tipo | Default |
|--------|------|---------|
| `lessonBufferEnabled` | boolean | `false` |
| `lessonBufferMinutes` | int 5..60, passo 5 | `15` |

UI: **Impostazioni → Prenotazioni → Limiti**, riga «Pausa tra una guida e
l'altra» (toggle + campo minuti). Auto-save come gli altri limiti; il salvataggio
invalida già i segmenti di cache AGENDA + SETTINGS.

## Dove nasce la pausa

| Flusso | File |
|--------|------|
| Prenotazione staff / istruttore (web agenda, app istruttore) | `lib/actions/autoscuole.actions.ts` → `createAutoscuolaAppointment` |
| Prenotazione multipla (batch) | `lib/actions/autoscuole.actions.ts` → `createAutoscuolaAppointmentBatch` |
| Prenotazione dell'allievo da app | `lib/actions/autoscuole-availability.actions.ts` → `createBookingRequest` |
| Slot liberato (waitlist) | `lib/actions/autoscuole-availability.actions.ts` → `respondWaitlistOffer` |

Esami e guide di gruppo hanno flussi propri e **non** creano pausa: non c'è
codice dedicato a escluderli, semplicemente non chiamano l'helper.

## Key files

- `lib/autoscuole/lesson-buffer.ts` — costanti, normalizzazione del setting,
  `resolveLessonBufferWindow` (finestra effettiva, troncata),
  `lacksRoomForLessonBuffer` (condizione dell'avviso), `createLessonBufferBlock`
- `lib/actions/autoscuole-settings.actions.ts` — lettura/scrittura del setting
- `components/pages/Autoscuole/tabs/BookingsTab.tsx` — riga nel sotto-tab Limiti
  (+ `NumberField` ora accetta `step`)
- `components/pages/Autoscuole/AutoscuoleAgendaPage.tsx` — `formatBlockReason`
  («Pausa»), `blockTint` (grigio tenue a righine), conferma
  `LESSON_BUFFER_CONFIRM` in `handleCreate`
- `app/api/autoscuole/instructor-bookings/confirm/route.ts` — inoltra
  `confirmNoBuffer` (l'app istruttore passa da qui)
- `tests/unit/autoscuole/lesson-buffer.test.ts`

Mobile: `reglo-mobile/src/utils/weeklyAgenda.ts` (blocco di tipo `buffer`,
etichetta «Pausa»), `src/components/booking/BookingForm.tsx` (alert di conferma),
`src/types/regloApi.ts`.

## Da sapere

- **La pausa è un blocco vero e resta un blocco vero.** Se la guida che l'ha
  generata viene annullata, spostata o rimossa, il blocco **non** la segue: resta
  lì e va tolto a mano dall'agenda (è cancellabile come qualsiasi altro blocco,
  da web e da app). Non c'è, per ora, nessun aggancio guida→pausa.
- La pausa occupa l'istruttore, **non** l'allievo e **non** il veicolo: un
  allievo che ha appena finito può prenotare subito con un altro istruttore
  libero.
- Cambiare il valore (o spegnere il setting) vale **solo per le guide prenotate
  da lì in avanti**: le pause già create restano dove sono.

## Connected features

- **Appointments** — la pausa nasce insieme alla guida
- **Booking Engine / Availability** — la vedono "gratis", come qualsiasi blocco
  istruttore
- **Instructor Absences** — stesso modello `AutoscuolaInstructorBlock`, `reason`
  diverso
