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
- Fase 3 Allievi FATTA (in attesa di verifica utente):
  - NUOVO `components/ui/detail-panel.tsx`: pannello destro 600px fixed top-84px con backdrop rgba(0,0,0,.12), slide-in 220ms, Escape/backdrop per chiudere, portal su body. Riusabile.
  - `components/ui/segmented-pill.tsx`: aggiunto `count` opzionale alle opzioni (conteggio grigio stile tab Allievi proto).
  - `AutoscuoleStudentsPage.tsx` RISCRITTO (logica/azioni invariate): tab pill In attesa/Teoria/Pratica/Patentati con conteggi (In attesa+Teoria solo se fase TEORIA attiva o gruppi non vuoti; Patentati solo se >0; default Pratica); Pratica ha sub-tab Lista | Cancellazioni tardive (pill nera attiva); righe hairline grid 2fr/1.5fr/1fr/1fr/110px con avatar tondo colorato (hash id su palette proto 8 colori) + pallino pagamenti sull'angolo avatar + pill Bloccato + seconda riga patente·istruttore; colonna stat (Guide X/Y, countdown esame teoria, Iscritto il); CTA Dettaglio outline; load-more 25 alla volta "Carica altri X · Y rimanenti"; search icona→pillola espansa con Annulla (resta server-side debounced); icone toolbar: chiave (modal Codice autoscuola stile referral proto, sostituisce il banner giallo), invita allievo (dialog esistente); banner Licenze Quiz restyled neutro (solo tab attesa/teoria); empty state proto.
  - Detail panel (sostituisce il Drawer vaul): header centrato avatar+nome+email + X, tab Riepilogo/Guide/Note sottolineate; Riepilogo = Anagrafica grid (con Case attiva, Percorso patente+Modifica, Fase percorso badge+Cambia fase+Assegna quiz), toggle Guide di gruppo, sezione Gestione prenotazioni (blocco, esenzione limite settimanale, override priorità esame con mini-pill), Istruttore assegnato, Riepilogo guide 4 stat, Obbligo guide (numero 32px + barra navy 4px), card Esame teorico (solo fase TEORIA), Tipi guida chips, Crediti guida (saldo+assegna/storna+CRONOLOGIA, +N navy/-N grigio). Guide/Note = righe timeline proto (data colonna 56px, orario+chip tipo blu/#428bff, esame chip viola, pill stato/pagamento, azioni "Segna pagata/da pagare" come link blu, ordinamento non-pagate-prima conservato, stelle rating conservate). Link-azione blu #428bff come nel proto.
  - `AutoscuoleLateCancellationsPanel.tsx` restyled: card hairline #dddddd radius 14 p-6, griglia info 2 col (preavviso in rosso), badge pill, footer border-t con Addebita/Non addebitare.
  - NIENTE PERSO: tutte le funzioni preesistenti mantenute (assegna quiz, cambia fase, modifica patente, blocco prenotazioni, esenzione limite, priorità esame, istruttore assegnato, crediti+ledger, pagamenti manuali guida per guida, penali cancellazioni, note+rating, invito email con piattaforma, codice autoscuola, ricerca server-side, conteggio cancellazioni tardive nel sub-tab). "Directory utenti" (ex ManagementBar) ora vive solo nel menu hamburger della shell ("Utenti"). L'unica sezione proto NON implementata è il tab "Esami" (esiti Promosso/Bocciato): non esiste backend per gli esiti esame — eventuale feature futura, non fa parte del restyle.
  - e2e: `autoscuole-smoke.spec.ts` aggiornato (era stantio: testid dashboard/sidebar rimossi) + nuovo test Allievi (lista, panel, tab Guide, Cancellazioni tardive). 2/2 verdi in locale.
  - Rifiniture post-feedback utente:
    - Modal codici: sotto il codice autoscuola ora lista le **chiavi degli istruttori autonomi** (nome + codice + Copia; solo autonomi con codice; `getAutoscuolaInstructors` espone già `inviteCode`).
    - Icona invita → **Crea account allievo**: dialog con Nome/Cognome, Email, Password, Categoria patente + Cambio (default dai settings), **Fase di partenza** (solo se Teoria attiva: In attesa / Teoria (disabilitata se posti quiz 0, consuma licenza) / Foglio rosa; default rispecchia la self-registration mobile), Istruttore assegnato opzionale. Backend: `createCompanyUser` (user.actions) esteso con `studentPhase` (TEORIA = grant seat con check posti, phaseClassifiedAt). Il vecchio invito email (`inviteAutoscuolaStudent`) non è più esposto qui.

- Fase 4 Impostazioni dell'account FATTA (in attesa di verifica utente):
  - `AutoscuoleResourcesPage` trasformata in **overlay full-screen** (fixed inset-0 z-[450], testid `autoscuole-settings-page`): header 72px logo+«Fatto» (torna a ?tab=agenda), grid 380px+1fr max-w-1280, sidebar «Impostazioni dell'account» con 3 gruppi separati da divider (Sede e luoghi, Fatturazione e pagamenti | Prenotazioni, Policy tipi guida, Promemoria e notifiche, Gestione allievi | Istruttori, Veicoli, Ore guida), voce attiva bg #f2f2f2; content scrollabile con h2 24/700; deep-link `?tab=settings&pane=<key>`; su mobile la sidebar diventa barra orizzontale scrollabile.
  - `SettingsTab` ha ora la prop `section` (SettingsSectionKey): renderizza UNA sezione senza chrome accordion (`standalone` su AccordionSection = solo descrizione+contenuto). Le pane bookings/policy/reminders/locations usano questa modalità; `registration` è appesa in fondo alla pane Gestione allievi; il tab legacy accordion resta funzionante se `section` non è passata.
  - **Pagamenti dentro Impostazioni**: pane `payments` monta `AutoscuolePaymentsPage tabs={null}`; menu hamburger «Pagamenti» → `?tab=settings&pane=payments` (la route ?tab=payments resta come fallback).
  - Giallo legacy neutralizzato: `ToggleChip` attivo → near-black #222 (primitiva condivisa), icone accordion `bg-[#eef0f6] text-navy-900`, PolicySwitch/card attive → `#eeeef4`/`#cfcfdc`, tab dei dialog disponibilità → bianco+bordo, calendario override → navy, banner codice istruttore neutro, LocationFormDialog. NON toccati i gialli semantici di warning (Stripe requirements, pallino pending).
  - e2e: `auth.setup.ts` fixato (aspettava ancora `autoscuole-dashboard-page` → `autoscuole-agenda-page`). Tutti e 5 i test passano in locale, incluso `vehicles.auth.spec` che attraversa il nuovo overlay (bottone «Veicoli» in sidebar).
  - Rifiniture post-feedback:
    - **Fix select nell'overlay**: z-[450] copriva i portal Radix (z-50) → overlay a z-40 (sopra header shell z-30, sotto Select/Dialog).
    - **Pane «Informazioni aziendali»** (nuova, prima voce sidebar): `tabs/BusinessInfoPane.tsx` — foto profilo 132px con badge Modifica (upload → POST /api/uploads/company-logo esistente, aggiorna anche companyAtom.logoUrl → avatar shell), campi inline-edit stile proto (Nome e cognome → updateProfile, Nome Autoscuola → updateCompanyName, Telefono → updateProfile esteso con `phone`; nuova action `getMyProfile`), email mascherata in sola lettura (cambio email = assistenza).
    - **Card Istruttori/Veicoli come proto**: `resource-card.tsx` riscritta (hairline #dddddd radius 14, nome 16/700, azioni = icone nude grigie, pill fasce navy #eef0f6/#cfcfdc, minuti 13/700, empty box #f8f8f8; niente banda gialla); card dashed «Invita istruttore»/«Nuovo veicolo» in coda al grid (asset proto in `public/images/settings/`); **ColorSwatchPicker mantenuto** (scelta colore istruttore non presente nel design ma da conservare); badge veicolo neutralizzati (Esclusivo/Pool navy pill, B·Manuale grigio).
    - `InlineToggle` attivo giallo → navy-900 (primitiva condivisa); bottone Salva fucsia in VehiclesTab → Button standard.

## Next steps

1. **Verifica utente fase 3 (Allievi) + fase 4 (Impostazioni)** — il dev DB ha 1 solo allievo, QA vero su staging clone.
2. **Fase 5 — Segretaria** (pagina voice: linea attiva card, script, orario, richiamate).
3. **Fase 6 — Minori**: Utenti (/admin/users restyle), Area personale (nuova), referral + Novità nel menu. (Ore guida già raggiungibile dall'overlay Impostazioni.)
4. **Post-redesign**: allineare colori blocchi sul MOBILE (WeeklyAgendaView getLessonLook + DayItinerary) — vedi memoria project_lesson_block_colors_unification.

Promemoria operativi: dev server è dell'utente (NO pnpm build con dev attivo); verificare con typecheck+lint+Playwright (login titolare@reglo.it/RegloTest2026!, aspettare hydration 3.5s prima del fill); commit su feat/airbnb-redesign, NIENTE staging/prod fino a fine progetto; proto renderizzabile con `python3 -m http.server 8899` in ~/Downloads/dashboard + Playwright.
