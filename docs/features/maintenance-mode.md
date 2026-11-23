# Modalità manutenzione dell'account (REG-773)

Il titolare può mettere **subito** in manutenzione tutto l'account della sua
autoscuola. **Nessun dato si perde**: si blocca solo l'accesso (UI e API) e si
fermano gli invii verso le persone. Lo **sblocco** si fa **solo dal backoffice**
interno, mai dal titolare.

> Mobile: `reglo-mobile/docs/features/maintenance-mode.md`.

## Ambiti

Si sceglie all'attivazione. Dopo, solo il backoffice può cambiarlo.

| Ruolo | `OWNER_ONLY` (solo titolare) | `EVERYONE` (tutti) |
|---|---|---|
| OWNER, INSTRUCTOR_OWNER | bloccato (web + mobile) | bloccato |
| INSTRUCTOR | normale | bloccato |
| STUDENT | normale | bloccato |
| Backoffice in impersonazione | bloccato come il titolare | bloccato |

Il blocco vale solo per quell'autoscuola: chi è membro di un'altra può passare
all'altra.

**Backoffice in impersonazione** («Accedi come titolare»): dal 2026-11-23
(decisione di Tiziano) non c'è più eccezione. L'operatore entra come il
titolare, quindi è bloccato in entrambi gli ambiti e vede la schermata di
manutenzione. Lì il pulsante in alto è **«Termina impersonazione»**
(`endImpersonation` in `lib/actions/user.actions.ts`), non «Esci»: chiude la
sessione NextAuth e riporta a `/[locale]/backoffice`, che ha un cookie suo e
quindi non chiede di rifare il login. Gestione e sblocco restano nel
backoffice (sezione Manutenzione in «Gestisci»).

## Dati

- `Company.maintenanceScope` (`CompanyMaintenanceScope?`, null = account
  attivo) e `Company.maintenanceSince`.
- `CompanyMaintenanceEvent`: registro di chi attiva / cambia ambito / sblocca
  (`action`: `activate` | `change_scope` | `unlock`; `actorKind`: `owner` |
  `backoffice`; attore come snapshot id + etichetta).
- Migrazione `20261123140000_company_maintenance_mode` (solo additiva).

## Come funziona il blocco

- **Un punto solo**: `getActiveCompanyContext` (`lib/company-context.ts`) lancia
  `COMPANY_MAINTENANCE` se il ruolo del membro rientra nell'ambito. Ci passano
  tutte le server action e le route (web e mobile Bearer), quindi il blocco vale
  per **UI e API** ed è **immediato**: la company si legge dal DB a ogni
  richiesta, senza cache.
- Restano aperti (usano `getActiveCompanyContextUnchecked` o non passano dal
  contesto): login, logout, `GET /api/mobile/me`, disattivazione del token push,
  app-config.
- Le risposte bloccate hanno `message: "COMPANY_MAINTENANCE"` (status 400 come
  ogni altro errore delle route). Il web reindirizza a `/[locale]/manutenzione`
  (`lib/auth-guard.ts`); il mobile legge `maintenance { scope, since, blocked }`
  da login e `/me` (`describeMemberMaintenance`) e mostra la sua schermata.
- **Ingressi pubblici** chiusi con `EVERYONE` (`isEntryClosedByMaintenance`):
  iscrizione con codice (anche QR istruttore `/i/`), inviti web e mobile, Aula
  live (join e risposte). Con `OWNER_ONLY` restano aperti, tranne gli inviti
  da titolare.

## Invii e job

| Cosa | `OWNER_ONLY` | `EVERYONE` | Dove |
|---|---|---|---|
| Notifiche (`notifyAutoscuolaUser`) | tace solo il pubblico `owner` | tace tutto | `notify.ts` → riga `skipped` «autoscuola in manutenzione» |
| Push dirette | escluse le push ai titolari | nessuna | `push.ts` (`filterUsersReachableDuringMaintenance`) |
| WhatsApp | deciso a monte (per pubblico) | nessuno | `whatsapp-delivery.ts` |
| Messaggi a regola (template) | tace il target `staff` | tace tutto | `communications.ts` (`sendAutoscuolaMessage`) |
| Job promemoria (configurati, mattino, giorno prima) e posti liberi | girano | l'autoscuola è esclusa | `communications.ts` (`companyNotClosedToEveryone`) |
| Voce AI (Twilio / Telnyx) | normale | messaggio «servizio temporaneamente non disponibile» e chiusura, senza record di chiamata | `api/voice/twilio/incoming`, `api/voice/telnyx/call-control` |

I messaggi taciuti **non si recuperano** allo sblocco: i promemoria lavorano a
finestre di un minuto, quindi riprendono dalla finestra successiva senza
raffiche di arretrati.

### Soldi: NON si fermano (decisione di Tiziano, 2026-11-23)

**Penali, ritenti dei pagamenti, chiusura delle guide e fatture girano come
sempre**, anche in manutenzione e in qualsiasi ambito
(`processAutoscuolaPenaltyCharges`, `processAutoscuolaLessonSettlement`,
`processAutoscuolaPaymentRetries`, `processAutoscuolaInvoiceFinalization`). Lo
stesso vale per i webhook Stripe. Motivo: nulla si deve perdere e allo sblocco
tutto deve riprendere normalmente, quindi **niente sospensioni né code da
recuperare sui soldi**. Non aggiungere filtri di manutenzione a questi job.

Restano attivi anche i job di sola pulizia: check-in/chiusura automatici,
scadenza blocchi prenotazione, road-maintenance, festività, celle OSM, retention
voce.

## Sblocco: cosa riparte e come

Allo sblocco (`scope: null`) **non serve nessun intervento manuale**: nessun
cancello tiene uno stato proprio. Push, notifiche, WhatsApp, job promemoria e
voce rileggono `maintenanceScope` dal DB a ogni invio o chiamata, quindi
ripartono dal primo invio, dal primo giro di job (ogni minuto) e dalla prima
chiamata dopo lo sblocco. I dispositivi push non vengono disattivati in
manutenzione, quindi tornano a ricevere senza un nuovo login (tranne chi ha
fatto «Esci», che rientra come sempre).

Verifica del 2026-11-23 sul DB dev, con un'autoscuola temporanea poi cancellata
(attiva tutti → cambia in solo titolare → sblocca): notifiche, push, esclusione
dai job e voce si comportano come da tabella in ogni passo, e dopo lo sblocco
tornano tutti normali; registro `activate → change_scope → unlock`.

## Dove si accende e dove si spegne

- **Web, titolare**: Impostazioni → «Informazioni aziendali», in fondo:
  riga «Modalità manutenzione» → dialogo (ambito «Solo te / Tutti» + nome
  dell'autoscuola scritto; CTA attiva solo se coincide) → `activateCompanyMaintenance`
  → `/[locale]/manutenzione`.
- **Mobile, titolare**: Impostazioni → Account → stesso foglio (form sheet).
- **Backoffice** (`/backoffice`, lista autoscuole): la colonna Stato dice «In
  manutenzione · dal … · tutti / solo titolare»; in «Gestisci» la sezione
  **Manutenzione** (prima di tutte) attiva, cambia ambito con il segmentato,
  **sblocca** e mostra lo storico. Ogni cambio chiede conferma.
- **Schermate di blocco**: web `/[locale]/manutenzione` (fuori dal layout
  `/user`; si torna all'app da sola quando non si è più bloccati), mobile
  `MaintenanceScreen`, pagine pubbliche (QR `/i/`) `MaintenancePublicNotice`.
  Le pagine Aula del docente passano da `requireUserAndCompany` e
  reindirizzano alla schermata.

## Testi delle schermate

Le schermate di manutenzione (web e mobile, titolare e non) **non devono mai far
capire che l'ha chiesto il titolare**: tono di manutenzione tecnica neutra,
niente «come hai chiesto», niente «tu», niente riepilogo dell'ambito, niente
frase sui dati. Testo: «L'account è temporaneamente in manutenzione e tornerà
disponibile il prima possibile.» (mobile: «…e l'app tornerà disponibile…»).
Solo il backoffice (interno) mostra chi l'ha attivata. Web: CTA «Scrivi al
supporto» (`support@reglo.it`) ed «Esci» («Termina impersonazione» per il
backoffice in impersonazione); mobile: solo «Esci», uguale per tutti
i ruoli.

## File

| File | Ruolo |
|---|---|
| `lib/maintenance.ts` | Regole pure (ambiti, ruoli bloccati, pubblico taciuto, ingressi, conferma nome, testi) |
| `lib/autoscuole/maintenance.ts` | Scritture: `setCompanyMaintenance` (transazione + registro + mail interna), `activateMaintenanceAsOwner`, `listCompanyMaintenanceEvents` |
| `lib/autoscuole/maintenance-gate.ts` | Cancelli degli invii, leggero (solo Prisma) per i job Trigger |
| `lib/company-context.ts` | Il blocco (`getActiveCompanyContext` / `…Unchecked`) |
| `lib/actions/maintenance.actions.ts` | Attivazione dal web |
| `app/api/autoscuole/maintenance/route.ts` | Attivazione dal mobile |
| `lib/actions/backoffice.actions.ts` | `setBackofficeCompanyMaintenance`, `getBackofficeCompanyMaintenanceEvents`, stato nella lista |
| `app/[locale]/manutenzione/page.tsx` | Schermata web |
| `components/pages/Autoscuole/settings/MaintenanceSection.tsx` | Riga + dialogo di conferma (in `tabs/BusinessInfoPane.tsx`) |
| `components/pages/Backoffice/BackofficeMaintenanceSection.tsx` | Sezione del backoffice (in `BackofficeCompaniesPage.tsx`) |
| `components/shared/maintenance/MaintenancePublicNotice.tsx` | Avviso delle pagine pubbliche |
| `public/images/3d/barriera-3d.png`, `barriera-riga-3d.png` | Icona 3D (grande e da riga) |
| `tests/unit/maintenance.test.ts` | Regole pure |
