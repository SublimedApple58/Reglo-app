# REG-758 · Avviso «guida fissata» all'allievo: piano di prodotto (fase 1)

**Stato:** piano approvato da Tiziano il 2026-11-17, sviluppo in corso (fino a staging, mai prod).

## Decisioni di Tiziano (2026-11-17)
1. **Spento di default**, interruttore in Impostazioni → Promemoria e notifiche.
2. **Raggruppato**: 3 minuti di quiete, al massimo 15 di ritardo. Migrazione ok.
3. **Assistente vocale INCLUSO**: anche le guide prenotate tramite la voce ricevono l'avviso (cambia il punto 3 e la tabella «Dove si aggancia» qui sotto).
4. **Modello Meta approvato com'è, senza il nome dell'istruttore**: via a sottometterlo a Meta via Telnyx come `guida_fissata_allievo_v1`. Il nome dell'istruttore resta solo in push ed email.
5. **Label Linear**: solo quelle che esistono già nel team.
6. **Mobile**: worktree dedicato `~/Developer/reglo/reglo-worktrees/reg-758-mobile`, branch `feature/reg-758-guida-fissata` da `origin/master`; mai lavorare in `reglo-mobile/` (c'è un altro terminale). Mobile solo in locale/simulatore.

---


Dipendenze installate (`pnpm install` ok). Ho verificato in sola lettura che l'id del consorzio `85635731-4804-48b7-b997-5d48ba20a1bb` è in `WHATSAPP_PILOT_COMPANY_IDS` sia su Vercel prod sia su Trigger.dev prod, insieme a Driving School Massa. Su Trigger prod c'è anche `WHATSAPP_PROVIDER=telnyx`.

**Un dato da sapere prima di tutto.** In prod il consorzio ha 22 allievi con guide. Nessuno ha l'app, 2 hanno il telefono, tutti e 22 hanno l'email. Quindi per Federica, all'inizio, l'avviso arriverà quasi solo per **email**: a 2 allievi su WhatsApp, e solo dopo che Meta avrà approvato il modello.

## 1. Fisso o configurabile?
**Configurabile per autoscuola, spento di default.** Lo accendiamo noi per il consorzio.
- Fuori dal consorzio, in 30 giorni lo staff ha fissato 2.670 guide in 10 autoscuole. Molte le prenotano al bancone con l'allievo davanti. Accenderlo per tutti vorrebbe dire messaggi a sorpresa e costi WhatsApp non chiesti.
- Gli avvisi di cancellazione e spostamento restano fissi come oggi: quelli sono cambi di programma, questo è una conferma.

## 2. Dove sta l'impostazione
- **In Impostazioni → Promemoria e notifiche**: una nuova riga «Avviso guida fissata», sotto «Promemoria il giorno prima» e con lo stesso stile. Solo l'interruttore, senza orario.
- **I canali sono quelli della cascata già scelta**: non c'è un secondo selettore.
- **Il dato** va nello stesso JSON di `studentReminderDayBeforeEnabled`, più la data di accensione. Così, quando si accende, non partono avvisi per le guide fissate prima.
- **Su «Ultimi invii»** compare la nuova etichetta «Guida fissata».

## 3. Account coinvolti
**Destinatario:** solo l'allievo. L'istruttore non riceve niente di nuovo.

**Chi fissa, sia da web sia da mobile:**

| Chi fissa | Da dove | Avviso? |
|---|---|---|
| Titolare, admin, segreteria | Agenda web | Sì |
| Istruttore | App: singola, multipla, guide di gruppo | Sì |
| Consorzio che accetta una «richiesta guida» di una consorziata | Web | Sì |

Escluso tutto ciò che parte dall'allievo in app: prenotazione dall'app, posto liberato accettato, scambio, invito a una guida di gruppo accettato. **L'assistente vocale è incluso** (decisione 3): le guide prenotate tramite la voce ricevono l'avviso.

## 4. Piattaforme
- **Backend:** creazione, coda, invio, nuovo kind, modello Meta.
- **Web:** l'impostazione e «Ultimi invii».
- **Mobile, inbox dell'allievo:**
  - nuovo tipo in `types/notifications.ts`;
  - un ramo in `NotificationOverlay` (lato allievo);
  - titolo e sottotitolo in `NotificationInboxScreen`.

  Toccare la riga segna solo come letto, come per gli altri avvisi.

**Rischio sulle versioni vecchie dell'app.** Senza l'aggiornamento OTA, un kind sconosciuto arriva come banner del telefono ma non entra nell'inbox. Se poi arriva dall'endpoint di recupero (`/api/autoscuole/notifications`), compare una **riga vuota** che conta come non letta.

**Proposta:** il recupero restituisce il nuovo kind solo alle app che lo sanno mostrare. Verifico se l'app manda già la sua versione; se no, aggiungo un parametro. Uso anche un id stabile `created_<id>` sia nella push sia nel recupero: oggi gli altri kind compaiono doppi perché la push mette `Date.now()` nell'id.

## 5. Cosa si riusa
- **`notifyAutoscuolaUser`** (`lib/autoscuole/notify.ts`): cascata App → WhatsApp → Email, un solo messaggio, una riga di registro per ogni tentativo.
- **`EVENT_CHANNELS_WITH_WHATSAPP`** e il cancello `deliverWhatsApp`: canale configurato, modello approvato, consenso non revocato.
- **Il modello da copiare è `exam_scheduled`**: l'esame fissato manda già un avviso da tutti i suoi punti di creazione, compreso il ramo istruttore della rotta mobile. Riuso anche `describeWhen` e `firstNameFor` di cancellazione e spostamento.
- **Nuovo kind `appointment_created`**: sarà sia `data.kind` della push sia la chiave del modello in `whatsapp-templates.ts`.

## Dove si aggancia
Oggi nessun percorso avvisa l'allievo quando gli viene fissata una guida.

| Percorso | Dove | Cosa fa |
|---|---|---|
| Guida singola | `createAutoscuolaAppointment` (web e app istruttore) | Solo se chi la crea **non** è l'allievo. Oggi quell'action segna `staff_*` anche quando prenota uno studente: lo correggo in `student_self` |
| Prenotazione multipla | `createAutoscuolaAppointmentBatch` (1–20 date) | Un messaggio solo con tutte le date. Le ricorrenze vere non esistono: questa è la cosa più vicina |
| Guida di gruppo creata dallo staff | `createGroupLesson` | Un avviso per ogni allievo assegnato |
| Allievo aggiunto a un gruppo | `addGroupLessonParticipant` | Un avviso all'allievo aggiunto |
| Richiesta guida accettata dal consorzio | `acceptConsorzioGuideRequest` | Un avviso all'allievo |
| Guida prenotata dall'assistente vocale | `createVoiceAppointment` | Un avviso all'allievo (decisione 3) |
| Import in blocco | — | Non esiste: nessun percorso di produzione crea guide in massa |

## Quando NON mandarlo
- **Guide nel passato.** Sono registrazioni a posteriori: l'11% di quelle create dal titolare in prod. Vale anche per le sessioni «Road libero», che partono già in corso.
- **Guide prenotate dall'allievo stesso**, in qualunque modo.
- **Esami.** Hanno già il loro «esame fissato».
- **Guida annullata prima dell'invio.** Non si manda niente.
- **Guida spostata prima dell'invio.** L'avviso usa l'orario nuovo, e non parte anche un «guida spostata» per una guida che l'allievo non conosceva ancora.
- **Funzione spenta**, o guida creata prima della data di accensione.

## Raggruppamento contro le raffiche
Quando lo staff crea una guida, quella guida viene messa **in attesa di avviso**. Serve una migrazione: una colonna di stato sull'appuntamento.

Il job dei promemoria, che gira ogni minuto, manda l'avviso quando per quell'allievo non arrivano guide nuove da **3 minuti**, e comunque entro 15 minuti dalla prima. Un messaggio raccoglie tutte le guide di quell'allievo.

Esempi di testo:
- **Una guida:** titolo «📅 Guida fissata», testo «Giovedì 20 novembre alle 15:00 con Marco Rossi.»
- **Più guide:** «📅 3 guide fissate» e l'elenco delle date.

Ho scartato l'invio immediato a ogni azione: il 24/09 il consorzio ha creato 17 guide per 9 allievi una alla volta, e con l'invio immediato sarebbero partiti 17 messaggi.

**Su staging il job non gira.** I job Trigger.dev esistono solo in produzione. Per la QA su staging lancerò la stessa funzione con uno script contro il DB di staging. Verifico tutto anche in locale con `pnpm dev`, che avvia il worker. In produzione servirebbero `migrate:prod` e `trigger:deploy:prod`, ma siamo fuori scope: ci fermiamo a staging.

## Modello Meta
Proposta: `guida_fissata_allievo_v1`, categoria utility, variabili `nome` e `guide`.

> Ciao {{1}}, l'autoscuola ha fissato per te {{2}}. Per modifiche o disdette contatta l'autoscuola.
> *Rispondi STOP per non ricevere più questi avvisi* (stesso piè di pagina dei `_v3`)

- **Esempi di `{{2}}`:** «la guida di giovedì 20 novembre alle 15:00», oppure «3 guide: giovedì 20/11 alle 15:00, venerdì 21/11 alle 9:00, lunedì 24/11 alle 18:00».
- **Regole Meta rispettate:** nessuna variabile a inizio o fine testo, parti fisse lunghe, nessuna firma dell'autoscuola, tutto su una riga.
- **Approvazione:** lo sottometto via API Telnyx (`POST /v2/whatsapp/message_templates`), come i `_v3`. **È un invio a Meta: lo faccio solo col tuo ok esplicito.** Ci vogliono da qualche ora a un giorno. Se Meta lo riclassifica marketing, va riscritto, come è successo a «spostata» e «mattutino».

## Finché Meta non approva
Nel registro il modello è `approval: "pending"` e non ha versione precedente, quindi `sendableTemplateName` restituisce `null`. `deliverWhatsApp` registra il tentativo come `skipped` con il motivo, e la cascata passa all'**email**. Nessun errore e nessun messaggio perso: chi ha l'app riceve la push, gli altri ricevono l'email.

Quando Meta approva, si cambia `approval` in `"approved"` e si deploya web e job.

## Label Linear
Proposta: Feature, Backend, Web, Mobile, Comunicazioni. Prima di metterle controllo quali esistono nel team.

## Le tue decisioni
1. Spento di default, con interruttore in Promemoria e notifiche: ok?
2. Assistente vocale escluso: ok?
3. Raggruppamento con 3 minuti di quiete e al massimo 15 di ritardo (richiede una migrazione): ok, o preferisci l'invio immediato con un messaggio per azione, senza migrazione e senza job?
4. Testo del modello e via libera a sottometterlo a Meta.
5. Nel messaggio mettiamo anche il nome dell'istruttore? Oggi l'ho messo solo nella push e nell'email, non nel modello WhatsApp.

Aspetto il tuo ok prima di scrivere codice.
