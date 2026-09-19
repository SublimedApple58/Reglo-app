# Blocco prenotazioni in bulk (REG-442)

Nella sezione **Allievi** il titolare può selezionare più allievi con una
checkbox per riga e bloccare (o riattivare) le loro prenotazioni in un colpo
solo. Il blocco può essere **indefinito** o **fino a una data**, dopo la quale
si rilascia da solo.

Solo web (il mobile subisce l'effetto, non ha nuovi endpoint né nuovi tipi).

## Idea di fondo

Non è un blocco nuovo: è **lo stesso** `CompanyMember.bookingBlocked` del toggle
singolo nel dettaglio allievo e dell'auto-block per debito
([auto-booking-block-debt.md](auto-booking-block-debt.md)), applicato a N righe
invece che a una. Due sole aggiunte:

1. **Bulk** — un'unica server action (`setStudentsBookingBlock`) che applica la
   stessa semantica del toggle singolo a tutti gli id selezionati. Anche il
   toggle singolo passa ora dallo stesso cuore (`applyStudentsBookingBlock`),
   così le due strade non possono divergere.
2. **Scadenza** — `CompanyMember.bookingBlockUntil`: istante oltre il quale il
   blocco non vale più. Null = indefinito (il comportamento storico di tutti i
   blocchi esistenti).

### Semantica della scadenza

La data scelta dal titolare è **l'ultimo giorno bloccato, incluso**:
`blockUntilDateToInstant("2026-09-22")` → mezzanotte del 23 in **Europe/Rome**.
Il 22 resta bloccato per intero, il 23 mattina l'allievo può riprenotare.

La scadenza vale **solo per i blocchi manuali** (`bookingBlockReason="manual"`).
L'auto-block per debito si rilascia da sé quando il debito scende: non usa date.

Quando un blocco a tempo scade **non** si scrive il watermark
`unpaidBlockClearedAtCount` (che invece uno sblocco manuale imposta): uno sblocco
a mano è una decisione sul singolo allievo ("per me può prenotare"), una scadenza
no. Finito il blocco a tempo, l'automatismo per debito torna ad avere l'ultima
parola.

### Come si spegne un blocco scaduto

Due meccanismi, volutamente ridondanti:

| | Cosa fa | Dove |
|---|---|---|
| **Lettura** | `isBookingBlockActive(row, now)` tiene conto della scadenza anche se la riga non è ancora stata ripulita — costo zero, nessuna query | ogni punto di enforcement |
| **Scrittura** | `releaseExpiredManualBlocks()` ripulisce davvero le righe (la pill "Bloccato" sparisce, il booleano grezzo torna vero) | lista allievi + dettaglio + guard prenotazione + cron notturno |

**Regola per chi aggiunge un nuovo punto di enforcement:** mai leggere
`bookingBlocked` grezzo — passare da `isBookingBlockActive`, selezionando anche
`bookingBlockUntil`.

## File coinvolti

| File | Ruolo |
|------|-------|
| `prisma/schema.prisma` (`CompanyMember`) | Campo `bookingBlockUntil` (DateTime?) |
| `prisma/migrations/20260919120000_add_booking_block_until/` | Migration (1 colonna nullable, additiva) |
| `lib/autoscuole/booking-block.ts` | **Puro, no Prisma** (lo importa anche il client): `isBookingBlockActive`, `isBookingBlockExpired`, `blockUntilDateToInstant`, `blockUntilInstantToDateLabel`, `EXPIRED_BLOCK_PATCH` |
| `lib/autoscuole/booking-block-expiry.ts` | Lato DB: `releaseExpiredManualBlocks({companyId?, userId?, now?})` |
| `lib/actions/autoscuole.actions.ts` | `applyStudentsBookingBlock` (cuore condiviso), `setStudentsBookingBlock` (bulk), `toggleStudentBookingBlock` (singolo, ora delega); `getAutoscuolaStudentsWithProgress` + `getAutoscuolaStudentDrivingRegister` espongono `bookingBlockUntil` e ripuliscono le scadenze |
| `lib/autoscuole/unpaid-auto-block.ts` | `getStudentsUnpaidLessonCounts` — versione batch del conteggio, per il watermark dello sblocco in bulk |
| `lib/actions/autoscuole-availability.actions.ts` | Guard prenotazione, `getBookingOptions`, inviti/self-enrol gruppi, `getStudentBookingBlockStatus` → tutti via `isBookingBlockActive` |
| `lib/actions/autoscuole-swap.actions.ts` | Offerte e accettazione scambi → via `isBookingBlockActive` |
| `trigger/autoscuole-booking-block-expiry.ts` | Cron notturno che rilascia i blocchi scaduti |
| `components/pages/Autoscuole/AutoscuoleStudentsPage.tsx` | Checkbox di riga, testata "seleziona tutti", barra azione flottante, dialog di conferma |
| `components/ui/checkbox.tsx` | Stato `indeterminate` → trattino invece della spunta |
| `components/ui/date-picker.tsx` | `minDate` opzionale su `DatePickerInput`/`CalendarGrid` |
| `tests/unit/autoscuole/booking-block.test.ts` | 14 test sui predicati puri + conversione data↔istante (ora legale e solare) |
| `tests/e2e/bulk-booking-block.auth.spec.ts` | e2e titolare: selezione → blocco con data → pill → sblocco |

## UI

- **Checkbox per riga** nei tab **Teoria**, **Pratica** (sotto-tab Lista) e
  **Patentati**. Fuori dal tab **In attesa**: un allievo non ancora attivato non
  può prenotare, bloccarlo non vuol dire niente.
- **Testata** sopra la lista: "Seleziona tutti (N)" → seleziona l'**intera lista
  filtrata** del tab, pagine non visibili comprese. Con una selezione parziale la
  checkbox mostra un trattino e il testo diventa "3 selezionati su 35".
- **Barra flottante** in basso al centro appena c'è ≥1 selezionato: contatore,
  "Sblocca" (solo se almeno un selezionato è bloccato), "Blocca prenotazioni", ✕.
- **Dialog**: nomi in chiaro dei selezionati (primi 6 + "e altri N"), scelta
  durata (indeterminato / fino a una data), calendario che non propone giorni
  passati.
- La selezione si azzera al cambio di tab, ricerca, sotto-tab o filtro "Solo
  pronti": non si agisce mai su allievi che non si stanno guardando.
- Nella lista un blocco a tempo appare come pill rossa "Bloccato" + "· fino al
  22 set" sulla riga secondaria (nella pill mangiava il nome dell'allievo); nel
  dettaglio allievo come "Fino al 22 settembre 2026 · poi si riattiva da solo".
- Il toggle singolo del dettaglio allievo blocca **a tempo indeterminato** e
  azzera un'eventuale scadenza messa in bulk.

## Permessi

`canManageStudentCredits` (owner/admin), lo stesso del toggle singolo.
L'action verifica sempre che gli id selezionati siano allievi **di quella**
company prima di scrivere.

## Migration

Schema modificato → `pnpm migrate:dev` (dev, già applicata), `pnpm
migrate:staging`, `pnpm migrate:prod` (solo con OK esplicito). Colonna nullable,
retro-compatibile, nessun backfill: i blocchi esistenti restano indefiniti.

Nuovo job Trigger.dev → serve `pnpm trigger:deploy:*` sull'ambiente in cui si
rilascia.
