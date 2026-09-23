# Account Consorzio

> Design: prototipo Consorzi.html di Gabriele Ruzzu (2026-09). Piano approvato in `plans/consorzio/001-account-consorzio.md`.

## Cos'è

Tipo di account per i **consorzi di autoscuole** (mezzi pesanti condivisi, patenti superiori C/CE/D/DE + C1/D1/CQC/ADR, più la BE): il consorzio ha la propria agenda/istruttori/veicoli/allievi e contabilizza le guide verso le **autoscuole consorziate**, che oggi sono record anagrafici gestiti dal consorzio (non account Reglo — quello è il futuro step "affiliate").

**Architettura**: il consorzio è una normale `Company` in "modalità consorzio" — `limits.accountKind = "consorzio"` sul servizio AUTOSCUOLE (stesso pattern di [secretary-only.md](secretary-only.md), mutuamente esclusivi). Tutta la macchina per-company (agenda, appuntamenti, veicoli, istruttori, disponibilità, festivi, notifiche) è riusata 1:1 senza modifiche.

## Modello dati (tutto additivo, migration `20260903144231_consorzio_models`)

| Modello | Ruolo |
|---------|-------|
| `ConsorzioSchool` | Autoscuola consorziata: anagrafica denormalizzata, `status` active/suspended/removed (mai hard delete), `joinedAt`, `linkedCompanyId?` = gancio per la fase "affiliata cliente Reglo" (oggi sempre null) |
| `ConsorzioAccountingCode` (+ join `ConsorzioMemberAccountingCode`, `ConsorzioAppointmentAccountingCode`) | Codici contabili liberi (es. CDC-GUIDE, FSE-2026): default sull'allievo, override esplicito per singola guida (regola: righe esplicite se presenti, altrimenti eredita i default allievo) |
| `ConsorzioSchool.accountingCodeId?` | **Codice contabile PROPRIO dell'autoscuola** (uno solo), migration `20260909101500_consorzio_school_accounting_code`. Si imposta nell'anagrafica scuola e si propaga a tutti i suoi allievi |
| `ConsorzioGuideRequest` | Richiesta guida di un'autoscuola: lifecycle pending → accepted/rejected/cancelled (modellato su SwapOffer); `appointmentId` + `movedToStartsAt` all'accettazione |
| `ConsorzioLessonBilling` | Contabilizzazione guida→scuola: `priceAmount` snapshot + `settledAt` (saldata) + `invoiceSentAt` (fattura inviata). SEPARATO da `AutoscuolaAppointment.priceAmount` (che è cablato ai pagamenti allievo/Stripe) |
| `CompanyMember.consorzioSchoolId?` | Gli allievi del consorzio sono normali member STUDENT taggati con la loro scuola |
| `AutoscuolaNotification.meta Json?` | Payload extra per i kind consorzio (`requestId`, `schoolName`, `vehicleName`) |

`bookingSource` nuovo valore: `consortium_request` (`lib/autoscuole/booking-source.ts`).

## Codice contabile dell'autoscuola

Ogni autoscuola consorziata ha **un** codice contabile (in produzione ~40 in tutto), inserito nell'anagrafica (dialog Aggiungi autoscuola e Modifica anagrafica, campo `accountingCode`, normalizzato in MAIUSCOLO). `syncSchoolAccountingCode` in `consorzio.actions.ts`: upsert del `ConsorzioAccountingCode` (creato al volo se nuovo) → aggiorna `ConsorzioSchool.accountingCodeId` → **stacca il vecchio codice-scuola da tutti i membri e aggancia il nuovo** (i codici messi a mano sul singolo allievo restano intatti). Gli allievi creati dopo lo ereditano in `createCompanyUser` (`lib/actions/user.actions.ts`).

In Fatturazione il vecchio pulsante "+" (dialog di gestione codici) è stato **sostituito da una ricerca per codice**: `ExpandingSearch` (lo stesso componente della sezione Allievi, `components/ui/expanding-search.tsx`); le chip mostrate sono max 12 quando non si cerca (con l'indicatore "+N — cerca per codice"), tutte quelle che matchano quando si cerca. `createConsorzioAccountingCode`/`archiveConsorzioAccountingCode` sono state rimosse: i codici ora nascono dall'anagrafica scuola.

## Filtro "Autoscuola" nei picker allievo dell'agenda

Gli allievi del consorzio sono tutti nella stessa company: con decine di consorziate la lista è lunga, quindi **sopra ogni picker allievo dell'agenda c'è un select "Autoscuola"** che accorcia la lista a quella scuola. `listDirectoryStudents` (`lib/actions/autoscuole.actions.ts`) espone `consorzioSchoolId` + `consorzioSchoolName`; in `AutoscuoleAgendaPage` il componente `SchoolFilterSelect` + `filterStudentsBySchool` sono applicati ai **tre** punti con selezione allievo: form *Nuovo appuntamento* (cambiare autoscuola azzera l'allievo se non è più in lista), dialog *Nuovo esame* e pannello di un *esame esistente* — uno stato per form, così i filtri non si condizionano.

Le opzioni sono ricavate dagli allievi stessi (nessuna fetch in più): compaiono le autoscuole che hanno almeno un allievo, più "Senza autoscuola" se qualche allievo non è taggato. Il select appare solo con `isConsortium` e più di una autoscuola → per le autoscuole normali non cambia nulla.

## Preavviso minimo richieste di guida

`limits.consorzioPricing.guideRequestMinLeadHours` (default **8 ore**, configurabile in Impostazioni → Prenotazioni e allievi → **Prezzi**, prima sezione "Richieste di guida": 0 = regola disattivata, 2/4/6/8/12/24/48). Regola pura e testata in `lib/consorzio/guide-request-lead.ts` (`guideRequestLeadTimeError`, unit test `tests/unit/consorzio/guide-request-lead.test.ts`).

Dove è applicata oggi: su ogni slot **scelto dal consorzio** — `proposeConsorzioGuideRequestSlot` ("Proponi un altro orario", che l'autoscuola deve confermare) e `acceptConsorzioGuideRequest` **solo se lo slot è stato spostato** rispetto a quello richiesto (accettare la richiesta così com'è non viene mai bloccato: il preavviso era già stato valutato all'invio). Il controllo sull'invio della richiesta va aggiunto nel path sender quando arriverà la fase affiliate: usare la stessa `guideRequestLeadTimeError`.

## Prezzi & Fatturazione — semantica prezzo

Listino in `limits.consorzioPricing`, parse e calcolo in **`lib/consorzio/pricing.ts`** (modulo puro, unit test `tests/unit/consorzio/pricing.test.ts`): `hourlyByCategory`, `billingModeByCategory`, `courseByCategory` + cancellazioni tardive cutoff/penale + `guideRequestMinLeadHours`. **Prezzo guida = durata/60 × tariffa** ("slot da 90 min = 1,5× tariffa").

**Criterio di fatturazione per patente (REG-462)** — segmented "A ore / Percorso" su ogni riga della tabella "Tariffe per patente":
- `hourly` (default): come sopra;
- `course`: **prezzo unico per il percorso completo** dell'allievo. Le guide di quella patente valgono 0 (in Fatturazione mostrano "Incluso") e il percorso è una **voce propria** (tag "Percorso", codici = default allievo, non editabili) nel mese della **prima guida** non annullata dell'allievo (esami/gruppi esclusi). Al primo toggle saldata/fatturata nasce `ConsorzioCourseBilling` (unique consorzio+allievo+patente) che **congela prezzo e mese** (migration `20260915190000_consorzio_course_billing`); da lì la voce resta in quel mese anche se il criterio cambia. Action: `setConsorzioCourseBillingFlags`.
- **Tariffa esame (REG-459)**: `consorzioPricing.examFee` (€ fisso per esame, uguale per tutte le patenti; sezione "Esami" nel pane Prezzi). In Fatturazione ogni appuntamento `type: "esame"` non annullato dell'allievo è una voce **"Esame"** (tag viola) a `examPrice`, con snapshot/toggle/codici come le guide (`ConsorzioLessonBilling` per appointmentId) — anche per le patenti a percorso (l'esame non è incluso nel prezzo unico). Il **drawer allievo** ha "Riepilogo costi" (guide / percorso / esami + totale, `ConsorzioStudentDetail.costs`) e la lista "Esami" con prezzo e Saldato/Da saldare.
- Le due cifre (oraria e percorso) restano salvate entrambe: cambiare criterio non perde l'altra. Il criterio si legge LIVE: guide già certificate col vecchio criterio tengono lo snapshot.

Il prezzo è **calcolato live in Fatturazione** finché la guida non viene certificata: al **primo toggle** saldata/fatturata nasce la riga `ConsorzioLessonBilling` con lo snapshot (congelato da lì in poi). Così i ritocchi tariffa si riflettono sulle guide non certificate e NESSUN punto di creazione appuntamento è stato toccato (zero rischio sul motore prenotazioni — scelta deliberata rispetto al piano iniziale "hook alla creazione").

"Ore certificate / da certificare" nel dettaglio scuola = minuti delle guide passate con/senza `settledAt`.

## Costo dell'assenza (REG-507)

Quanto costa all'autoscuola consorziata una guida che l'allievo **non ha fatto**.
Si configura in Impostazioni → Prenotazioni e allievi → **Prezzi**, sezione
"Cancellazioni tardive": un segmented **Percentuale / Importo fisso** (stessa
forma del criterio "A ore / Percorso") e, in modalità fissa, l'importo in €.
Entrambe le cifre restano salvate: cambiare criterio non perde l'altra.

- `lateCancellationMode` (`percent` default | `fixed`) e
  `lateCancellationFixedAmount` (default 20) in `limits.consorzioPricing`,
  normalizzati da `parseConsorzioPricing`.
- Calcolo in `absencePrice()` (`lib/consorzio/pricing.ts`, puro e testato).
  In modalità **fissa** l'importo vale anche per le patenti **a percorso** (la
  guida vale 0 perché è inclusa nel prezzo unico, ma il posto sprecato è un
  costo reale); in modalità **percentuale** una patente a percorso produce 0, che
  è la conseguenza onesta di quel criterio.
- Quali guide contano: `isBillableAbsence()` — **no-show sempre**, e
  `manual_cancel` **oltre il cutoff**. Restano fuori di proposito
  `operational_cancel`/`operational_reposition` (li decide la scuola: istruttore
  malato, mezzo fermo), `record_cleanup` (pulizia storico) e `permanent_cancel`.
  Cutoff a 0 = regola spenta.

> ⚠️ **Cosa faceva prima.** `lateCancellationCutoffHours` e
> `lateCancellationPenaltyPct` erano salvate e modificabili nel pane Prezzi ma
> **non le leggeva nessun calcolo**. La Fatturazione filtrava
> `status: { not: "cancelled" }`, quindi: un **no-show finiva in fattura a
> prezzo pieno** (una CE a 110 €/h) perché `no_show` non è `cancelled`, e un
> **annullamento tardivo non costava niente** perché spariva dal conto. Da qui
> la richiesta del consorzio: «20 € a prescindere dalla categoria».

La voce compare in Fatturazione come riga **"Assenza"** (tag ambra, "guida non
svolta") e nel drawer allievo come bucket **Assenze** nel Riepilogo costi, più
un badge sulla riga della guida. Le due schermate usano la stessa regola, così
non possono dire cifre diverse sullo stesso allievo.

## Fase percorso: patentati vs percorso in corso

La tabella allievi della **scheda autoscuola** distingue chi sta ancora
guidando da chi ha preso la patente: filtro **Tutti / In pratica / Patentati**
(`SegmentedPill` con contatori, sopra la tabella) e una colonna **Fase** per
ogni riga. La griglia passa da sei a sette colonne
(`1.6fr 84px 116px 1fr 110px 70px 1.2fr`): la fase sta per conto suo e non
appiccicata alla patente — primo giro le due pastiglie condividevano una cella
allargata, ed era esattamente il difetto che si vedeva.

> **Perché il filtro e il comando nascono insieme.** Il dato
> (`CompanyMember.studentPhase`) esisteva da sempre, ma il consorzio non aveva
> modo né di leggerlo né di impostarlo: in produzione tutti e 12 gli allievi
> erano `PRATICA` — il **default dello schema** — con `phaseClassifiedAt` nullo.
> Aggiungere solo i filtri avrebbe prodotto per sempre "In pratica 12 ·
> Patentati 0". Perciò il drawer allievo ha ora **Fase percorso** in Anagrafica,
> con "Modifica" che apre `ChangeStudentPhaseDialog` (lo stesso del dettaglio
> allievo delle autoscuole normali, riusato così com'è).

Su un account consorzio le fasi raggiungibili sono **due**: `PRATICA` e
`PATENTATO`. `updateStudentPhase` rifiuta `TEORIA` e `AWAITING` quando la fase
teoria non è attiva, e sul consorzio `phasesEnabled` non è impostato (fallback
`["PRATICA"]`). Per questo il filtro ha tre voci e non cinque: due pastiglie
che non possono popolarsi sono peggio di due assenti. Il valore non è cablato:
`getConsorzioStudentDetail` restituisce `phasesEnabled` leggendolo dai limits
con lo stesso fallback del server, così se un giorno la teoria venisse attivata
il dialogo la mostrerebbe da sé.

**Conseguenza fuori da questa pagina**: marcare un allievo `PATENTATO` azzera
`examReady` e lo toglie dal picker "Seleziona allievo" dell'app istruttore
(REG-499 mostra solo `PRATICA`). L'agenda web non filtra per fase, quindi il
titolare può comunque prenotargli una guida. È reversibile: basta riportarlo a
`PRATICA`.

Presentazione condivisa in `components/pages/Consorzio/student-phase.tsx`
(`StudentPhaseBadge` senza bordo per la tabella, `STUDENT_PHASE_PILL_TONE` per
la `Pill` bordata del drawer, `matchesPhaseFilter`). Il filtro "In pratica" è
definito come **non-PATENTATO**, non come `=== PRATICA`: una fase ereditata non
deve far sparire un allievo da entrambe le viste.

## Da quando vale un nuovo prezzo

Cambiando una tariffa nel pane Prezzi, il consorzio sceglie se il nuovo
prezzo vale **solo d'ora in poi** o **anche per le voci già passate**.
Prima veniva applicato al passato in automatico, senza chiedere.

> **Perché succedeva.** Il prezzo di una voce **non esiste** finché non nasce
> la sua riga di billing, al primo toggle saldata/fatturata: prima di allora la
> Fatturazione lo calcola live col listino corrente. Quindi un ritocco di
> tariffa non "ricalcola" il passato — lo **rivela**, perché quel passato non
> ha mai avuto un prezzo scritto. In produzione il consorzio ha **zero** righe
> di `ConsorzioLessonBilling`: 10 esami e 5 guide passate, tutti esposti.

**Come funziona**: `getConsorzioPricingChangeImpact` confronta listino vecchio e
nuovo (`lib/consorzio/pricing-change.ts`) e conta le voci passate senza riga di
billing. Se c'è qualcosa da chiedere si apre `PricingApplyDialog`; la risposta
arriva a `updateConsorzioPricing` come `applyTo`.

Con `applyTo: "future"` il listino **vecchio** viene congelato sulle voci
passate che non hanno ancora un prezzo — righe `ConsorzioLessonBilling` /
`ConsorzioCourseBilling` con `priceAmount` valorizzato e flag nulli, la stessa
forma che crea il toggle. Con `applyTo: "past"` non si fa nulla: è il
comportamento storico, ed è il default per chi chiama l'action senza scegliere.

**Cosa è una tariffa e cosa no.** Entrano tariffe orarie, prezzi percorso,
tariffa esame e **le penali** (un'assenza addebitata è una voce di costo), più
il *criterio* del costo assenza, che pur non essendo una cifra cambia il conto.
Restano fuori `lateCancellationCutoffHours` e `guideRequestMinLeadHours`: sono
regole — decidono *se* un'assenza è addebitabile e il preavviso delle richieste
— e non rideterminano l'importo di nulla.

**Le voci già saldate non cambiano mai**, in nessuno dei due casi: hanno già il
prezzo congelato.

> ⚠️ Il pane Prezzi **salva da solo** a ogni campo che perde il fuoco: non ha un
> bottone "Salva". Per questo la domanda si pone **una volta per visita**, alla
> prima modifica che toccherebbe il passato, e la risposta vale per le
> successive. Chiedere a ogni cifra ritoccata sarebbe un dialogo per campo.

## Categorie patente superiori (C1, C1E, D1, D1E, CQC, ADR)

Aggiunte alla lista canonica `LICENSE_CATEGORIES` (`lib/autoscuole/license.ts`), bucket `pro`, match veicolo **stretto** (self-match, nessuna gerarchia — mappa eligibilità CQC/ADR da confermare col consorzio). CQC/ADR sono qualificazioni modellate come pseudo-categorie (evita una seconda dimensione su member/veicoli/tariffe).

**Gating picker**: `licenseCategoriesForMode(consortium)` → consorzio = `CONSORTIUM_LICENSE_CATEGORIES` (BE, C, CE, D, DE, C1, D1, CQC, ADR — BE aggiunta con REG-456 con titoli/descrizioni in `CONSORTIUM_LICENSE_INFO`), autoscuole normali = `AUTOSCUOLA_LICENSE_CATEGORIES` (lista storica). Punto unico di verità UI: `LicenseCategorySelectItems.tsx` (usato da StudentsPage, ResourcesPage×2, VehiclesTab, EditStudentLicenseDialog, AdminUsersCreateDialog). Gli `z.enum(LICENSE_CATEGORIES)` server restano permissivi. Il mobile NON vede mai le categorie nuove (STUDENT_LICENSE_CATEGORIES invariata; allievi consorzio non invitati sull'app in fase 1).

## File

- **Modalità/guardie**: `lib/services.ts` (`accountKind`, `consorzioPricing`, `isConsortium`), `lib/service-access.ts` (`requireConsortium` — prima riga di ogni action consorzio), `BackofficeCompaniesPage.tsx` (checkbox "Consorzio" in Modalità app)
- **Shell**: `AutoscuoleNav.tsx` (`consortiumNavItems`: Agenda | Autoscuole `?tab=scuole` | Fatturazione `?tab=fatturazione` + icone `public/images/nav/autoscuole-3d.png`/`fatturazione-3d.png`), `AutoscuoleTabsPage.tsx` (tab nuove + redirect fuori-modalità). Hamburger INVARIATO (il prototipo lo tiene identico; la voce "Chiave di accesso" del prototipo non esiste ancora, fuori scope)
- **Actions**: `lib/actions/consorzio.actions.ts` (schools CRUD + stats, codici, pricing, fatturazione, guide request accept/reject), `lib/actions/user.actions.ts` (`createCompanyUser` esteso con `consorzioSchoolId` + `accountingCodeIds` + `phone`, ed email/password FACOLTATIVE per gli allievi di consorzio — vedi sotto)
- **Aggiungi allievo (REG-460 + REG-464)**: `components/pages/Consorzio/ConsorzioStudentCreateDialog.tsx`, dialog DEDICATO (non più `AdminUsersCreateDialog`, che è tornato al solo uso Directory/istruttori). Obbligatori **nome, cognome, telefono**; `Accesso all'app` (email + password) e `Codici contabili` sono sezioni COLLASSATE con riepilogo, e il corpo della modale scorre: l'altezza non dipende più da quanti codici ha il consorzio (era il bug REG-460). Senza email l'account nasce con **email segnaposto** `allievo+<uuid>@no-app.reglo.local` e `password = null` → non può accedere (auth web e mobile richiedono entrambe `user.password`); `lib/users/placeholder-email.ts` (`buildPlaceholderEmail`, `isPlaceholderEmail`, `displayEmail`) la nasconde in UI mostrando "—". Stesso precedente degli account anonimizzati (`deleted+<id>@deleted.reglo.local`). Il segnaposto NON genera invii: le uniche mail transazionali sono gli inviti company
- **UI**: `components/pages/Consorzio/` — `ConsorzioSchoolsPage`, `ConsorzioSchoolDetailPage` (route `autoscuole/scuole/[schoolId]`), `ConsorzioBillingPage`, `ConsorzioPrezziPane` (sub-tab "Prezzi" in `BookingsTab.tsx`, al posto di "Crediti e prezzi" che per il consorzio è nascosto). Stile 1:1 dal prototipo (computed styles estratti via Playwright); asset estratti dal prototipo: icone nav (`public/images/nav/autoscuole-3d.png`, `fatturazione-3d.png`) e sfera di cristallo del placeholder mesi futuri in Fatturazione (`public/images/3d/sfera-cristallo-3d.png`, copy "Non riusciamo ANCORA a vedere nel futuro"). Card richiesta = `GuideRequestCard.tsx`. **Drawer allievo** = `ConsorzioStudentDrawer.tsx` (click su riga allievo nel dettaglio scuola). **REG-465**: ha la stessa forma del dettaglio allievo delle autoscuole normali — `DetailPanel` condiviso (600px, backdrop, slide 220ms, Escape), header centrato con avatar 96 + nome + recapito + pill (autoscuola, categoria) e tab **Riepilogo / Guide / Costi** — costruito sui primitivi condivisi estratti da `AutoscuoleStudentsPage` in `components/pages/Autoscuole/student-detail-ui.tsx` (`Pill`, `StudentAvatar`, `blueLinkClass`, `sectionLabelClass`, `splitFullName`). Riepilogo = anagrafica (telefono modificabile inline via `updateStudentPhone`, percorso patente via `EditStudentLicenseDialog`, **fase percorso** via `ChangeStudentPhaseDialog` — entrambi già consorzio-aware) + **codici contabili** (vedi/aggiungi/rimuovi, la parte consorzio-only) + attività col consorzio; Guide = guide ed esami in un'unica lista con badge Certificata/Da certificare = `ConsorzioLessonBilling.settledAt`; Costi = riepilogo costi verso l'autoscuola. Backend `getConsorzioStudentDetail` (espone anche `email`/`phone`/`transmission`); `ConsorzioAccountingCode.description` aggiunto con migration `20260903195222`. Gotcha tema: `rounded-md/xl` in questa app valgono 12/18px (scala radius custom) — nelle superfici pixel-perfect usare SEMPRE radius espliciti
- **Richiesta guida (ricevente)**: `lib/autoscuole/notifications.ts` (`createConsortiumGuideRequestNotification`, kind `consortium_guide_request`), `OwnerNotificationsBell.tsx` (riga cliccabile → **primo click-through della campanella**: `?tab=agenda&guideRequestId=…`), `AutoscuoleAgendaPage.tsx` (stato `guideRequest`/`guideDraft`, ghost tratteggiato AMBRA "In attesa" nella colonna dell'istruttore scelto, card `CreateEventPopover` "Richiesta di guida" con picker istruttore obbligatorio + Accetta/Rifiuta; il click su un altro slot della griglia SPOSTA il draft, come gli altri flussi)
- **Seed dev**: `scripts/seed-consorzio-company.mjs` (consorzio@reglo.it / Reglo2026!, 2 istruttori CON account+membership — l'agenda mostra solo istruttori con `userId` —, 5 mezzi, 3 scuole, 6 allievi, tariffe, richiesta pending + notifica, guida demo)

## Accettazione richiesta

`acceptConsorzioGuideRequest({requestId, instructorId, startsAt})`: transazione pending→accepted + `AutoscuolaAppointment` (`type:"guida"`, `bookingSource:"consortium_request"`); **istruttore obbligatorio** (la card lo chiede: il prototipo non lo aveva ma l'agenda è a colonne-istruttore); conflitti su istruttore E veicolo → errore, richiesta resta pending; slot ≠ richiesto → `movedToStartsAt` (azione "Sposta"). La notifica di ritorno alla scuola è un no-op fino alla fase affiliate (oggi nessun sender: le richieste nascono solo dal seed).

## Secondo giro prototipo (2026-09-07, 4 fix di fedeltà)

1. **Notifiche con esito**: all'accetta/rifiuta la notifica "Richiesta guida" in campanella DIVENTA "Guida accettata"/"Guida rifiutata" (`resolveConsortiumGuideRequestNotification` in `lib/autoscuole/notifications.ts`: update per `meta.requestId`, kind → `consortium_guide_accepted|rejected`, marcata letta perché è un'azione del titolare, `startsAt` riallineato allo slot accettato). `OwnerNotificationsBell` renderizza i 2 kind con cerchio verde `#E4F4E7`/check `#1F6B2A` e rosso `#FDECEC`/X `#B3494F` (colori 1:1 dal prototipo) e ora RIFETCHA all'apertura del popover (senza, l'esito comparirebbe solo al poll dei 25s).
2. **Impostazioni → "Fatturazione e pagamenti"** (SOLO consorzio): voce in coda al primo gruppo della sidebar (`CONSORZIO_BILLING_PANE` in `AutoscuoleResourcesPage`, icona `CardProtoIcon`), pane `ConsorzioFatturazionePane` = placeholder 1:1 dal prototipo ma col partner cambiato da TeamSystem a **Fatture in Cloud** su decisione di Tiziano (logo ufficiale `public/images/brand/fatture-in-cloud.png`, favicon 196px dal sito FIC).
3. **Agenda "Visualizza per: Istruttori / Veicoli"** (SOLO consorzio): toggle in cima al popover Visualizzazione (pref `columnsBy` persistita in `reglo-agenda-view-prefs`), explainer dinamico ("Le colonne dell'agenda diventano i mezzi/gli istruttori del consorzio."). In modalità Veicoli le colonne (settimana E giorno) sono i mezzi con chip camion nell'header; i blocchi cadono nella colonna del LORO veicolo. **Convenzione id colonna `veh:<id>` / `veh:__none__`**: ghost, slot-menu (`slotMenu.colKey`), click e drag distinguono dal prefisso; colonna "Senza mezzo" solo se esistono blocchi/draft senza veicolo; bande disponibilità e blocchi istruttore non hanno colonna in questa vista (per natura sono per-istruttore). Il ghost della richiesta si ancora al veicolo del draft.
4. **"Sposta" = dialog "Proponi un altro orario"** (`ProposeSlotDialog`, 1:1 dal prototipo: card flottante 480px senza overlay, Giorno/Orario, chips Durata, select "Veicolo del consorzio" con "Da assegnare", Annulla/Proponi orario). I campi editano il `guideDraft` → il ghost tratteggiato si aggiorna LIVE; "Proponi orario" chiama `proposeConsorzioGuideRequestSlot` (campi `proposed*` su `ConsorzioGuideRequest`, migration `20260907161125_consorzio_guide_request_proposal`, additiva): la richiesta RESTA `pending` (il consorzio può ancora accettare/rifiutare; la conferma dell'autoscuola arriva con la fase affiliate — notifica scuola no-op). `acceptConsorzioGuideRequest` ora accetta anche `durationMinutes`/`vehicleId` del draft (slot/durata/mezzo scelti nel dialog valgono anche per l'accettazione diretta). Al deep-link, il draft riparte dalla proposta già inviata.

Reset dati demo per QA/e2e: `scripts/reset-consorzio-demo.mjs` (cancella guide da richiesta, richieste e notifiche consorzio) + reseed `scripts/seed-consorzio-company.mjs`.

## Scope fase 1 / deviazioni note dal prototipo

- **Colonne agenda di DEFAULT per istruttore**: il refactor columnsBy è fatto (punto 3 sopra) ma il default resta "Istruttori" (il prototipo apre in Veicoli; cambiare il default è un ritocco a una riga se Tiziano lo vuole). Le richieste pending NON sono renderizzate come blocchi statici in agenda: vivono via campanella → card+ghost.
- Fatturazione = solo tracking (niente generazione fattura/FIC), penali tardive = solo setting (si attivano col flusso affiliate).
- Guide fatturabili = non annullate del mese (esclusi esami e guide di gruppo).
- Sender richieste, conferma della proposta di slot lato scuola, seconda agenda dell'affiliata, account demo upsell → fase affiliate (`linkedCompanyId` e campi `proposed*` già pronti).
