# Piano — Account Consorzio (Reglo)

## Context

I consorzi di autoscuole italiani possiedono i mezzi pesanti (patenti superiori C/CE/D/DE + C1/D1/CQC/ADR) e li mettono a disposizione delle autoscuole associate, fatturando loro le guide superiori. Reglo aggiunge un **tipo di account "consorzio"**: stessa identica struttura della web app autoscuole (agenda, comandi, impostazioni riusati 1:1), con tre superfici nuove — **Autoscuole**, **Fatturazione**, **Impostazioni → Prenotazioni e allievi → Prezzi** — più il flusso **"Richiesta guida"** (notifica → ghost-blocco in agenda → Accetta/Rifiuta/Sposta). Design approvato di Gabriele Ruzzu (`~/Desktop/Consorzi.html`, studiato via Playwright). Oggi si costruisce SOLO l'account consorzio; le due modalità delle affiliate (cliente Reglo / demo upsell) vengono dopo, ma il modello dati non deve precluderle.

## Cosa dice il prototipo (spec fedele)

- **Shell** identica a Reglo autoscuole; nav = `Agenda | Autoscuole | Fatturazione`; campanella + hamburger invariati.
- **Agenda** identica (banner del designer: comandi "identici, non li ho ridisegnati"). Vista settimana con **sotto-colonne per veicolo** (5 mezzi pesanti). Blocchi-richiesta con stati IN ATTESA (tratteggiato ambra) / CONFERMATA (verde) / RIFIUTATA (rosso) / ANNULLATA, con allievo · autoscuola · orario · mezzo.
- **Richiesta guida**: notifica in campanella (kind visti: "Richiesta guida", "Guida accettata", "Guida rifiutata" — allievo · autoscuola · data/ora). Click → agenda con ghost tratteggiato sullo slot + card flottante "Richiesta di guida" (Quando/Autoscuola/Veicolo/Allievo; CTA **Accetta**, link **Rifiuta**/**Sposta**; copy: "spostalo se serve, poi accetta o rifiuta").
- **Autoscuole**: tabella affiliate (nome+città, titolare, n° allievi, ultima guida, mezzo più usato, stato) + cerca + "Aggiungi autoscuola". Dettaglio: anagrafica (titolare, sede, P.IVA, tel, email, nel consorzio da) con Modifica; stat card (allievi attivi / guide col consorzio / **ore certificate** / **da certificare**); Sospendi / Rimuovi dal consorzio; tabella Allievi (patente, istruttore del consorzio, ultima guida, n° guide, **codici contabili** chip) + "Aggiungi allievo".
- **Fatturazione**: navigatore mese; totali Totale/Saldato/Da incassare; cerca autoscuola; filtro chip per **codice contabile** (etichette libere del consorzio: CDC-GUIDE, FSE-2026, AZ-LOGIST, CQC-RINN, PRIV…); legenda Saldata/Fattura inviata; gruppi per autoscuola espandibili in righe-guida (data, allievo, badge patente DE/D/C1/CQC/D1…, durata · istruttore · veicolo, chip codici 0–2, prezzo, 2 toggle per riga: saldata / fattura inviata).
- **Prezzi** (nuovo sub-tab in Prenotazioni e allievi dopo Generali/Limiti/Guide/App allievi): (a) Cancellazioni tardive — cutoff ("48 ore prima della guida") + penale ("100% del prezzo della guida"); (b) **Tariffa oraria per patente** €/ora per C, CE, D, DE, C1, D1, CQC, ADR; prezzo guida = durata/60 × tariffa (verificato sui numeri del prototipo: 90 min DE = 135 = 1,5×90).
- Il resto delle Impostazioni: "è uguale a Reglo autoscuole qui".

## Architettura

**Consorzio = `Company` in "modalità consorzio"**, NON un nuovo `ServiceKey`. Stesso precedente di `secretaryOnly` (verificato: flag in `ServiceLimits` + helper `isSecretaryOnly` in `lib/services.ts:103-158` + gating in `AutoscuoleNav.tsx:37`): un flag `accountKind: "consorzio"` nei `limits` del servizio AUTOSCUOLE rimodella nav/shell/impostazioni, mentre agenda, appuntamenti, veicoli, istruttori, disponibilità, festivi e notifiche riusano la macchina per-company **1:1 senza modifiche**. Gli allievi del consorzio sono normali `CompanyMember` STUDENT della company consorzio, taggati con la loro autoscuola. Le affiliate sono record (`ConsorzioSchool`) con `linkedCompanyId` opzionale → hook già pronto per la fase "affiliata cliente Reglo".

## Fasi

### Fase 1 — Modello dati + modalità consorzio (fondamenta, rilasciabile come account vuoto)

**Prisma (`prisma/schema.prisma`) — tutto additivo, zero rischio per le autoscuole esistenti:**
- `ConsorzioSchool`: consorzioCompanyId, anagrafica denormalizzata (name, city, ownerName, address, vatNumber, phone, email), status (`active|suspended|removed`), joinedAt, `linkedCompanyId?` (hook fase affiliate).
- `ConsorzioAccountingCode` (etichette codici contabili, archiviabili) + join M:N verso `CompanyMember` (default dell'allievo) e verso `AutoscuolaAppointment` (copiati alla creazione guida, poi editabili — il prototipo mostra 0–2 chip per guida).
- `ConsorzioGuideRequest`: schoolId, studentUserId, requestedStartsAt, durationMinutes, vehicleId?, status (`pending|accepted|rejected|cancelled`), appointmentId?, movedToStartsAt?, respondedAt/By — lifecycle modellato su `AutoscuolaSwapOffer`/`respondSwapOffer` (`lib/actions/autoscuole-swap.actions.ts`).
- `ConsorzioLessonBilling`: appointmentId @unique, schoolId, priceAmount (snapshot alla creazione = durata/60 × tariffa), settledAt? (saldata), invoiceSentAt? (fattura inviata). **Modello separato, NON campi su `AutoscuolaAppointment`**: priceAmount/paymentStatus dell'appuntamento sono cablati ai pagamenti allievo/Stripe e non vanno sovraccaricati.
- `CompanyMember` += `consorzioSchoolId?`; `AutoscuolaNotification` += `meta Json?` (requestId, schoolName, vehicleName); `bookingSource` += valore `consortium_request` (`lib/autoscuole/booking-source.ts`, è una stringa, no enum).

**ServiceLimits + guardie:**
- `lib/services.ts`: `accountKind?: "consorzio"`, `consorzioPricing?: { hourlyByCategory, lateCancellationCutoffHours (default 48), lateCancellationPenaltyPct (default 100) }`, helper `isConsortium()`.
- Nuova guardia `requireConsortium()` (in `lib/service-access.ts` o `lib/consorzio/guards.ts`): prima riga di ogni action/route consorzio.
- Attivazione da **backoffice** come secretary-only: opzione "Consorzio" in `BackofficeCompaniesPage.tsx` via `updateCompanyService`; mutuamente esclusiva con `secretaryOnly`. Seed dev `scripts/seed-consorzio-company.mjs` (modellato su `seed-secretary-only-company.mjs`).

**Gating UI (pattern secretary-only, atomi idratati server-side → no flash):**
- `AutoscuoleNav.tsx`: se consorzio → Agenda | Autoscuole (`?tab=scuole`) | Fatturazione (`?tab=fatturazione`) + 2 icone 3D nuove.
- `AutoscuoleTabsPage.tsx`: registra i 2 tab nuovi, redirige via i tab solo-autoscuola (allievi/segretaria/rinnovi).
- `AutoscuoleShell.tsx`: hamburger senza voci solo-autoscuola (Ore guida, comunicati…).

**Categorie patente nuove (C1, D1, CQC, ADR — decisione raccomandata):** estendere la lista canonica in `lib/autoscuole/license.ts` (`LICENSE_CATEGORIES` += C1, C1E, D1, D1E, CQC, ADR; label/descrizioni; bucket `pro`), NON creare una tassonomia parallela. CQC/ADR sono qualificazioni ma modellarle come pseudo-categorie evita una seconda dimensione su member/veicoli/tariffe/badge. Picker: nuova `CONSORTIUM_LICENSE_CATEGORIES` per i picker del consorzio; i picker delle autoscuole normali e del mobile restano filtrati alla lista attuale (nessuna sorpresa su reglo-mobile in fase 1). La moto-logic è a whitelist → le nuove categorie sono "non-moto" in sicurezza.

**Docs:** `docs/features/consorzio.md` nuovo + update `INDEX.md` e `impact-map.md`.

### Fase 2 — Sezione Autoscuole

- `lib/actions/consorzio.actions.ts`: listConsorzioSchools (con stats calcolate: allievi via `consorzioSchoolId`, ultima guida e mezzo più usato via appuntamenti), create/update/suspend/remove (transizioni di stato, no hard delete), CRUD codici contabili, assegnazione codici ad allievo.
- Componenti nuovi in `components/pages/Consorzio/`: `ConsorzioSchoolsPage.tsx` (tabella+cerca+Aggiungi) e `ConsorzioSchoolDetailPage.tsx` (anagrafica, stat card — "ore certificate" = somma durate con settledAt, "da certificare" = senza; allievi; Sospendi/Rimuovi).
- Routing: `?tab=scuole` + dettaglio `app/[locale]/user/(autoscuole)/autoscuole/scuole/[schoolId]/page.tsx`.
- "Aggiungi allievo": riusa l'action di creazione allievo esistente (`lib/actions/autoscuole.actions.ts`) estesa con `consorzioSchoolId`, patente da `CONSORTIUM_LICENSE_CATEGORIES`, codici default.

### Fase 3 — Prezzi + Fatturazione

- **Prezzi**: sub-tab consorzio-only in `BookingsTab.tsx` (cancellazioni tardive + tariffa oraria per categoria, copy "90 minuti = 1,5× tariffa"); persiste `limits.consorzioPricing` via la stessa via delle altre impostazioni. Pane visibili in `AutoscuoleResourcesPage.tsx` filtrati come secretary-only (nasconde Segretaria; il resto invariato).
- **Snapshot prezzo**: hook nella creazione appuntamento (per company consorzio) → upsert `ConsorzioLessonBilling` con prezzo = durata/60 × tariffa della categoria dell'allievo. Modifica durata ricalcola solo se non ancora saldata/fatturata (prezzo congelato dopo).
- **Fatturazione**: `ConsorzioBillingPage.tsx` (`?tab=fatturazione`): navigatore mese, aggregazione server per autoscuola, totali, cerca, chip-filtro codici, righe-guida espandibili, 2 toggle per riga → action che setta/unsetta `settledAt`/`invoiceSentAt`. **Solo tracking, nessuna generazione fattura** (Fatture in Cloud = fase successiva; l'integrazione FIC esistente in `lib/integrations/fatture-in-cloud.ts` è viva e riusabile allora).

### Fase 4 — Flusso "Richiesta guida" (lato ricevente)

- Kind notifica `consortium_guide_request` (+ riservati `consortium_guide_accepted/rejected` per il lato autoscuola, fase 5) creati via `lib/autoscuole/notifications.ts` con `meta`.
- **Click-through campanella** (primo in assoluto): `OwnerNotificationsBell.tsx` — riga cliccabile → mark read + `router.push(...?tab=agenda&guideRequestId=<id>)`; la route `owner-notifications` ritorna `meta`. Attenzione a non rompere polling 25s/read-marking dei kind esistenti.
- **Agenda** (`AutoscuoleAgendaPage.tsx`): il bootstrap (`getAutoscuolaAgendaBootstrapAction`, già con override `{companyId}`) include le richieste pending se consorzio; render come blocchi tratteggiati ambra IN ATTESA (accettata = appuntamento normale; rifiutata/annullata solo nello storico notifiche). Con `guideRequestId`: naviga alla settimana giusta, ghost sullo slot + card `GuideRequestCard.tsx` clonata dal pattern approvato `CreateEventPopover.tsx` (portal non-modale trascinabile, ancorata a lato colonna).
- **Azioni** (`consorzio.actions.ts`, su modello `respondSwapOffer`): `acceptGuideRequest` (pending→accepted, crea `AutoscuolaAppointment` con `bookingSource: "consortium_request"`, snapshot billing, hook notifica-scuola no-op in fase 1), `rejectGuideRequest`, idempotenza + conflitto slot (slot occupato → errore, resta pending). **Sposta** = solo client pre-accettazione: la card entra in move-mode, click su altro slot ricolloca il ghost (riusa `slotMenu`/`renderSlotGhost`), Accetta persiste `movedToStartsAt` e crea lì l'appuntamento.
- **Sender stub fase 1**: nessuna autoscuola può ancora inviare → path di creazione dev/seed (script o action backoffice nascosta) per demo end-to-end.

### Fase 5 (fuori scope oggi — solo predisposizione)
Affiliate cliente Reglo (`linkedCompanyId`, seconda agenda, invio richieste, notifiche di ritorno), account demo upsell, fatturazione automatica FIC. Niente nelle fasi 1–4 le preclude.

## Domande aperte / ambiguità (da decidere prima o durante — con raccomandazione)

1. **Colonne agenda per VEICOLO**: il prototipo mostra sotto-colonne per veicolo; l'agenda reale ha colonne per ISTRUTTORE (il refactor "columnsBy: instructor|vehicle" dentro il componente da 5.8k righe è delicato). ➜ Raccomando fase 1 con colonne istruttore + filtro veicolo esistente, refactor per-veicolo come follow-up. Da validare con Gabriele/Tiziano.
2. **Istruttore all'accettazione**: la card richiesta non ha il campo istruttore, ma la guida in agenda ne richiede uno (colonne per istruttore). ➜ Raccomando picker istruttore obbligatorio nella card all'Accetta (o auto-assegnazione dal pool del veicolo).
3. **Eligibilità veicoli per CQC/ADR/C1**: quali veicoli servono un allievo CQC/ADR/C1/D1? (es. CQC → C/CE/D/DE? C1 su camion C?) ➜ default prudente: match stretto, mappa da confermare col consorzio.
4. **Cosa è fatturabile**: solo guide completate o tutte le non-annullate del mese? Le cancellazioni tardive generano una riga penale in Fatturazione? ➜ Raccomando: non-annullate passate + tardive a penale %.
5. **Allievi consorzio su mobile**: come CompanyMember STUDENT potrebbero tecnicamente usare l'app allievo. ➜ Raccomando in fase 1 di NON invitarli (membri staff-created senza accesso app).
6. **"Aggiungi autoscuola" / "Aggiungi allievo"**: dialog non implementati nel prototipo — campi minimi da definire in corso (anagrafica del dettaglio fa da spec).
7. **Chi crea l'account consorzio**: assunto backoffice Reglo (come secretary-only). Confermare.
8. **Naming interno**: il consorzio vive sotto route `/user/autoscuole` con un tab chiamato "Autoscuole" — confusione solo interna, invisibile all'utente. Accettato (rinominare le route sarebbe un refactor enorme).

## Verifica

- **Typecheck + lint** su ogni fase (mai `pnpm build` con dev attivo).
- **Seed consorzio** (`seed-consorzio-company.mjs`) su DB dev: consorzio + 5 mezzi pesanti + 2 istruttori + 3 autoscuole + allievi con codici + tariffe.
- **E2E Playwright su localhost** (tecnica consolidata: next dev + login titolare): (1) shell a 3 tab e assenza voci autoscuola; (2) agenda funzionante (creazione guida normale su allievo consorzio); (3) CRUD autoscuole + allievo con codici; (4) Prezzi: salva tariffe → crea guida → prezzo in Fatturazione = durata/60 × tariffa; toggle saldata/fatturata aggiornano i totali; (5) richiesta seed → notifica → click → ghost + card → Sposta su altro slot → Accetta → appuntamento in agenda + riga billing.
- **Regressione autoscuole normali**: login su autoscuola dev esistente → nav/impostazioni/agenda invariati (flag assente).
- Rilascio col flusso standard staging → QA → main (feature branch dedicato, lavoro grosso multi-fase).
