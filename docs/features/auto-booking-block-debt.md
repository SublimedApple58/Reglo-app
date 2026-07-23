# Auto-block prenotazioni per debito allievo

Blocco automatico delle prenotazioni quando un allievo supera una soglia di
**guide da pagare non ancora saldate**. Impostazione a livello di autoscuola,
configurabile SOLO nel pane "Prenotazioni e allievi" → tab **Limiti**.

Solo web/backend: **nessun riflesso mobile** (decisione di prodotto). Il mobile
subisce solo l'effetto del blocco (già gestito dal blocco prenotazioni esistente).

## Idea di fondo

Il blocco automatico scrive sullo **stesso** campo booleano `CompanyMember.bookingBlocked`
del blocco manuale del titolare (unificazione, non un flag separato). Per non
entrare in conflitto con l'azione del titolare, ogni blocco porta un'**origine**:

| `bookingBlockReason` | Significato | L'automatismo può toccarlo? |
|----------------------|-------------|------------------------------|
| `"manual"`           | Bloccato dal titolare | **No, mai** (né sblocca né riclassifica) |
| `"unpaid_threshold"` | Bloccato dall'automatismo per soglia | Sì: lo sblocca quando l'allievo scende sotto soglia |
| `null`               | Non bloccato — oppure blocco **legacy** (bloccato senza reason): trattato come manuale per sicurezza | No (se `bookingBlocked=true`) |

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
| `lib/autoscuole/unpaid-auto-block.ts` | **Cuore**: state machine pura `resolveUnpaidAutoBlock`, `reconcileUnpaidAutoBlock` (scrive), `getStudentUnpaidLessonCount`, `isLessonUnpaid` (definizione unica condivisa), `readAutoBlockSettings`, default |
| `lib/services.ts` | `ServiceLimits.autoBookingBlockEnabled` / `autoBookingBlockThreshold` |
| `lib/actions/autoscuole-settings.actions.ts` | Read/validate/save dei due setting nel JSON `limits` |
| `lib/actions/autoscuole.actions.ts` | `getAutoscuolaStudentsWithProgress` + `getAutoscuolaStudentRegister` riconciliano on-read; `toggleStudentBookingBlock` marca `reason` + watermark; importa `isLessonUnpaid` dall'helper |
| `lib/actions/autoscuole-availability.actions.ts` | Guard prenotazione da app: riconcilia **prima** di controllare `bookingBlocked` (enforcement al momento della prenotazione) |
| `components/pages/Autoscuole/tabs/BookingsTab.tsx` | UI switch + soglia nel tab Limiti |
| `components/pages/Autoscuole/AutoscuoleResourcesPage.tsx` | State + load + auto-save (`persistField`) + wiring props |
| `components/pages/Autoscuole/AutoscuoleStudentsPage.tsx` | Mostra "Blocco automatico per guide da pagare" nel dettaglio; toggle manuale aggiorna `reason` in ottimistico |
| `tests/unit/autoscuole/unpaid-auto-block.test.ts` | 20 test sulla state machine + helper |

## Dove scatta il calcolo (calcolo on-read + reconcile)

Nessun job dedicato: il conteggio "guide da pagare" (`isLessonUnpaid`, stessa
definizione di `manualUnpaid` mostrato in UI) viene ricalcolato e riconciliato:
1. **Lista allievi titolare** (`getAutoscuolaStudentsWithProgress`) — riusa il
   `manualUnpaid` già calcolato, nessuna query extra; self-heal della pill "Bloccato".
2. **Dettaglio allievo** (`getAutoscuolaStudentRegister`).
3. **Guard prenotazione da app** (`ensureStudentCanBookFromApp`-like in
   availability): **solo se la feature è attiva**, calcola il debito e riconcilia
   prima del check → enforcement esatto al momento in cui l'allievo prova a prenotare.

Scritture rare: `reconcileUnpaidAutoBlock` persiste solo quando lo stato cambia.

## Guardrail

- Blocco manuale del titolare (`reason="manual"`) e blocchi legacy sono **intoccabili**.
- Spegnere la feature rilascia solo i blocchi messi dall'automatismo (`unpaid_threshold`);
  i blocchi manuali restano.
- Lo stesso campo `bookingBlocked` è già letto dagli altri enforcement (swap
  accept/offer, availability) → il blocco automatico li rispetta senza codice extra.

## Migration

Schema modificato → richiede `pnpm migrate:dev` (dev) e `pnpm migrate:prod` (prod,
solo con OK). La migration `20260723120000_add_auto_booking_block` aggiunge due
colonne nullable, retro-compatibile (nessun backfill).
