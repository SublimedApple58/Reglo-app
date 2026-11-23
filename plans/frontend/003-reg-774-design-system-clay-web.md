# REG-774 — Basi del design system «clay leggero» sulla web app

## Cosa è stato fatto (2026-11-23, su staging)

- Token `rounded-clay` e ombre `shadow-clay-*` in `assets/styles/globals.css`.
- Componenti condivisi rifatti: `Button` (capsule, CTA nera con volume, premuta
  sprofonda, prop `loading`, size `bare`), `Input`, `Textarea`, `SelectTrigger`
  e le stringhe `PROTO_*` / `SETTINGS_SELECT_TRIGGER` (campi bianchi incavati,
  focus nero), `Dialog` / `AlertDialog` (raggio 28, X tonda in rilievo),
  `InlineToggle` (binario incavato nero, variante `decorative`), `Checkbox`
  (6px), `Card` (raggio 28 in rilievo), `SegmentedControl` / `SegmentedPill`
  (cursore nero).
- Convertite verso `Button` le CTA nere fatte a mano (29 in 23 file, misure
  invariate con `size="bare"`, caricamento con `loading`); `finance-ui`
  allineato con le stesse classi. L'unico interruttore disegnato a mano
  (`BandLocationMenu`) e le righe `role="switch"` usano `InlineToggle`
  (`decorative`, niente bottone dentro bottone).
- Via il blu dall'interfaccia: link neri sottolineati (`inlineLinkClass`, ex
  `blueLinkClass`), icone, filtri ed etichette del backoffice neutri, tono
  `blue` delle pillole allievo in grigio scuro, chip selezionate neutre.
  Restano i colori-dato (istruttori, tipi di guida, avatar, fase Teoria).
- Documentazione: `docs/design-system.md` §4b.

Verifiche: typecheck ed eslint puliti; unit test come prima (falliscono solo
`notify-guard` e `road-marker-edit`, già rotti); controllo visivo locale
desktop e 390px di agenda, allievi, impostazioni, pagamenti, backoffice:
titoli alla stessa altezza di prima su tutte le pagine, niente scroll
orizzontale, nessun errore.

## Piano originale (approvato da Tiziano)

### Fase 1 — Token e componenti base
CTA nera con ombra e stato premuto, loading del bottone, secondari tondi,
radius coerenti (sempre la CTA più tonda), card, input con bordo e focus,
toggle. Solo componenti condivisi, nessuna macrostruttura.

### Fase 2 — Decisioni di Tiziano
1. A: convertire subito le CTA nere e gli interruttori fatti a mano, layout
   invariato.
2. Segmentati con cursore nero come sul mobile.
3. Niente blu nell'interfaccia; restano i colori che sono dati.
4. Card con raggio 28 in rilievo.

### Fase 3 — Verifica e staging
Typecheck, lint, test, controllo visivo desktop/390, ship su staging,
ritagli finali dalla UI vera. Produzione solo con ok.

## Rischi noti
- I `<button>`/`<input>` fatti a mano (chip, «Dettaglio», durate) restano col
  vecchio stile finché non si ridisegna la pagina (REG-775 parte dal drawer
  allievo).
- 11 `Button` e 11 `DialogContent` con classi che forzano forma/colore: lì
  vince la pagina.
