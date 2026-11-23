# REG-776 — Rifiniture del design system: radius coerenti per ruolo

Stato: su staging, in attesa dell'ok per la produzione (branch `fix/reg-776-rifiniture-ds`).

## Segnalazioni di Tiziano (prod, 23/11)

1. Dialog «Nuovo appuntamento» in agenda: radius diversi tra Giorno/Orario,
   segmentato Durata, card Auto/Moto e Birilli/Strada; CTA «Crea guida» poco
   tonda; «Annulla» come link sottolineato.
2. Bottone «+» dell'agenda accanto a Filtri/cerca fuori sistema.
3. Allievi: cursore nero del segmentato che «esce» dal binario (ombra pesante);
   «Lista» / «Cancellazioni tardive» come due bottoni sciolti.
4. Drawer allievo: «Tipi completati» va a capo e il valore si sovrappone
   all'etichetta.

## Regola: un raggio per ruolo (tutta la web app)

| Ruolo | Forma | Come |
|---|---|---|
| CTA (azione principale, nera) | capsula | `<Button>` (default); attesa con `loading`, mai cambio etichetta |
| Bottone secondario (bianco) | capsula | `<Button variant="outline">` |
| «Annulla» / «Indietro» nei footer | capsula senza fondo | `<Button variant="ghost">` (mai link sottolineato) |
| Bottone solo icona (X, cestino, frecce, ⋯, zoom) | tondo | `rounded-full` |
| Campo (input, textarea, select, data, ora) | 14px incavato | `Input` / `PROTO_INPUT` / `rounded-[14px] border-0 bg-white shadow-clay-sink` + `focus:shadow-clay-focus`; errore `shadow-[inset_0_0_0_1.5px_#C13515]` |
| Ricerca in toolbar | capsula | `rounded-full` |
| Card selezionabile (scelta fra 2–4 opzioni) | 14px | `SELECTABLE_CARD` + `SELECTABLE_CARD_ON` / `_OFF` (`components/ui/proto-styles.ts`): in rilievo spenta, bordo interno nero scelta |
| Segmentato | capsula, cursore nero | `SegmentedPill` / `SegmentedControl`; cursore `shadow-clay-ink-sm` (l'ombra resta nel binario) |
| Chip di scelta (filtri, tipi guida) | capsula | `rounded-full` |

Restano come sono (macrostruttura o altro ruolo): pagine, sezioni, card
contenitore, popover/menu e le loro voci, tabelle, skeleton, avatar, campioni
colore, celle di calendario, blocchi agenda, anteprime grafiche.

## Fatto

- Punto 1: `CreateEventPopover` con `rounded-clay` + `shadow-clay-overlay` e
  X/indietro come la X dei `Dialog`; `DatePickerInput` e `TimePickerInput` come
  `Input` (14px incavati); `DurationField` binario incavato a capsula con
  cursore nero; Auto/Moto e Birilli/Strada su `SELECTABLE_CARD`; footer con
  `Button` (ghost «Annulla», CTA con `loading`); campo Allievo incavato.
- Punto 2: «+» è un `Button` (capsula nera con volume); zoom, schermo intero,
  stampa, Filtri e cerca tondi.
- Punto 3: nuovo token `shadow-clay-ink-sm` nei segmentati; «Lista» /
  «Cancellazioni tardive» diventano un `SegmentedPill` con il conteggio.
- Punto 4: `DetailRow` con valore: l'etichetta tiene la sua larghezza (max
  60%), il valore va a capo allineato a destra; i tipi completati non si
  spezzano a metà.
- Giro sul resto dell'app: scansione dei `<button>`/`<input>`/`<textarea>`/
  `<select>`/`<Button>` con raggi non da ruolo (238 punti in 92 file), divisi
  in 4 gruppi di file (agenda; autoscuole; Road/Consorzio/layout; backoffice).
  CTA e secondari portati su `Button` (con `loading`), «Annulla» sottolineati
  → ghost, campi incavati 14px, card di scelta su `SELECTABLE_CARD`,
  segmentati fatti a mano a capsula col cursore nero, bottoni icona tondi.
  Lasciati di proposito: voci di menu, righe di lista, campioni colore, blocchi
  agenda, link testuali in linea.
- `ToggleChip` accesa nera (era grigia); data «Prenotazioni aperte dal» senza
  il vecchio bordo.
- Effetto collaterale voluto: spariti gli accenti arancio/verde acqua/verde/
  rosso su card e segmentati (Moto/Standard nei gruppi, Esito, Presente/
  Assente, Conferma ferie): bianco e nero come il resto.

## Verifica

- `tsc` pulito, eslint senza errori; smoke e2e aggiornato («Cancellazioni
  tardive» ora è una scheda del segmentato).
- Ritagli prima (staging) / dopo (locale su DB staging) dei 4 punti, desktop e
  390, in `/tmp/hiro-anteprime/reg-776/finale/`.
