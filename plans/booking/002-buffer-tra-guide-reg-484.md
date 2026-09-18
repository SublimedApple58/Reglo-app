# REG-484 — Buffer configurabile tra una guida e l'altra

> **Stato: su STAGING, verificato.** Web: branch
> `tizianodifelice1/reg-484-buffer-configurabile-tra-una-guida-e-laltra`,
> shippato su `staging` il 18/09 (sha `703d3e0`, deploy Vercel READY, nessuna
> migrazione). Mobile: branch `tizianodifelice1/reg-484-buffer-tra-guide`, non
> pushato (su quel repo `staging` non esiste). **Prod: non ancora**, serve l'ok.
> Linear: https://linear.app/reglo/issue/REG-484

## Cosa è stato fatto

Setting per autoscuola (**Impostazioni → Prenotazioni → Limiti**, toggle + minuti,
default 15', **spento** su tutte le autoscuole esistenti). Quando una guida viene
prenotata, il sistema crea subito dopo di essa un **blocco-slot sull'istruttore**
lungo quanto il buffer: la guida successiva di quell'istruttore si potrà prendere
solo passata la pausa.

Unica eccezione prevista: se lo staff prenota una guida che riempie esattamente
il buco fra due impegni, compare una domanda secca «Non avrai tempo per una
pausa. Vuoi procedere comunque?». Se conferma, la guida si crea senza pausa.

Nessuna migrazione DB. Documentazione: `docs/features/lesson-buffer.md` (web),
`reglo-mobile/docs/features/lesson-buffer.md` (mobile).

## Come ci siamo arrivati (storia delle decisioni)

Il primo piano proponeva un buffer **derivato**: nessuna riga a DB, gli intervalli
occupati gonfiati di ±buffer nei 5 punti in cui si decide la prenotabilità, più
strisce "Pausa" sintetiche in agenda, conflitto morbido per lo staff, packing da
adeguare, gestione esplicita di esami e guide di gruppo.

**Tiziano ha tagliato drasticamente lo scope (18/9)**, in tre passaggi:

1. *Il buffer agisce sull'ISTRUTTORE, non sull'allievo.* Un allievo che ha appena
   finito può prenotare subito con un altro istruttore libero. (Correggeva il
   punto 1 del piano originale, dove avevo proposto di gonfiare anche
   l'intervallo dell'allievo.)
2. *Via tutto il resto:* niente conflitto morbido generalizzato, niente
   trattamento speciale per esami/guide di gruppo, niente buffer virtuale. **Si
   crea un blocco-slot vero**, punto.
3. *Unica eccezione ammessa:* l'avviso «Non avrai tempo per una pausa» quando la
   guida riempie esattamente il buco — un sì/no banale, non una feature.

La versione finale è quindi l'opposto della proposta iniziale su un punto
(blocco materializzato invece che derivato) e molto più piccola su tutto il
resto. Il vantaggio concreto del materializzato: **nessun motore è stato
toccato**. La pausa è un `AutoscuolaInstructorBlock` come malattia, ferie e
lezione teorica, quindi lista slot dell'allievo, mappa giorni, slot-matcher,
waitlist, guard di creazione e bande prenotabili della timeline mobile la
rispettano già senza una riga di codice in più.

Il costo, noto e accettato: **il blocco non segue la guida**. Vedi "Limite noto".

## Cosa è stato scritto

### Backend
- `lib/autoscuole/lesson-buffer.ts` (nuovo): costanti + normalizzazione del
  setting, `resolveLessonBufferWindow` (finestra effettiva, troncata sul primo
  impegno successivo), `lacksRoomForLessonBuffer` (condizione dell'avviso),
  `createLessonBufferBlock` (crea, o non crea, la pausa).
- `lib/actions/autoscuole-settings.actions.ts`: `lessonBufferEnabled` +
  `lessonBufferMinutes` in `CompanyService.limits` (zod, tipo, lettura,
  scrittura). La cache AGENDA + SETTINGS era già invalidata al salvataggio.
- La pausa nasce in 4 flussi: `createAutoscuolaAppointment`,
  `createAutoscuolaAppointmentBatch` (`autoscuole.actions.ts`),
  `createBookingRequest`, `respondWaitlistOffer`
  (`autoscuole-availability.actions.ts`).
- `createAutoscuolaAppointment` risponde `code: "LESSON_BUFFER_CONFIRM"` quando
  non c'è spazio — **solo per lo staff**, `isStudentActor` lo salta.
- `app/api/autoscuole/instructor-bookings/confirm/route.ts`: inoltra
  `confirmNoBuffer` (è la strada dell'app istruttore).

### Web
- `tabs/BookingsTab.tsx`: riga «Pausa tra una guida e l'altra» nel sotto-tab
  Limiti; `NumberField` ora accetta `step`.
- `AutoscuoleResourcesPage.tsx`: stato + auto-save dei due campi.
- `AutoscuoleAgendaPage.tsx`: blocco «Pausa» (grigio tenue a righine) e conferma
  `LESSON_BUFFER_CONFIRM` in `handleCreate`.

### Mobile
- `src/utils/weeklyAgenda.ts`: `BlockKind: 'buffer'` + `BLOCK_PRESENTATION.buffer`.
- `src/components/booking/BookingForm.tsx`: alert «Nessuna pausa» + retry con
  `confirmNoBuffer`.
- `src/types/regloApi.ts`: i due campi del setting (lettura) + `confirmNoBuffer`.

### Test
`tests/unit/autoscuole/lesson-buffer.test.ts` — 13 test su normalizzazione,
setting spento/acceso, troncamento della finestra e condizione dell'avviso
(client Prisma finto, nessun DB).

## Una scelta da confermare

L'avviso scatta quando **la pausa intera non ci sta**, non solo quando il buco è
esatto: con buffer 15' e un impegno 5 minuti dopo la fine della guida,
l'istruttore vede comunque «Non avrai tempo per una pausa», e confermando la
pausa nasce troncata a 5'. Una regola sola invece di due casi, e coerente col
testo del messaggio. Se si preferisce che a spazio parziale non chieda niente e
tronchi in silenzio, è una riga in `lacksRoomForLessonBuffer`.

## Limite noto (deciso, non dimenticato)

**La pausa non segue la guida.** Se la guida che l'ha generata viene annullata,
spostata o rimossa dallo storico, il blocco resta dov'è e va tolto a mano
dall'agenda (è cancellabile come qualsiasi blocco, da web e da app).

Agganciare la pausa alla guida vorrebbe dire toccare tutte le mutazioni che
spostano o cancellano una guida (annullo, rimozione dallo storico, riprogramma,
scambio, malattia che cancella le guide) — cioè esattamente la complessità che
questo giro voleva evitare. Se dopo il primo uso reale si rivela fastidioso, la
strada più economica è un campo `sourceAppointmentId` sul blocco e la pulizia nei
3-4 punti che cambiano `startsAt`/`status` di una guida.

Altri due comportamenti da tenere a mente:
- cambiare i minuti o spegnere il setting vale **solo per le guide prenotate da
  lì in avanti**: le pause già create restano;
- esami e guide di gruppo non creano pausa (flussi propri, nessun codice
  dedicato a escluderli).

## Verifiche fatte

- `pnpm test:unit` → 24 suite, 325 test, tutti verdi.
- `npx tsc --noEmit` pulito su entrambi i repo (sul mobile resta il solo errore
  pre-esistente di `TabNavigator.tsx`, verificato presente anche su `master`).
- `next lint` sui file toccati: nessun nuovo warning.
- **E2E** `tests/e2e/lesson-buffer.auth.spec.ts`: verde **in locale e su
  staging.reglo.it**. Copre setting acceso → pausa dopo la guida, prenotazione
  dentro la pausa rifiutata, pausa troncata sull'impegno successivo, guida che
  riempie il buco → `LESSON_BUFFER_CONFIRM` senza creare niente, retry con
  `confirmNoBuffer` → guida senza pausa, blocco «Pausa» leggibile in agenda,
  setting spento → nessuna pausa. Pulisce e ripristina il setting.
- Screenshot di staging in `/tmp/hiro-anteprime/reg-484-pausa/`.
- Verificato dopo i run: `AutoscuolaInstructorBlock` a **0 righe** su staging e
  setting rimesso a spento — niente residui.
- Altri e2e: `login-stato-client` fallisce **anche sul commit base** `6aca72a`
  (pre-esistente, non legato a questa feature); `consorzio-allievi` e
  `instructor-qr` falliscono solo nel giro completo e passano da soli
  (interferenza fra test sullo stesso dato).
- **Mai provato dall'app mobile**: il simulatore lo lancia Tiziano
  (`npm run ios:staging`).
