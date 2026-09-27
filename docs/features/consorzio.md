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

## Autoscuole consorziate come Company Reglo (REG-454)

Una consorziata non è più solo un'anagrafica: diventa una **Company Reglo**
registrata, contata fra le autoscuole, col servizio AUTOSCUOLE **spento**
finché non compra Reglo. Gli stati sono tre, e vanno tenuti distinti perché
sono assi indipendenti:

| Stato | `CompanyService.status` | `limits.affiliateOf` | Cosa vede il titolare |
|---|---|---|---|
| Autoscuola cliente | ACTIVE | assente | tutto, come sempre |
| Consorziata **con** Reglo | ACTIVE | presente | tutto + agenda consorzio (REG-429) |
| Consorziata **senza** Reglo | DISABLED | presente | vista ridotta (REG-429) |
| Registrata da sola | DISABLED | assente | cartello "Servizio non attivo", invariato |

**Doppia scrittura, voluta.** `ConsorzioSchool.linkedCompanyId` è l'autorità;
`limits.affiliateOf` (id del consorzio) è la copia che il percorso di **lettura**
consulta senza una query cross-company a ogni render — i limits stanno già in
cache Redis (segmento SETTINGS). Le due cose si scrivono nella stessa
transazione (`linkConsorzioSchoolToCompany`, `createAffiliateCompanyForSchool`,
`unlinkConsorzioSchool`) e invalidano la cache di **entrambe** le company.
`requireAffiliateSchool` (`lib/service-access.ts`) non si fida del flag:
rilegge `ConsorzioSchool` e restituisce lo `schoolId`, perché ogni query a valle
deve restare filtrata su quella scuola. Non richiede il servizio attivo — è il
senso della vista ridotta.

Attenzione a `isServiceActive(..., fallbackActive = true)`: una company **senza**
riga di servizio risulta attiva. Per questo ogni percorso che crea una
consorziata crea sempre anche la riga, `DISABLED`.

### Inviti al titolare

Ogni consorziata deve poter entrare nella sua autoscuola anche senza Reglo
acquistato. L'accesso nasce per **invito**: il titolare riceve un link, sceglie
lui la password, entra. Il consorzio non vede e non imposta password.

Gli inviti partono **sia dal backoffice sia dall'account consorzio**
(`inviteAffiliateOwnerFromBackoffice` / `inviteAffiliateOwnerFromConsorzio`,
stessa funzione interna). Stati per scuola: `not_linked` · `not_invited` ·
`invited` · `expired` · `active`, calcolati una volta sola in
`readAffiliateSchoolRows` e mostrati identici nelle due viste.

> **Perché un invito vale per più sedi.** In produzione 37 consorziate hanno
> **24 email distinte**: `amministrazione@autoscuola2go.it` copre cinque sedi
> ODOS. `User.email` è unique, quindi "un account per scuola" non esiste — esiste
> **un titolare con più sedi**, cioè un utente con più membership (lo switcher
> "Le tue sedi" c'era già). Invitare una sede prepara l'invito per tutte le sedi
> di quel titolare in quel consorzio e manda **una sola** mail;
> `attachSiblingAffiliateInvites` (`lib/consorzio/affiliate-invites.ts`) crea le
> altre membership al momento dell'accettazione, agganciata ai tre percorsi di
> accept esistenti e **solo** per inviti verso company con `affiliateOf`.

"Copia link" esiste perché le mail si perdono (e su staging gli invii esterni
sono no-op): il link è lo stesso token, si manda su WhatsApp. "Invita tutte le
non invitate" mostra l'anteprima raggruppata per email e richiede una conferma
esplicita — sono mail vere verso clienti veri.

### Dove

| Scope | File |
|---|---|
| Helper + guardia | `lib/services.ts` (`affiliateConsorzioId`, `isConsorzioAffiliate`, `isAffiliateWithoutReglo`), `lib/service-access.ts` (`requireAffiliateSchool`) |
| Azioni | `lib/actions/consorzio-affiliate.actions.ts` (collega/crea/scollega/inviti/bulk), `lib/consorzio/affiliate-invites.ts` |
| Nome Company | `lib/consorzio/affiliate-name.ts` — Title Case dall'anagrafica in MAIUSCOLO (`ODOS S.CROCE` → `Odos S.Croce`); un nome già curato non si tocca |
| Backoffice | `app/[locale]/backoffice/consorzi/[companyId]/page.tsx`, `BackofficeConsorzioDetailPage.tsx`, `AffiliateLinkDialog.tsx`, `AffiliateBulkInviteDialog.tsx`; la riga di un consorzio in `BackofficeCompaniesPage` ora **naviga** invece di aprire il drawer (vedi sotto) |
| Account consorzio | `ConsorzioSchoolsPage` (colonne Accesso e Stato + filtro + invito massivo), `SchoolAccessCard.tsx`, `school-access.tsx` (badge e filtro condivisi) |
| Backfill | `scripts/backfill-consorzio-affiliates.ts` (`--dry-run`, idempotente, **mai** su prod senza ok) |

**Nessuna migrazione**: `linkedCompanyId` e il suo indice esistevano già, il
resto vive nei `limits` JSON.

### Le due colonne di stato, che non dicono la stessa cosa

Nella sezione **Autoscuole** dell'account consorzio ogni scuola ha due
colonne, e vanno tenute distinte:

| Colonna | Risponde a | Valori |
|---|---|---|
| **Accesso** | il titolare riesce a entrare? | Non collegata · Da invitare · Invitata · Invito scaduto · Accede |
| **Stato** | la scuola ha Reglo acceso? | Sospesa · Reglo attivo · Reglo non attivo |

Si può essere l'una senza l'altra (un titolare che accede a una vista ridotta
"Accede" + "Reglo non attivo"), ed è il motivo per cui restano due colonne.

"Stato" mostrava `ConsorzioSchool.status`, che è `active` per tutte: segnava
**"Attiva" anche a chi Reglo non ce l'ha**, quindi non diceva niente. Ora usa
`regloActive`, che `readAffiliateSchoolRows` calcolava già e la pagina
caricava già nella mappa `access` — nessuna query nuova, solo la verità al
posto di un'etichetta vuota.

> ⚠️ **"Sospesa" va tenuta.** È l'unico stato dell'anagrafica che qualcuno
> imposta davvero (dal dettaglio scuola, `ConsorzioSchoolDetailPage`), e ha la
> precedenza sul resto: se sparisse da qui non si vedrebbe più in lista.

### La lista del backoffice non si fa inondare

`BackofficeCompaniesPage` **nasconde le consorziate** dalla lista generale: un
solo consorzio ne porta decine, e mescolate alle autoscuole clienti rendono la
lista inservibile. La via normale per vederle è entrare nel consorzio.

Il filtro è **solo di presentazione**: `getBackofficeCompanies` continua a
leggere tutte le company, e la riga si riconosce client-side con
`affiliateConsorzioId(company.services)` — i `limits` arrivano già al client
(è lo stesso meccanismo con cui la pagina riconosce un consorzio). Nessuna
query è stata toccata.

> ⚠️ **Perché c'è l'interruttore "Mostra anche le consorziate" e non basta
> nasconderle.** Cinque azioni si fanno **solo** da questa lista — linea
> vocale, Piano, Documenti, "accedi come titolare", elimina — e il dettaglio
> consorzio non le ha (lì si accende/spegne Reglo, si scollega e si invita).
> Nasconderle e basta avrebbe tolto quelle cinque possibilità su una
> consorziata con Reglo attivo. Se un giorno quelle azioni finiranno nel
> dettaglio consorzio, l'interruttore potrà sparire.

I contatori in cima (Autoscuole, Allievi su app, Linee vocali) seguono le
**righe visibili**, così i numeri e la tabella dicono la stessa cosa; accanto
al titolo un "+N consorziate" in grigio ricorda cosa resta fuori.

**La riga di un consorzio dice che si apre**: badge `Consorzio`, sfondo appena
diverso, bottone "Apri scheda ›". Prima era identica a tutte le altre — era
cliccabile, ma nessuno lo immaginava. Il drawer resta raggiungibile con
"Gestisci": è lì che vive la checkbox **Consorzio** di Modalità app, e
toglierla dalla portata sarebbe stato un danno.

### La vista ridotta (REG-429, Fase 6)

Una consorziata **senza** Reglo non vede più il cartello "Servizio non attivo":
entra nella **stessa shell di sempre** — quattro tab, stesse icone, campanella,
menu identico — e cambia solo che le funzioni non comprate sono bloccate. È la
lettura del prototipo di Ruzzu: la vista ridotta **aggiunge lucchetti**, non
toglie struttura.

| Dove | Bloccato | Aperto |
|---|---|---|
| Menu hamburger | Utenti · Ore guida · Invia comunicato · Lascia un feedback · **Chiave di accesso** | Area personale · Impostazioni account · Centro assistenza · Esci |
| Impostazioni | tutte le pane tranne due: si **aprono** e mostrano il loro cartello | Informazioni aziendali · **Istruttori** (lista navigabile, vedi sotto) |
| Sezioni | Segretaria · Ore guida | **Agenda** in scope Consorzio (Fase 7) · **Allievi** (vedi sotto) · Rinnovi (teaser esistente) |

**I dialoghi non sono ricostruzioni.** Ogni voce bloccata, al passaggio del
mouse, apre il pannello del prototipo con la **sua** anteprima: le tre foto
degli utenti, le tre dell'ore guida, la foto della notifica push, il collage
delle recensioni, l'illustrazione della chiave. Sono state estratte dal bundle
aprendo il prototipo e salvando ciò che disegna davvero
(`public/images/locked/`); lo stesso vale per i due SVG delle card di sezione,
copiati carattere per carattere. Se servono ritocchi si riestraggono, non si
ridisegnano a occhio.

"Chiave di accesso" esiste **solo** in questa vista: la funzione nell'app non
c'è ancora, nel prototipo è una voce bloccata, e Tiziano ha chiesto di tenerla
come teaser.

**Dietro le card delle sezioni bloccate non c'è il bianco.** C'è la sezione
piena e **sfocata**: per l'agenda è la griglia vera alimentata da
`locked/demo-agenda.ts` (dati statici e locali — nessuna chiamata al server,
nessun dato di altre autoscuole, durate scelte su tutta la scala per mostrare
la tavolozza), per la Segretaria le chiamate in sospeso. `LockedBackdrop`
accetta anche un `header` che resta **nitido e usabile** sopra la sfocatura: da
scope "Autoscuola" la toolbar sotto è inerte, e senza il segmented lì sopra da
quella vista non si tornerebbe più indietro. Rinnovi resta il teaser esistente,
che è già pieno.

**Le sezioni bloccate delle Impostazioni si aprono.** Come nel prototipo: il
titolo e la barra delle sotto-tab restano **nitidi**, il contenuto vero della
sezione sta sotto a `blur(3px) / opacity .55 / altezza tagliata a 620px`, e
sopra — `position:absolute inset-0` — c'è il cartello della funzione
(`components/pages/Autoscuole/locked/LockedSettingsPane.tsx`). Nessuna action
server viene chiamata: il contenuto vero non si monta, al suo posto c'è il
fondale finto di `locked/demo-settings.tsx`, che riproduce **i campi veri di
quella scheda** — mai barre grigie.

I cartelli sono **dodici**, non uno ripetuto: ognuno ha il suo contenuto e la
sua mini-anteprima dentro il cartello.

| Sezione | Cartelli |
|---|---|
| Prenotazioni e allievi | 5 sotto-tab: Generali ("Prenotazioni in autonomia") · Limiti ("Limiti di prenotazione") · Guide ("Scambi tra allievi") · App allievi · Crediti e prezzi |
| Segretaria | 4 sotto-tab: Linea ("Linea telefonica") · Comportamento ed azioni · Orari e registrazioni · Istruzioni |
| Policy tipi guida | uno (cartello a **400px**, non 420) |
| Promemoria e notifiche | uno, col mockup della notifica push |
| Veicoli | "I tuoi veicoli" |
| Sede e luoghi | **nessuno**: è lo stato vuoto con le due illustrazioni |
| Istruttori | vedi sotto: lista aperta + dettaglio a quattro schede |
| Pagellino · Aspetto | fuori dal prototipo: stessa forma, senza anteprima |

⚠️ **Nessun cartello delle Impostazioni ha lucchetto o badge "Funzione extra di
Reglo".** Nel prototipo quella stringa compare **solo** nei popup
dell'hamburger. Vale anche per le sezioni che il prototipo non copre: lì manca
l'anteprima, non la forma.

⚠️ **Il primario dei CTA è `#1a1a2e`** (hover `#2a2a44`), non il nero della
palette dell'app: nel prototipo è così in 34 occorrenze su 35. È
un'**eccezione voluta** dentro le viste bloccate, decisa da Tiziano: la
costante `NAVY` in `LockedSettingsPane.tsx` è il punto unico da cui cambiarla.
I pulsanti funzionali (il dialog "Richiesta di guida") restano sulla palette
dell'app.

⚠️ **I pannelli portano `line-height: normal`.** L'app eredita 1.5 sul
contenitore; il prototipo non impone interlinea. Senza quella riga i cartelli
crescono di ~11px e gli a-capo cadono altrove. Il font invece è già lo stesso
(Figtree, stessa catena di fallback).

**Allievi non è una pagina a parte: è `AutoscuoleStudentsPage`** con il flag
`affiliate`. Stesso layout, stessi filtri, stessa tabella, stesso drawer, stesso
dialogo di creazione — cambia **da dove arrivano gli allievi** e cosa resta
disponibile. Il primo tentativo era una pagina nuova scritta da zero ed è stato
bocciato: la vista ridotta aggiunge lucchetti, non reinventa schermate. Sopra
la pagina (sfocata, come nel prototipo) sta la card con il CTA **"Prova"**, che
la scopre.

In modalità `affiliate` non si montano progressi, pagellino, crediti, quiz,
blocchi prenotazione, azioni di massa e assegnazione istruttore: **non
falliscono, proprio non partono**. La scheda allievo si ferma al Riepilogo
(anagrafica, telefono modificabile). Gli allievi **non nascono nella company
della scuola**: nascono in quella del CONSORZIO, taggati con
`consorzioSchoolId`, dove il consorzio li vede e dove la richiesta di guida
andrà a cercarli.

`lib/actions/affiliate.actions.ts` è la **lista bianca**, tutta dietro
`requireAffiliateSchool` e filtrata sulla scuola del chiamante: anagrafiche
(`listAffiliateStudents`, `createAffiliateStudent`,
`updateAffiliateStudentPhone`) e richieste di guida (Fase 7, sotto). Tutto il
resto dell'app resta chiuso da `requireServiceAccess`.

> **Nessun toast `SERVICE_NOT_ACTIVE`, mai.** Le fetch partivano prima che si
> sapesse di che company si tratta: con `services` a null `isServiceActive`
> risponde "attivo" (fallback voluto), quindi la pagina si montava in modalità
> normale e chiamava tutto. Ora si aspetta la company, nella vista ridotta
> quelle fetch non partono, e `useFeedbackToast` silenzia comunque quel codice
> (finisce in `console.debug`): è una guardia, non un guasto, e in faccia
> all'utente non ci va.

> ⚠️ **Il controllo sta nei wrapper, non dentro i componenti.** In Segretaria e
> Ore guida il primo tentativo metteva il `return` della card prima delle
> decine di hook del componente: regola degli hook violata e **build di Vercel
> in errore** (due deploy falliti, staging rimasto indietro senza accorgersene).
> `tsc` e `next lint --file` non lo vedono: **`pnpm lint` sull'intero progetto
> sì**, ed è quello che gira in build.

### Istruttori: lista aperta, dettaglio a quattro schede (REG-429)

Istruttori **non è un cartello secco**. Nel prototipo la lista resta aperta e
cliccabile, e dentro il dettaglio dell'istruttore ci sono quattro sotto-tab,
ognuna col **suo** cartello
(`components/pages/Autoscuole/locked/LockedInstructors.tsx`):

| Scheda | Cartello |
|---|---|
| Disponibilità | "Disponibilità di \<nome\>" — chip GIORNI (Lun–Ven accesi) e FASCE ORARIE 08:00→13:00 / 14:30→19:00 |
| Malattia | centrato, illustrazione 96px, "Malattie gestite in un click!", ombra più bassa (`0 8px 32px`) |
| Ferie | "Ferie di agosto" a **400px**, badge calendario, tre righe "Approva" col puntatore del mouse sulla seconda |
| Gestione autonoma | badge "In 1 minuto" + riquadro video. **Nessun CTA**: nel prototipo questa scheda finisce col video |

**Il play porta al video vero.** Nel prototipo il riquadro era muto: cliccarlo
non faceva niente. Ora è un link a `VIDEO_ISTRUTTORI_URL`
(`locked/locked-features.tsx`) = `https://www.reglo.it/istruttori#video-autonoma`,
cioè la sezione del sito col video di presentazione — stesso titolo della card,
"Come funziona la modalità autonoma per gli istruttori?".

> ⚠️ **L'ancora vive in un altro repo.** `#video-autonoma` **non è un id**
> della pagina: la landing (`~/Developer/reglo-landing`) è una SPA senza id
> sulle sezioni, che sono marcate con `data-screen-label`. L'hash lo risolve
> `src/site/deepLink.ts`, agganciato in `RoutedSite.tsx` — il livello scritto
> a mano, perché `src/site/generated/` viene rigenerato da
> `tools/port-logic.mjs` e non si tocca. Se quel gestore sparisse il link non
> si rompe: atterra in cima alla pagina giusta. Per aggiungere un'altra
> ancora si aggiunge una riga a `HASH_TARGETS`, non un id.

La costante sta in `locked-features.tsx` e non nel componente perché oggi il
riquadro video è **uno solo** in tutte le viste bloccate: il prossimo deve
nascere già linkato senza doverselo ricordare.

Aprendo il dettaglio il **titolo della pane sparisce** (il nome dell'istruttore
fa già da titolo): `LockedSettingsPane` accetta `onDetailOpenChange` e la shell
riusa lo stesso `instructorsDetailOpen` della sezione vera.

> ⚠️ **Perché me l'ero persa al primo giro.** Nel sorgente del prototipo
> `#istr-detail-view` è un **div vuoto**: lo riempie a runtime
> `_paintInstrManage`. Leggendo l'HTML sembra che il dettaglio non esista.
> È la ragione per cui il prototipo va **aperto**, non letto.

### Toolbar dell'agenda bloccata (REG-429)

Nello scope Autoscuola gli strumenti della toolbar restano al loro posto,
grigi, e **ognuno apre il suo pannello**
(`components/pages/Autoscuole/locked/LockedToolbarTip.tsx`, acceso da
`AgendaSource.toolbarLocked`): titolo, spiegazione, una mini-illustrazione
diversa per ognuno e in fondo lucchetto + "Funzione extra di Reglo" +
"Attiva Reglo" (qui il lucchetto **c'è**, a differenza delle Impostazioni).

Il prototipo ne ha cinque — `legenda`, `viz`, `full`, `stampa`, `filtri`
(struttura `agTipKey` nel bundle). **Zoom e ricerca non esistono là**: lo zoom
non c'è e la ricerca funziona davvero. Le due voci in più sono scritte da noi
sullo stesso stampo, marcate `fuoriPrototipo`, e si tolgono cancellando due
chiavi.

⚠️ **L'agenda in scope Consorzio non è toccata**: `toolbarLocked` è acceso solo
sulla sorgente demo. Lì la toolbar serve davvero e resta viva — verificato a
ogni giro.

### Il metodo, dopo tre giri bocciati

Il prototipo standalone **si apre in un browser e si ispeziona schermata per
schermata**, non si legge nel sorgente. Le pagine sono `div` con stile inline e
molte nascono `display:none` (`#section-*`, `#config-tab-*`, `#pa-group-*`,
`#seg-group-*`): si forzano a `block` una alla volta con
`setProperty(...,"important")` e si fotografano. Poi stessa inquadratura sulla
nostra app e **montaggio affiancato prototipo | nostro** per ogni vista, prima
di dire che è finito.

Leggendo solo il sorgente sono passate due volte cose sbagliate pur avendo i
testi giusti: avatar e icone mancanti, interruttori disegnati come pallini,
sotto-tab non viste. Il confronto affiancato rende impossibile autoingannarsi —
e a volte dimostra che il difetto è **nostro** e non del prototipo: i chip
"Modalità di invio" andavano a capo da noi, non là.

Due asset del prototipo **non sono dentro il file standalone** e lì si vedono
rotti: `img3/malattia-icon.png` (ritrovata nel bundle e riestratta) e le tre
foto delle ferie `sa3/1|2|3.png` (sostituite con tre volti dello stesso
bundle — quella di "Martina Giorgi" è maschile, Tiziano la lascia così).

### Richieste di guida al consorzio (REG-429, Fase 7)

L'**Agenda in scope Consorzio** è l'unica sezione operativa della vista ridotta
(solo web, **solo titolare**). Il segmented `Consorzio | Autoscuola` c'è come
nel prototipo: lo scope "Autoscuola" — la sua agenda — è la funzione non
comprata.

> **È l'agenda, non una sua copia.** `AutoscuoleAgendaPage` accetta una
> **`AgendaSource`**: `fetchBootstrap` (da dove arrivano i dati, al posto di
> `/api/autoscuole/agenda/bootstrap`), `readOnly` (niente pannello d'azione
> sulle card, niente creazione dagli slot), `onCardClick` e `menu` (voci del
> "+" e del menu-slot, comprese quelle bloccate col lucchetto).
> `locked/AffiliateAgendaPage.tsx` è un involucro sottile che mappa richieste e
> slot occupati in `AppointmentRow[]`. Il primo giro aveva una griglia
> riscritta a mano ed è stata **bocciata**: stessi contenuti, ma etichette
> troncate, blocchi di un'altra taglia, toolbar diversa. Chi domani aggiunge
> una vista dell'agenda parta da `AgendaSource`.

Sulla griglia — quella vera: colonne giorno × istruttore, intestazioni, badge
di oggi, card, colori, hover, toolbar — compaiono due cose:

- le **proprie richieste**, nei quattro stati. Gli stati stanno in
  `getStatusMeta` accanto a tutti gli altri (`consortium_pending` ambra
  tratteggiato — la stessa lingua del ghost che l'agenda già usa per una
  richiesta —, `consortium_rejected`, `consortium_cancelled`), e una accettata
  usa lo stato `scheduled`, quindi prende il colore per durata come una guida
  qualunque. Una controproposta si legge sul blocco e il click apre il dialogo;
- gli **slot occupati** dal consorzio (`consortium_busy`, grigio rigato):
  **nessun nome e nessun tipo**, solo l'orario. `getAffiliateAgenda` seleziona
  tre campi dell'appuntamento — inizio, fine, istruttore — e nient'altro.
  Sapere *quando* il consorzio è pieno serve a non chiedere l'impossibile;
  sapere *chi* c'è dentro è affare del consorzio e delle altre consorziate.

Il menu "+" ha **solo "Richieste"**: appuntamento, esame, evento bloccante,
guida di gruppo e "segna festivo" restano lì col lucchetto.

Il dialogo di invio (giorno, orario, durata 30/45/60/90/120, allievo, veicolo
del consorzio) applica **`guideRequestMinLeadHours`** con lo stesso helper che
il consorzio usa quando sposta o propone uno slot: la regola è una sola e vale
per chi lo slot lo sceglie. L'allievo si può **creare al volo** dal dialogo —
nasce nel consorzio taggato con la scuola, senza credenziali (REG-464).
All'invio la richiesta nasce `pending` e arriva nella **campanella del
consorzio**; annullarla finché è in attesa cancella anche quella riga, perché
non c'è più niente da gestire.

**La scheda allievo modifica fase e percorso patente.** Senza, la pastiglia
"Foglio rosa" restava lì a vita. `setAffiliateStudentPhase` e
`setAffiliateStudentLicense` stanno nella lista bianca, dietro
`requireAffiliateOwner` e filtrate su `schoolId`; i dialoghi sono quelli veri
(`ChangeStudentPhaseDialog`, `EditStudentLicenseDialog`), che hanno preso un
`save` opzionale. Le fasi raggiungibili sono quelle del **consorzio** — Foglio
rosa e Patentato — perché TEORIA vorrebbe una sua licenza quiz.

> **Confine fra tenant.** Queste action leggono e scrivono nella company del
> **consorzio**, non in quella di chi chiama: sono le prime della piattaforma a
> farlo. Per questo ognuna passa da `requireAffiliateOwner` →
> `requireAffiliateSchool`, che **rilegge `ConsorzioSchool`** e pretende
> `linkedCompanyId === membership.companyId`, e ogni query resta filtrata su
> `schoolId`. Il flag `limits.affiliateOf` è una cache di lettura: da solo non
> autorizza niente.

### La consorziata che Reglo ce l'ha (Fase 8)

Non cambia niente di quello che già fa: stessa agenda, stessi allievi, stesse
impostazioni. In più, accanto alla navigazione data dell'agenda, compare il
segmented **`Consorzio | Autoscuola`** del prototipo. "Autoscuola" è la sua
agenda vera (`AutoscuoleAgendaPage`, prop `consorzioScope`), "Consorzio" è la
vista delle richieste (`AffiliateAgendaPage` con scope controllato da fuori):
sono due componenti diversi, quindi lo stato dello scope vive in
`AutoscuoleTabsPage`. Il segmented lo vede solo il **titolare**.

Le action delle richieste funzionano identiche nei due casi:
`requireAffiliateSchool` **non** richiede il servizio attivo — è voluto, ed è
quello che rende la Fase 8 quasi gratis.

### La risposta torna all'autoscuola (Fase 9)

Accettazione, rifiuto e controproposta del consorzio finiscono nella
**campanella della scuola** (`notifyAffiliateOfGuideResponse`, destinatario
`ConsorzioSchool.linkedCompanyId`; scuola non collegata = no-op, non errore).
Sono gli stessi `kind` della campanella del consorzio — le righe sono
per-company — più `consortium_guide_proposed`, cliccabile: porta all'agenda
sulla richiesta giusta, spostandosi di settimana se serve
(`getAffiliateAgenda({ focusRequestId })`).

Sulla controproposta l'autoscuola risponde con
`respondToAffiliateProposedSlot`:

- **accetta** → la richiesta si sposta sull'orario proposto e **resta
  `pending`**. L'appuntamento lo crea il consorzio: la proposta non contiene un
  istruttore, e sceglierlo qui vorrebbe dire indovinare. Il consorzio se la
  ritrova in campanella sullo slot che ha proposto lui;
- **rifiuta** → i campi `proposed*` si azzerano e resta la richiesta originale.

Le decisioni di dettaglio prese senza prototipo stanno in
[reg-429-decisioni-notturne.md](reg-429-decisioni-notturne.md).

### KPI

`companyKindOf` ha un quarto valore, `consorziata`. Le consorziate **senza**
Reglo attivo restano nel totale registrate (`companiesTotal`) e hanno un
contatore proprio (`affiliateInactiveCompanies`), ma escono dalla classifica
autoscuole e da ogni media per-autoscuola: 37 righe a zero guide
seppellirebbero le scuole vere e abbasserebbero ogni rapporto senza dire niente
di vero (decisione di Tiziano, 25/09).

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
