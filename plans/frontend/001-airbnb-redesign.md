# Redesign web app in chiave Airbnb

**Branch:** `feat/airbnb-redesign` · **Avviato:** 2026-07-07 · **Stato:** in corso (step 0-1)

Fonte di verità: prototipo `~/Downloads/dashboard/Dashboard.dc.html` (renderizzare via http server + browser; gli screenshot nella cartella sono iterazioni vecchie — il corallo #ff385c NON vale, l'accento attuale è navy #1a1a2e).

## Direzione design (dal prototipo)

- **Font**: Figtree (Google Fonts), body min 500, display 600-700
- **Testo**: #222222 primario, #6a6a6a secondario, #929292 muted — mai #000
- **Accento**: navy #1a1a2e (CTA, tab attiva, blocchi agenda); hover #2d2d4a; tinte #eeeef4/#e2e2e8
- **Hairline**: #dddddd per bordi/divisori; sfondi #f7f7f7 / #f2f2f2
- **Radius**: 10px input, 12-14px card, 20px pannelli/pill, 50% tondi
- **Shadow**: liste SENZA ombra (whitespace + hairline); signature 3 strati solo pannelli/modali/dropdown
- **Pattern**: page header 34/700 + sottotitolo grigio · segmented pill (track #f2f2f2, thumb bianco) · FAB "+" navy tondo · liste-righe con avatar tondo colorato + badge pill + CTA outline "Dettaglio" · detail panel destro 600px con backdrop · focus ring #222

## Nuova IA (approvata)

Top nav 84px #f7f7f7: logo sx · 4 tab centrali con icone 3D (Agenda, Allievi, Segretaria, Rinnovi) + underline 2px navy · pillola avatar + hamburger dx.
- Dashboard eliminata → landing = Agenda
- Configurazione → "Impostazioni dell'account" (overlay full-screen, sidebar sinistra)
- Pagamenti → dentro Impostazioni (fase 4; nel frattempo resta raggiungibile dal menu)
- Users → "Utenti" nel menu hamburger
- Nuove sezioni (fase 6): Area personale, Ore guida, Rinnovi teaser, referral, Novità

## Fasi

0. **Fondamenta** — Figtree, token CSS (navy/hairline/radius/shadow/focus), primitive PageHeader + SegmentedPill. Nessun cambio di layout.
1. **Shell + top nav** — header 84px, tri-tab 3D, hamburger menu, landing→agenda. Aggiornare `staging-smoke.auth.spec.ts` (testid dashboard).
2. **Agenda** — toolbar, griglia, colori eventi (decidere palette: proto navy+pastelli vs piano per-durata)
3. **Allievi** — liste + detail panel destro
4. **Impostazioni dell'account** — ex Configurazione full-screen + Pagamenti dentro
5. **Segretaria**
6. **Minori** — Utenti, Ore guida, Area personale, Rinnovi teaser
7. e2e aggiornati per sezione, man mano (non alla fine)

**Metodo**: una sezione alla volta → debug/testing → verifica utente → next. Regola per sezioni non coperte dal proto (pratiche, documenti, scadenze, comunicazioni, disponibilità): restyle con i nuovi token mantenendo il layout attuale.

## Log

- 2026-07-07: branch creato, step 0-1 in corso.
