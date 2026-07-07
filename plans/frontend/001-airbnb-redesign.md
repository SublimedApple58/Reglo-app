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

- 2026-07-07: branch creato.
- Step 0 FATTO (`5882793`): Figtree via next/font, token navy/hairline/radius14/shadow-panel in globals.css (+tailwind.config), primitive PageHeader + SegmentedPill. + `6dfae9a`: ripulito il fucsia hardcoded dalle primitive condivise (Button hover, Badge, TableRow, UserAvatarFallback, page-states).
- Step 1 FATTO (`5882793`): shell top nav 84px con tri-tab 3D (asset in public/images/nav/), hamburger menu (Impostazioni/Pagamenti/Utenti/Profilo/Esci), switcher sedi nell'avatar, landing = Agenda (Dashboard ritirata), teaser Rinnovi, RegloTabs interne spente, staging-smoke e2e aggiornato. VERIFICATO dall'utente.
- Fase 2 Agenda FATTA e VERIFICATA (`e2ca86b`+`252db79`+`1d1ea6d`+`6e6cc69`+`cc3b08d`):
  - toolbar: PageHeader con conteggi, date-nav a cerchi, SegmentedPill, FAB + navy, menu Nuovo mono-icona
  - griglia: header giorno DOW+cerchio (oggi pieno), weekend #fafafa, festivo ambra, gutter #fafafa, righe #f5f5f5 (3 viste)
  - filtri: chip Airbnb (attivo=bordo #222 col valore) + MULTI-SELEZIONE con checkbox/Azzera/Applica, client-side (no refetch), filtro istruttori nasconde le colonne non selezionate nelle viste Istruttori
  - colori blocchi: sistema unificato da ~/Desktop/Reglo-Colori-Blocchi-Guida.html (durata blu/lime/giallo/fucsia/rosa; esame #F5F0FF; gruppo #ECFDF5; gruppo moto arancio #FFEDD5 tenuto; annullata/assente muted #F3F4F8; NO bordi + ombra in tinta .22; stato sul badge, completata NON verde; override moto/automatico RIMOSSI; cluster "N guide" navy #1e293b). Legenda riscritta.
  - fix: blocchi <button> senza flex venivano centrati verticalmente da Chrome → flex flex-col justify-start ovunque.

## Next steps

1. **Chiusura fase 2** (se l'utente segnala altro sull'agenda: radius/padding blocchi ancora da confermare visivamente).
2. **Fase 3 — Allievi**: lista con tab pill (In attesa/Teoria/Pratica/Esami nel proto; nostro = Allievi/Cancellazioni tardive per ora), righe hairline con avatar tondo + badge stato + CTA "Dettaglio" outline, **detail panel destro 600px** con backdrop (pattern proto #detail-panel). Costruire components/ui/detail-panel.tsx. Aggiornare/creare e2e Allievi.
3. **Fase 4 — Impostazioni dell'account**: ex Configurazione come overlay full-screen con sidebar sinistra (proto #section-configurazione), Pagamenti dentro. E2e vehicles.auth.spec passa da ?tab=settings: verificare che continui a funzionare.
4. **Fase 5 — Segretaria** (pagina voice: linea attiva card, script, orario, richiamate).
5. **Fase 6 — Minori**: Utenti (/admin/users restyle), Ore guida (nuova), Area personale (nuova), referral + Novità nel menu.
6. **Post-redesign**: allineare colori blocchi sul MOBILE (WeeklyAgendaView getLessonLook + DayItinerary) — vedi memoria project_lesson_block_colors_unification.

Promemoria operativi: dev server è dell'utente (NO pnpm build con dev attivo); verificare con typecheck+lint+Playwright (login titolare@reglo.it/RegloTest2026!, aspettare hydration 3.5s prima del fill); commit su feat/airbnb-redesign, NIENTE staging/prod fino a fine progetto; proto renderizzabile con `python3 -m http.server 8899` in ~/Downloads/dashboard + Playwright.
