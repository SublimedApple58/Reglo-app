# Blocchi delle guide annullate (REG-623)

Opzione in **Impostazioni → Aspetto** («Mostra le guide annullate non ancora
sostituite», **spenta di default**). Accesa, quando una guida viene annullata
dall'allievo o dalla segreteria, in agenda web resta un blocco rigato e
tratteggiato al suo posto finché l'orario non viene occupato da un'altra guida.
Solo web; il mobile non lo mostra.

## Regola: cos'è un "sostituto"

Non esiste un collegamento salvato tra guida annullata e sostituta
(`replacedByAppointmentId` non lo scrive nessuno: è un avanzo del
riposizionamento ritirato). Il sostituto è **una qualunque riga attiva dello
stesso istruttore che si sovrappone all'orario**: guida, esame, guida di gruppo,
anche come istruttore aggiuntivo (REG-585). Non contano le righe annullate né
quelle rimosse dallo storico (`record_cleanup`), che in agenda non si vedono.

Il blocco è **derivato**, mai salvato: `findCancelledLessonBlocks` lo ricalcola
dalle righe dell'agenda a ogni render. Per questo sparisce da solo, qualunque sia
la strada da cui arriva la guida nuova: offerta del posto (`slot_fill`),
prenotazione dall'app, creazione dalla segreteria, «Assegna sostituto». Se
torna libero (il sostituto viene annullato), il blocco ricompare.

Diventano blocco solo:
- `cancellationKind = "manual_cancel"` (allievo dall'app, «Annulla guida» della
  segreteria, cambio di stato in «annullata»);
- `operational_cancel` con `cancellationReason = "school_fault"` («Annulla
  guida» con colpa della scuola).

Restano fuori: cancellazioni d'ufficio (malattia, ferie, istruttore o veicolo
disattivato, «Elimina», account cancellato), `permanent_cancel` (festivi,
elimina), `record_cleanup`, esami, posti nelle guide di gruppo, righe senza
istruttore. Più annullate sovrapposte sullo stesso istruttore fanno **un solo
blocco** (si mostra la più recente, la X le toglie tutte).

Visibili anche nei **giorni passati** (decisione di Tiziano: spiegano il buco).

## Interazione

- **Hover** → X nell'angolo = «Togli dall'agenda».
- **Click** → riquadro (Radix Popover) con allievo, giorno e orario,
  istruttore, veicolo, tipo; annullamento: quando, da chi (allievo / segreteria
  / istruttore + nome), preavviso (badge «meno di 24 ore»), penale
  (addebitata / condonata / da decidere), credito restituito, offerta del posto
  agli allievi. CTA **«Assegna sostituto»**, secondaria «Togli dall'agenda».
- **«Assegna sostituto»** apre il form di creazione guida (titolo «Assegna
  sostituto») già compilato con giorno, orario, durata, tipo, istruttore e
  veicolo della guida annullata. Scegliendo l'allievo, istruttore e veicolo
  **restano** quelli della guida annullata (normalmente il cambio allievo li
  ricalcola); il veicolo resta solo se va bene per la patente dell'allievo.
  Mentre il form è aperto il blocco lascia il posto al ghost della nuova guida.
  Salvando, lo slot è occupato e il blocco sparisce. Se si cambia istruttore
  nel form, il blocco resta (quell'orario dell'istruttore è ancora libero).

## Nota dell'ufficio (REG-624)

Nel riquadro, sopra «Assegna sostituto», il campo **Nota** («Es. proposta a
Rossi e Bianchi»), etichettato «Solo ufficio». Si salva con «Salva nota»,
Cmd/Ctrl+Invio o chiudendo il riquadro. Il testo compare anche sul blocco
rigato (riga in fondo; nei blocchi bassi solo un'icona).

- La vede e scrive **solo l'ufficio sul web** (titolare, `INSTRUCTOR_OWNER`,
  admin). L'agenda web chiede `officeNotes=1` alla rotta bootstrap; la rotta
  (`withOfficeNotes`) toglie `agendaNote` a tutti gli altri, app compresa, e
  mette `meta.officeNotes` per dire al client se mostrarla. La cache Redis
  resta una per autoscuola: il filtro sta dopo.
- Si scrive su **tutte** le guide del blocco (annullate sovrapposte), così
  resta anche se a mostrarsi è un'altra.
- Niente pulizia: quando lo slot si riempie il blocco sparisce e la nota con
  lui (vive sulla guida annullata). Se il sostituto viene annullato, blocco e
  nota ricompaiono.

## Dati

- Setting: `cancelledLessonBlocks` (boolean) nel JSON `CompanyService.limits`,
  default `false`. Scritto da `updateAutoscuolaSettings` e
  `updateAgendaColorSettings`.
- `AutoscuolaAppointment.agendaDismissedAt` + `agendaDismissedByUserId`
  (migrazione additiva `20261019120000_appointment_agenda_dismissed`): la X.
  **Solo visivo**: la guida resta annullata, nello storico e nei conteggi; vale
  per tutta la segreteria.
- `AutoscuolaAppointment.agendaNote` (migrazione additiva
  `20261020120000_appointment_agenda_note`): la nota dell'ufficio (REG-624),
  max 500 caratteri, scritta da `updateCancelledLessonAgendaNote`.
- Bootstrap agenda (`getAutoscuolaAgendaBootstrapAction`) espone in più
  `cancelledAt`, `cancelledByUserId`, `lateCancellationAction`,
  `creditRefundedAt`, `agendaDismissedAt` e, sulle annullate, `cancelledBy
  {name, role}` (ruolo da `CompanyMember.autoscuolaRole`) e `slotFillOffer
  {sentAt, expiresAt, declined}` (`buildAgendaCancellationInfo`, due query).
- `updateAutoscuolaAppointmentStatus` → «annullata» ora registra anche
  `cancelledByUserId` (era l'unico percorso che non lo faceva).

## File

| File | Ruolo |
|------|-------|
| `lib/autoscuole/cancelled-lesson-blocks.ts` | Regola candidato/sostituito, raggruppamento, etichette (preavviso, chi, penale) — client-safe |
| `components/pages/Autoscuole/CancelledLessonBlock.tsx` | Blocco rigato + X all'hover + riquadro al click |
| `components/pages/Autoscuole/AutoscuoleAgendaPage.tsx` | `cancelledBlocks` memo, `renderCancelledBlocks` (settimana e giorno, anche vista Veicoli), `assignSubstitute`, `substituteForId`, `dismissCancelledBlock` |
| `components/pages/Autoscuole/AspettoSettingsPane.tsx` | Riga del setting con anteprima del blocco |
| `lib/actions/autoscuole.actions.ts` | `dismissCancelledAppointmentsFromAgenda`, `updateCancelledLessonAgendaNote`, `buildAgendaCancellationInfo`, campi bootstrap |
| `app/api/autoscuole/agenda/bootstrap/route.ts` | `officeNotes=1` + ruolo → nota sì/no (`withOfficeNotes`) |
| `lib/actions/autoscuole-settings.actions.ts` | `cancelledLessonBlocks` |
| `tests/unit/autoscuole/cancelled-lesson-blocks.test.ts` | Regola |
| `tests/e2e/reg623-cancelled-blocks.auth.spec.ts` | Flusso completo su dati dev + anteprime |

## Limiti noti

- Il bootstrap agenda prende al massimo 500 righe per intervallo, annullate
  comprese (lo faceva già prima).
- Il sostituto è "per istruttore": un'altra guida sullo stesso **veicolo** ma
  con un altro istruttore non lo spegne.
