# REG-499 — Lista allievi sbagliata + blocco prenotazioni che ferma l'istruttore

**Stato:** implementato 19/09/2026. Bug urgente segnalato da Tiziano.

## Cosa è stato fatto

Due bug distinti, stesso flusso (istruttore che prenota una guida da app).

1. **Picker allievo** (`reglo-mobile`): mostrava tutti gli allievi dell'autoscuola,
   patentati e in teoria compresi. Ora solo la fase **PRATICA**.
2. **Blocco prenotazioni** (`reglo`): fermava anche l'istruttore che prenota PER
   l'allievo. Ora ferma solo l'auto-prenotazione dell'allievo.

## Causa

### 1. Picker allievo

`IstruttoreHomeScreen.bookingStudentOptions` mappava `students` (tutte le
membership STUDENT della company, da `listDirectoryStudents`) senza guardare
`studentPhase` — che era **già** nel payload del bootstrap agenda
(`AutoscuolaStudent.studentPhase`) e semplicemente non veniva letto. Nessuna
chiamata in più da fare: solo un filtro mancante.

### 2. Blocco prenotazioni

Due punti di enforcement in `lib/actions/autoscuole.actions.ts` trattavano
l'istruttore come l'allievo:

| Punto | Commit d'origine |
|---|---|
| `createAutoscuolaAppointment` → `if (isStudentActor \|\| isInstructorActor)` | `6ad9b50`, aprile 2026 (instructor clusters) |
| `createAutoscuolaAppointmentBatch` → `if (studentBlocked && isInstructorActor)` | `509805e`, giugno 2026 (follow-car) |

**Non è una regressione di REG-442**: il bug ha 5 mesi. REG-442 (blocco in bulk,
rilasciato il 19/09) lo ha solo reso facilissimo da incontrare — prima bloccare
un allievo era un gesto raro, uno alla volta dal suo dettaglio.

Dettaglio rivelatore: all'istruttore usciva il messaggio scritto per l'allievo,
"Le **tue** prenotazioni sono temporaneamente sospese". Il titolare invece non è
mai stato bloccato (c'era già il ramo "Owner/Admin: soft warning").

Nel path batch il controllo era pura zavorra: ci arrivano **solo** staff
(guard `if (!isInstructorActor && !isOwnerOrAdminActor) return`), quindi dopo il
fix non resta niente da controllare — rimosso, query in meno.

## Modifiche

### `reglo`

| File | Modifica |
|---|---|
| `lib/autoscuole/booking-block.ts` | Nuovo `bookingBlockStops(initiator)` + tipo `BookingInitiator` (`student` \| `instructor` \| `staff`). La regola di prodotto sta scritta una volta sola, accanto a `isBookingBlockActive`. |
| `lib/actions/autoscuole.actions.ts` | `createAutoscuolaAppointment`: rifiuta solo se `bookingBlockStops(initiator)`; per chi passa, il blocco diventa il warning "l'allievo ha le prenotazioni bloccate" (prima lo vedeva solo owner/admin). `createAutoscuolaAppointmentBatch`: controllo rimosso. |
| `tests/unit/autoscuole/booking-block.test.ts` | +5 test: i tre attori, e una guardia sul sorgente delle due action (il batch non deve più nemmeno chiamare `getStudentBookingBlockStatus`; la singola deve passare dal predicato e non rileggere il ruolo a mano). |
| `docs/features/bulk-booking-block.md`, `auto-booking-block-debt.md`, `impact-map.md` | Sezione "A chi si applica il blocco" + rimandi. |

### `reglo-mobile`

| File | Modifica |
|---|---|
| `src/screens/IstruttoreHomeScreen.tsx` | `bookableStudents` = fase PRATICA; `bookingStudentOptions` costruito da lì (anche nel ramo cluster attivi). `studentPhase` aggiunto al tipo dello stato. |
| `docs/features/quick-book.md`, `docs/impact-map.md` | Sezione "Chi compare nel picker allievo" + nota sul blocco. |

## Scelte

- **Filtro fase lato app, non lato server.** Il backend continua a NON imporre la
  fase allo staff: dall'agenda web il titolare prenota ancora per chiunque, e
  irrigidire quella strada avrebbe rotto un flusso che nessuno ha segnalato. Il
  bug riguardava una lista, ed è stata corretta la lista.
- **`studentPhase` assente ⇒ PRATICA.** È il default dello schema
  (`@default(PRATICA)`): un'autoscuola che le fasi non le usa deve continuare a
  vedere tutti i suoi allievi, non una lista vuota.
- **Lasciati fermi i path self-service**: accettare uno scambio
  (`autoscuole-swap.actions.ts`), iscriversi a una guida di gruppo
  (`respondGroupLessonInvite`), la ricerca disponibilità da app
  (`ensureStudentCanBookFromApp`). Lì il blocco è giusto: è l'allievo che agisce.
- **Warning non mostrato sull'app.** Il backend torna `warnings` anche
  all'istruttore, ma il `BookingForm` mobile non li legge (li legge l'agenda web).
  Farglieli vedere è un miglioramento vero ma è UI nuova, fuori da un bugfix
  urgente. Annotato come possibile seguito.

## Verifica

- 424 test unitari + `tsc --noEmit` verdi sui due repo (il mobile ha un errore
  preesistente in `TabNavigator.tsx`, non toccato).
- Staging: istruttore che prenota per un allievo bloccato → passa; allievo che
  prova da sé → fermato.
- Mobile: nessuno staging (regola nota) → verifica sul bootstrap reale che le fasi
  arrivino e che il filtro selezioni gli allievi giusti, poi OTA in produzione.
