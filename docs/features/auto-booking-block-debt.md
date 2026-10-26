# Auto-block prenotazioni per debito allievo

Blocco automatico delle prenotazioni quando un allievo supera una soglia di
**guide da pagare non ancora saldate**. Impostazione a livello di autoscuola,
configurabile SOLO nel pane "Prenotazioni e allievi" → tab **Limiti**.

Configurazione solo web. Dal 2026-07-28 il mobile **conosce** lo stato del blocco:
`getBookingOptions` espone `bookingBlocked` e l'app allievo ferma il tasto
"Prenota" con un messaggio chiaro (prima la ricerca slot falliva in silenzio —
caso Robatto).

## Idea di fondo

Il blocco automatico scrive sullo **stesso** campo booleano `CompanyMember.bookingBlocked`
del blocco manuale del titolare (unificazione, non un flag separato). Per non
entrare in conflitto con l'azione del titolare, ogni blocco porta un'**origine**:

| `bookingBlockReason` | Significato | L'automatismo può toccarlo? |
|----------------------|-------------|------------------------------|
| `"manual"`           | Bloccato dal titolare | **No, mai** (né sblocca né riclassifica) |
| `"unpaid_threshold"` | Bloccato dall'automatismo per soglia | Sì: lo sblocca quando l'allievo scende sotto soglia |
| `null`               | Non bloccato — oppure blocco **legacy** (bloccato senza reason): trattato come manuale per sicurezza | No (se `bookingBlocked=true`) |

Dal 2026-09-19 (REG-442) un blocco `manual` può avere una **scadenza**
(`bookingBlockUntil`): quando scade la riga viene rilasciata (`reason` → null)
**prima** del reconcile per debito, quindi l'automatismo torna padrone di
quell'allievo. La scadenza non scrive il watermark. Vedi
[bulk-booking-block.md](bulk-booking-block.md).

### Anti-conflitto (watermark)

Se il titolare **sblocca a mano** un allievo bloccato dall'automatismo, non
vogliamo che l'automatismo lo riblocchi subito per lo stesso debito residuo. Lo
sblocco manuale registra un **watermark** `unpaidBlockClearedAtCount` = numero di
guide non pagate al momento dello sblocco. L'automatismo riblocca **solo** se:
- il debito **supera** quel livello (nuovo incremento), **oppure**
- prima scende sotto soglia (il watermark viene azzerato) e poi risale.

La logica è una macchina a stati **pura** e testata: `resolveUnpaidAutoBlock`.

## File coinvolti

| File | Ruolo |
|------|-------|
| `prisma/schema.prisma` (`CompanyMember`) | Nuovi campi `bookingBlockReason` (String?), `unpaidBlockClearedAtCount` (Int?) |
| `prisma/migrations/20260723120000_add_auto_booking_block/` | Migration (2 colonne nullable) |
| `lib/autoscuole/lesson-unpaid.ts` | **Regola unica "da pagare" (REG-634)**, modulo puro importabile anche dal client: `isLessonUnpaid` (esclude `cancellationKind="record_cleanup"`), `isCompanyManualMode`, `UNPAID_LESSON_SELECT`, `NOT_CLEANED_UP_WHERE`, pre-filtro Prisma `unpaidLessonCandidatesWhere` |
| `lib/autoscuole/unpaid-auto-block.ts` | **Cuore**: state machine pura `resolveUnpaidAutoBlock`, `reconcileUnpaidAutoBlock` (scrive), `getStudentUnpaidLessonCount` / `getStudentsUnpaidLessonCounts` (unico conteggio server, senza `take`), `readAutoBlockSettings`, default; ri-esporta `isLessonUnpaid` |
| `lib/services.ts` | `ServiceLimits.autoBookingBlockEnabled` / `autoBookingBlockThreshold` |
| `lib/actions/autoscuole-settings.actions.ts` | Read/validate/save dei due setting nel JSON `limits` |
| `lib/actions/autoscuole.actions.ts` | `getAutoscuolaStudentsWithProgress` + `getAutoscuolaStudentRegister` riconciliano on-read; `toggleStudentBookingBlock` marca `reason` + watermark (dal 2026-09-19 via `applyStudentsBookingBlock`, condiviso col bulk REG-442); importa `isLessonUnpaid` dall'helper |
| `lib/actions/autoscuole-availability.actions.ts` | Guard prenotazione da app: riconcilia **prima** di controllare `bookingBlocked` (enforcement al momento della prenotazione) |
| `components/pages/Autoscuole/tabs/BookingsTab.tsx` | UI switch + soglia nel tab Limiti |
| `components/pages/Autoscuole/AutoscuoleResourcesPage.tsx` | State + load + auto-save (`persistField`) + wiring props |
| `components/pages/Autoscuole/AutoscuoleStudentsPage.tsx` | Mostra "Blocco automatico per guide da pagare" nel dettaglio; toggle manuale aggiorna `reason` in ottimistico |
| `tests/unit/autoscuole/unpaid-auto-block.test.ts` | 20 test sulla state machine + helper |
| `tests/unit/autoscuole/lesson-unpaid.test.ts` | REG-634: caso reale (5 guide di cui una penale rimossa dallo storico → 4, nessun blocco) + pre-filtro Prisma ≡ `isLessonUnpaid` su tutte le combinazioni |

## Dove scatta il calcolo (calcolo on-read + reconcile)

Nessun job dedicato: il conteggio "guide da pagare" (`isLessonUnpaid`, stessa
definizione di `manualUnpaid` mostrato in UI) viene ricalcolato e riconciliato:
1. **Lista allievi titolare** (`getAutoscuolaStudentsWithProgress`) — `manualUnpaid`
   viene da `getStudentsUnpaidLessonCounts` (una query sulle sole guide candidate);
   self-heal della pill "Bloccato".
2. **Dettaglio allievo** (`getAutoscuolaStudentRegister`).
3. **Guard prenotazione da app** (`ensureStudentCanBookFromApp`-like in
   availability): **solo se la feature è attiva**, calcola il debito e riconcilia
   prima del check → enforcement esatto al momento in cui l'allievo prova a prenotare.
4. **`getBookingOptions`** (home allievo mobile): stesso reconcile, ed espone
   `bookingBlocked: boolean` nel payload → l'app blocca il tasto "Prenota" con
   toast "prenotazioni sospese, contatta la segreteria" invece di lasciar partire
   ricerche destinate al 400 silenzioso (bug segnalato da Robatto il 28/07).

Scritture rare: `reconcileUnpaidAutoBlock` persiste solo quando lo stato cambia.

**Tutti i punti devono contare uguale (REG-634, 26/10/2026).** Prima la scheda
allievo escludeva le guide rimosse dallo storico (`record_cleanup`) e gli altri
punti no: un allievo con una penale rimossa stava sopra soglia per la
prenotazione e sotto per la scheda. Aprire la scheda toglieva il blocco (e il
watermark dello sblocco manuale), il primo tentativo di prenotazione lo
rimetteva. Ora la regola è `isLessonUnpaid` di `lesson-unpaid.ts` ovunque,
`cancellationKind` è un campo **obbligatorio** del suo input (chi conta deve
selezionarlo, o non compila) e il conteggio server è uno solo. La lista allievi
contava inoltre su guide troncate a 5000 per tutta l'autoscuola senza ordine:
ora il debito ha la sua query, senza tetto. «Rimuovi dallo storico» resta
com'è: non azzera la penale sul record, semplicemente non conta più.

## Guardrail

- Blocco manuale del titolare (`reason="manual"`) e blocchi legacy sono **intoccabili**.
- Spegnere la feature rilascia solo i blocchi messi dall'automatismo (`unpaid_threshold`);
  i blocchi manuali restano.
- Lo stesso campo `bookingBlocked` è già letto dagli altri enforcement (swap
  accept/offer, availability) → il blocco automatico li rispetta senza codice extra.
- Vale anche qui la regola su **chi** viene fermato: solo l'allievo che si
  prenota da sé. Istruttore e segreteria prenotano lo stesso (con warning) —
  vedi `bulk-booking-block.md`, sezione "A chi si applica il blocco".

## Migration

Schema modificato → richiede `pnpm migrate:dev` (dev) e `pnpm migrate:prod` (prod,
solo con OK). La migration `20260723120000_add_auto_booking_block` aggiunge due
colonne nullable, retro-compatibile (nessun backfill).
