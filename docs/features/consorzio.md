# Account Consorzio

> Design: prototipo Consorzi.html di Gabriele Ruzzu (2026-09). Piano approvato in `plans/consorzio/001-account-consorzio.md`.

## Cos'è

Tipo di account per i **consorzi di autoscuole** (mezzi pesanti condivisi, patenti superiori C/CE/D/DE + C1/D1/CQC/ADR): il consorzio ha la propria agenda/istruttori/veicoli/allievi e contabilizza le guide verso le **autoscuole consorziate**, che oggi sono record anagrafici gestiti dal consorzio (non account Reglo — quello è il futuro step "affiliate").

**Architettura**: il consorzio è una normale `Company` in "modalità consorzio" — `limits.accountKind = "consorzio"` sul servizio AUTOSCUOLE (stesso pattern di [secretary-only.md](secretary-only.md), mutuamente esclusivi). Tutta la macchina per-company (agenda, appuntamenti, veicoli, istruttori, disponibilità, festivi, notifiche) è riusata 1:1 senza modifiche.

## Modello dati (tutto additivo, migration `20260903144231_consorzio_models`)

| Modello | Ruolo |
|---------|-------|
| `ConsorzioSchool` | Autoscuola consorziata: anagrafica denormalizzata, `status` active/suspended/removed (mai hard delete), `joinedAt`, `linkedCompanyId?` = gancio per la fase "affiliata cliente Reglo" (oggi sempre null) |
| `ConsorzioAccountingCode` (+ join `ConsorzioMemberAccountingCode`, `ConsorzioAppointmentAccountingCode`) | Codici contabili liberi (es. CDC-GUIDE, FSE-2026): default sull'allievo, override esplicito per singola guida (regola: righe esplicite se presenti, altrimenti eredita i default allievo) |
| `ConsorzioGuideRequest` | Richiesta guida di un'autoscuola: lifecycle pending → accepted/rejected/cancelled (modellato su SwapOffer); `appointmentId` + `movedToStartsAt` all'accettazione |
| `ConsorzioLessonBilling` | Contabilizzazione guida→scuola: `priceAmount` snapshot + `settledAt` (saldata) + `invoiceSentAt` (fattura inviata). SEPARATO da `AutoscuolaAppointment.priceAmount` (che è cablato ai pagamenti allievo/Stripe) |
| `CompanyMember.consorzioSchoolId?` | Gli allievi del consorzio sono normali member STUDENT taggati con la loro scuola |
| `AutoscuolaNotification.meta Json?` | Payload extra per i kind consorzio (`requestId`, `schoolName`, `vehicleName`) |

`bookingSource` nuovo valore: `consortium_request` (`lib/autoscuole/booking-source.ts`).

## Prezzi & Fatturazione — semantica prezzo

Tariffa oraria per categoria in `limits.consorzioPricing` (`hourlyByCategory` + cancellazioni tardive cutoff/penale). **Prezzo guida = durata/60 × tariffa** ("slot da 90 min = 1,5× tariffa").

Il prezzo è **calcolato live in Fatturazione** finché la guida non viene certificata: al **primo toggle** saldata/fatturata nasce la riga `ConsorzioLessonBilling` con lo snapshot (congelato da lì in poi). Così i ritocchi tariffa si riflettono sulle guide non certificate e NESSUN punto di creazione appuntamento è stato toccato (zero rischio sul motore prenotazioni — scelta deliberata rispetto al piano iniziale "hook alla creazione").

"Ore certificate / da certificare" nel dettaglio scuola = minuti delle guide passate con/senza `settledAt`.

## Categorie patente superiori (C1, C1E, D1, D1E, CQC, ADR)

Aggiunte alla lista canonica `LICENSE_CATEGORIES` (`lib/autoscuole/license.ts`), bucket `pro`, match veicolo **stretto** (self-match, nessuna gerarchia — mappa eligibilità CQC/ADR da confermare col consorzio). CQC/ADR sono qualificazioni modellate come pseudo-categorie (evita una seconda dimensione su member/veicoli/tariffe).

**Gating picker**: `licenseCategoriesForMode(consortium)` → consorzio = `CONSORTIUM_LICENSE_CATEGORIES` (C, CE, D, DE, C1, D1, CQC, ADR con titoli/descrizioni in `CONSORTIUM_LICENSE_INFO`), autoscuole normali = `AUTOSCUOLA_LICENSE_CATEGORIES` (lista storica). Punto unico di verità UI: `LicenseCategorySelectItems.tsx` (usato da StudentsPage, ResourcesPage×2, VehiclesTab, EditStudentLicenseDialog, AdminUsersCreateDialog). Gli `z.enum(LICENSE_CATEGORIES)` server restano permissivi. Il mobile NON vede mai le categorie nuove (STUDENT_LICENSE_CATEGORIES invariata; allievi consorzio non invitati sull'app in fase 1).

## File

- **Modalità/guardie**: `lib/services.ts` (`accountKind`, `consorzioPricing`, `isConsortium`), `lib/service-access.ts` (`requireConsortium` — prima riga di ogni action consorzio), `BackofficeCompaniesPage.tsx` (checkbox "Consorzio" in Modalità app)
- **Shell**: `AutoscuoleNav.tsx` (`consortiumNavItems`: Agenda | Autoscuole `?tab=scuole` | Fatturazione `?tab=fatturazione` + icone `public/images/nav/autoscuole-3d.png`/`fatturazione-3d.png`), `AutoscuoleTabsPage.tsx` (tab nuove + redirect fuori-modalità). Hamburger INVARIATO (il prototipo lo tiene identico; la voce "Chiave di accesso" del prototipo non esiste ancora, fuori scope)
- **Actions**: `lib/actions/consorzio.actions.ts` (schools CRUD + stats, codici, pricing, fatturazione, guide request accept/reject), `lib/actions/user.actions.ts` (`createCompanyUser` esteso con `consorzioSchoolId` + `accountingCodeIds`)
- **UI**: `components/pages/Consorzio/` — `ConsorzioSchoolsPage`, `ConsorzioSchoolDetailPage` (route `autoscuole/scuole/[schoolId]`), `ConsorzioBillingPage`, `ConsorzioPrezziPane` (sub-tab "Prezzi" in `BookingsTab.tsx`, al posto di "Crediti e prezzi" che per il consorzio è nascosto). Stile 1:1 dal prototipo (computed styles estratti via Playwright); asset estratti dal prototipo: icone nav (`public/images/nav/autoscuole-3d.png`, `fatturazione-3d.png`) e sfera di cristallo del placeholder mesi futuri in Fatturazione (`public/images/3d/sfera-cristallo-3d.png`, copy "Non riusciamo ANCORA a vedere nel futuro"). Card richiesta = `GuideRequestCard.tsx`
- **Richiesta guida (ricevente)**: `lib/autoscuole/notifications.ts` (`createConsortiumGuideRequestNotification`, kind `consortium_guide_request`), `OwnerNotificationsBell.tsx` (riga cliccabile → **primo click-through della campanella**: `?tab=agenda&guideRequestId=…`), `AutoscuoleAgendaPage.tsx` (stato `guideRequest`/`guideDraft`, ghost tratteggiato AMBRA "In attesa" nella colonna dell'istruttore scelto, card `CreateEventPopover` "Richiesta di guida" con picker istruttore obbligatorio + Accetta/Rifiuta; il click su un altro slot della griglia SPOSTA il draft, come gli altri flussi)
- **Seed dev**: `scripts/seed-consorzio-company.mjs` (consorzio@reglo.it / Reglo2026!, 2 istruttori CON account+membership — l'agenda mostra solo istruttori con `userId` —, 5 mezzi, 3 scuole, 6 allievi, tariffe, richiesta pending + notifica, guida demo)

## Accettazione richiesta

`acceptConsorzioGuideRequest({requestId, instructorId, startsAt})`: transazione pending→accepted + `AutoscuolaAppointment` (`type:"guida"`, `bookingSource:"consortium_request"`); **istruttore obbligatorio** (la card lo chiede: il prototipo non lo aveva ma l'agenda è a colonne-istruttore); conflitti su istruttore E veicolo → errore, richiesta resta pending; slot ≠ richiesto → `movedToStartsAt` (azione "Sposta"). La notifica di ritorno alla scuola è un no-op fino alla fase affiliate (oggi nessun sender: le richieste nascono solo dal seed).

## Scope fase 1 / deviazioni note dal prototipo

- **Colonne agenda per ISTRUTTORE** (non per veicolo come nel prototipo): decisione approvata, refactor "columnsBy: vehicle" = follow-up. Le richieste pending NON sono renderizzate come blocchi statici in agenda (senza istruttore non hanno colonna): vivono via campanella → card+ghost.
- Fatturazione = solo tracking (niente generazione fattura/FIC), penali tardive = solo setting (si attivano col flusso affiliate).
- Guide fatturabili = non annullate del mese (esclusi esami e guide di gruppo).
- Sender richieste, seconda agenda dell'affiliata, account demo upsell → fase affiliate (`linkedCompanyId` già pronto).
