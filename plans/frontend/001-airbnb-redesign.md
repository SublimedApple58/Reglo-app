# Redesign web app in chiave Airbnb

**Branch:** `feat/airbnb-redesign` · **Avviato:** 2026-07-07 · **Stato:** fasi 0-4 FATTE e approvate (ultimo commit `331eac3`) — prossima: fase 5 Segretaria

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
    - **Refactor caricamento settings (fix "scatti" e loader ripetuti)**: (a) i 6 pane non sono più `dynamic()` ma import statici (il lazy chunk causava il flash bianco a ogni switch); (b) nuovo `KeepAlivePane` — ogni pane monta al primo accesso (o subito dopo il primo load, prop `eager`) e poi resta montato nascosto via CSS: le fetch interne (Payments/Stripe, LocationsSection, RegistrationMode, HoursDashboard, BusinessInfo) girano UNA volta; (c) dopo il primo load parte `mountAllPanes` → prefetch in background di tutte le sezioni → switch istantanei (~0ms, misurato); (d) skeleton globale solo con `!hasLoadedOnce` — i refetch post-azione non nascondono più il contenuto; (e) Lottie overlay globale rimosso; (f) scroll del content resettato a 0 al cambio pane (`goToPane`).

- Fase 5 Segretaria FATTA (in attesa di verifica utente):
  - `AutoscuoleVoicePage` RISCRITTA come nel proto `#section-segretaria` (route dedicata `/user/autoscuole/voice`, testid `autoscuole-voice-page`): PageHeader "Segretaria AI" + pill "Impostazioni" (gear, bordo hairline); **status bar** card (dot verde/ambra + "Linea attiva/in configurazione" + numero + badge stato pill); il **toggle Assistente vocale nella status bar salva SUBITO** (update parziale `{voiceAssistantEnabled}` — il merge server-side conserva gli altri campi; validazione client prima di attivare); help link navy → dialog VoiceSetupGuide (invariata); **griglia 1fr+288px**: card preview greeting (label uppercase, testo corsivo #444, conteggio 500, link Modifica → apre pannello su Comportamento; placeholder muted se nessun greeting) + card riepilogo (Orario attivo con `formatDaysSummary` per run contigui "Lun – Ven", Handoff, pill Azioni attive #eeeef4/navy); **Richiamate in sospeso** = card lista proto (header icona+titolo+badge count navy, bottone Aggiorna pill grigia, righe avatar tondo pieno hash-color con iniziali + nome + "• oggi/ieri HH:MM" + motivo ellipsis + bottoni "Fatto" pill grigia con spinner e **"Chiama"** pill nera `tel:`).
  - **Pannello "Impostazioni segretaria"**: riusa `DetailPanel` con override `w-[min(520px,92vw)]` + layout flex-col (header sticky con X, body scrollabile, footer "Salva configurazione" navy full-width); 3 accordion hairline #ebebeb (Comportamento e azioni / Orari e registrazione / Istruzioni personalizzate) con chip azioni (attive: bordo navy + bg #eeeef4), ToggleRow stile proto (riga attiva bg #eeeef4, toggle 44×26), day-chips pill nere, select orari Radix, input handoff, textarea greeting/regole/istruzioni bordo 1.5px focus #222. Salva → chiude pannello + toast. `InlineToggle` esteso con size `lg` (44×26 come proto).
  - NIENTE PERSO: empty state feature non attiva (restyled neutro), banner linea non pronta (giallo semantico), validazioni handleSave invariate, VoiceSetupGuide/CarrierBlock intatte, voiceAssistantVoice pass-through, callbacks mark-done. Novità: bottone Chiama (tel:), quick-info card, preview greeting.
  - **Fix `DetailPanel` (primitiva condivisa)**: con una Select/Dialog Radix aperta dentro il pannello, Escape chiudeva ANCHE il pannello. Ora il listener è in **capture phase** su window (gira prima del listener document di Radix, quando il layer è ancora nel DOM) e ignora l'Escape se esiste un layer aperto (`[data-radix-popper-content-wrapper], [role=listbox], [role=menu], [role=dialog][data-state=open]`). Vale anche per il panel Allievi.
  - Radius: in questo progetto `rounded-xl` = 18px (token custom) — per i 12px del proto usare `rounded-[12px]` espliciti (fatto su Salva, ToggleRow, chip, textarea).
  - e2e: nuovo test "segretaria: pagina e pannello impostazioni" in `autoscuole-smoke.spec.ts` (robusto: gestisce feature attiva o spenta). 3/3 smoke + 5/5 suite verdi in locale.
  - NOTA DEV: i settings passano da cache Redis TTL 5 min (`getCachedCompanyServiceLimits`) — scritture dirette al DB si vedono dopo ~5 min. Per il QA ho abilitato la voice su **Reglo E2E** in dev (feature+ready+numero+greeting demo); "Reglo srl" ripristinata com'era.

- Fase 5 APPROVATA dall'utente (2026-07-08).
- Fase 6a Utenti FATTA (in attesa di verifica utente):
  - `/admin/users` riscritta come proto `#section-users`: nuova `AdminUsersPage.tsx` (sostituisce AdminUsersToolbar + AdminUsersTable + UpdateUserForm, file RIMOSSI — UpdateUserForm era usato solo lì); route `page.tsx` ora usa `PageWrapper hideHero` (il ClientPageWrapper mostrava il breadcrumb legacy) e passa `role` searchParam.
  - Layout proto: PageHeader "Utenti" + "Sono registrati in autoscuola un totale di N utenti"; toolbar con **paginazione compatta ‹ 01 / N ›** (server-side via ?page=), **Filtri ruolo** dropdown (dot navy attivo + Rimuovi filtri, server-side via ?role=), icona **crea utente** (dialog esistente), **search icona→pillola** con Annulla (?query=), menu **"..."** con Invita utente / Invia notifica push / Reset push token (conferma AlertDialog al posto del window.confirm).
  - Righe hairline #f0f0f0 grid 1.3fr/1.6fr/150/100/100: avatar pieno hash-color, nome, email, pill Ruolo (navy per staff, grigia per Allievo), pill Attivo/Invitato, bottone Dettaglio radius 8. Empty state "Nessun risultato". Su schermi <lg l'email scende sotto il nome.
  - **Detail panel utente** (`user-detail-panel`, DetailPanel 520px, sostituisce il Drawer vaul): header centrato avatar+nome+email+pill; attivi = Anagrafica (Nome input, Email sola lettura, Ruolo select, Salva modifiche navy attivo solo se dirty) + Azioni (Invia notifica di prova blu, Elimina utente rosso con conferma); invitati = Reinvia invito / Annulla invito con conferma. Read-only per non-admin.
  - Backend: `getCompanyUsers` esteso con `role?` (filtro su autoscuolaRole, membri+inviti) e `total` esatto nel return (prima il conteggio era stimato `totalPages*PAGE_SIZE`).
  - NIENTE PERSO: crea/invita utente, broadcast push, reset token, test push per utente, edit nome+ruolo, delete, resend/cancel invito, ricerca server-side, paginazione. UNICA rimozione consapevole: le checkbox multi-selezione della vecchia tabella (erano puramente cosmetiche, nessuna azione bulk collegata).
  - e2e: nuovo test "utenti: lista, filtro ruoli e detail panel" in autoscuole-smoke. Suite 7 test: verde (vehicles.auth flake noto sotto carico parallelo, passa da solo).

- Fase 6a APPROVATA dall'utente (2026-07-08, "ok dai, ci sta").
- Fase 6b Menu hamburger FATTA (in attesa di verifica utente):
  - Nuove voci in ordine proto: **Ore guida** (`?tab=settings&pane=hours`), banner statico **"Inizia a guadagnare"** (asset proto in `public/images/menu/`), sezione **Novità** con timeline puntinata (Modulo veicoli · Gestione autonoma istruttori · Guide di gruppo, dot navy sull'ultima uscita).
  - **"Chiave di accesso" RIMOSSA dal menu su richiesta utente** — resta solo nella sezione Allievi (modal codici). "Pagamenti" ritirato dal menu (vive in Impostazioni). "Profilo" (/user/settings) TENUTO: ha ancora integrazioni/upload non migrati — candidato a futura migrazione dentro Impostazioni.
  - NUOVO `components/Layout/NovitaDialog.tsx`: modal changelog z-600 stile proto (640px, header Novità+X, entry con testi/date del proto — Robatto incluso; video guide-gruppo.mp4 compresso 19.7MB→490KB in `public/images/novita/`; CTA "Attiva le guide di gruppo" → pane Gestione allievi).
  - GOTCHA test Playwright: dopo il login la redirect è client-side → `userSessionAtom` resta null (SessionProvider rifetcha solo su hard navigation o window focus) → l'hamburger non c'è. Negli script fare sempre `page.goto()` dopo `waitForURL`. Quirk latente anche in reale ma mascherato dal refetch-on-focus.
- **Voci del menu proto ANCORA MANCANTI (da fare, richiesta utente 2026-07-08)**: **Area personale** (proto `#section-areapersonale` riga 1420: overlay tipo Impostazioni con Credenziali vault / Contratto e fattura / Abbonamento — NESSUN backend reale oggi: da decidere se mock o attendere backend), **Invia comunicato** (proto `#comunicato-modal` riga 1906 — possibile aggancio a sendBroadcastPush), **Centro assistenza** (proto `#section-assistenza` riga 1269 — DA MOCKARE per ora), **Lascia un feedback** (proto `#feedback-modal` riga 1957 — DA MOCKARE per ora).

- Fase 6b APPROVATA dall'utente ("ok avanti tutta"; ha chiesto lui di togliere Chiave di accesso dal menu).
- Fase 6c FATTA (in attesa di verifica utente) — menu hamburger ora completo come il proto (ordine: Area personale, Impostazioni, Utenti, Ore guida, Profilo, Invia comunicato, Centro assistenza, Lascia un feedback, banner guadagnare, Novità, Esci):
  - **Invia comunicato** (`components/Layout/ComunicatoDialog.tsx`, REALE): modal proto (campana bell-gold, destinatari select Tutti/Allievi/Istruttori/Titolari, titolo bold, messaggio, CTA gradient navy) collegata a `sendBroadcastPush`; esito "Comunicato inviato"; reset alla chiusura.
  - **Lascia un feedback** (`components/Layout/FeedbackDialog.tsx`, MOCK — non salva nulla): stelle 1-5 con label proto ("Non funziona"→"Funziona perfettamente"), tag Lentezza/Bug/Funzionalità mancante/Altro (rating 1-4), placeholder per rating; 3 esiti proto: 5★ richiesta video testimonial (WhatsApp wa.me/393477756855 + Carica video + "No, mi state antipatici!"), 4★ "Ci manca poco al massimo" (img feedback-mid), 1-3★ "Raccontaci cosa non ha funzionato" (img feedback-low + Contattaci WhatsApp).
  - **Centro assistenza** (`AutoscuoleAssistenzaPage` + route `/user/autoscuole/assistenza`, MOCK): overlay full-screen z-40 (header 72 logo+Fatto), grid 380+1fr — lista Messaggi (chip Tutti/Non letti statici, conversazione "Assistente Reglo" con avatar Giulia) + chat su #fafafa (benvenuto + contact cards Inviaci un messaggio→WhatsApp / Chiama→tel, quick replies, input pillola con invio): qualsiasi messaggio → typing dots → risposta canned "chat in anteprima" + contatti. Numero supporto: +39 347 775 6855 (dal proto).
  - **Area personale** (`AutoscuoleAreaPersonalePage` + route `/user/autoscuole/area-personale`): overlay stile Impostazioni con sidebar 400px (Credenziali/Contratto e fattura/Abbonamento). NESSUN backend esiste → scaffold del design con stati ONESTI: vault card con header blu "Vault sicuro" + "verrà attivato dal team Reglo" + disclaimer giallo custodia; contratto "sarà disponibile qui" + empty fatture; abbonamento card "Il tuo piano" informativa. Quando arriverà il backend si riempiono le pane (il proto completo con rivela/copia/share-link/breakdown è in `#section-areapersonale` riga 1420).
  - Asset in `public/images/menu/`: bell-gold, assistente-giulia, feedback-mid, feedback-low (da uploads/ del proto, ridimensionati).
  - e2e: nuovo smoke "area personale e centro assistenza". Suite 8/8 verde.

- Fase 7 Profilo → Impostazioni FATTA (in attesa di verifica utente) — la vecchia pagina Profilo (`/user/settings`, SettingsPage stile glass) è stata RITIRATA e migrata nell'overlay:
  - **Nuova pane "Integrazioni"** (`tabs/IntegrationsPane.tsx`, voce sidebar nel gruppo Fatturazione): card Fatture in Cloud stile proto (pill Connessa/Non collegata, Connetti→OAuth in nuova tab, Disconnetti, select Azienda FIC con fallback ID manuale — endpoint response shape `{success,data:[{value,label}],selectedId}`). Gestisce `?integrationSuccess/?integrationError` (toast + pulizia URL via `history.replaceState` — col router.replace la pulizia NON funzionava).
  - **BusinessInfoPane**: nuova riga "La tua foto" = avatar personale utente (upload `/api/uploads/avatar` + update sessione next-auth + userRefresh atom) — era l'unica funzione del vecchio tab Account non già coperta.
  - `/user/settings` ora è un **redirect server** a `?tab=settings&pane=business` (o `pane=integrations` se arrivano i param della callback OAuth: la callback usa il referer, ma /user/settings resta il fallback hardcoded del connect route).
  - Menu hamburger: voce "Profilo" RIMOSSA. `components/pages/Settings/` eliminata. Nota: sezioni legacy pratiche/scadenze/documents erano GIÀ dismesse (route notFound) — nessun restyle necessario.
  - Suite e2e 8/8 verde.

## Next steps

1. **⇒ PROSSIMO dopo verifica fase 7: fine redesign web** — poi QA su staging (serve portare il branch su staging, da concordare: ambiente condiviso) e rilascio. L'Area personale si riempie quando ci sarà il backend.
2. **Fine progetto**: QA completo su staging clone (dev DB ha 1 solo allievo), poi rilascio concordato.
3. **Post-redesign**: allineare colori blocchi sul MOBILE (WeeklyAgendaView getLessonLook + DayItinerary) — vedi memoria project_lesson_block_colors_unification. Possibile feature futura emersa: tab "Esami" allievi con esiti Promosso/Bocciato (richiede backend nuovo).

Promemoria operativi: dev server è dell'utente (NO pnpm build con dev attivo); verificare con typecheck+lint+Playwright (login titolare@reglo.it/RegloTest2026!, aspettare hydration 3.5s prima del fill); commit su feat/airbnb-redesign, NIENTE staging/prod fino a fine progetto; proto renderizzabile con `python3 -m http.server 8899` in ~/Downloads/dashboard + Playwright.
