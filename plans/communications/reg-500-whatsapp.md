# REG-500 — WhatsApp come canale vero + scelta del canale una volta per tutte

**Stato:** aggiornato 2026-09-22. Fase 0 implementata su **staging** (prod non
toccata). **Provider scelto: Telnyx.** Il codice è pronto lato invio, webhook e
UI; manca solo l'attivazione manuale del mittente → vedi §7.

**Cambio di rotta del 22/09:** Twilio è stato scartato. Il suo account è sospeso
con saldo a −280 $ (debito pregresso, non di questo progetto) e non ci vogliamo
dipendere. Al suo posto **Telnyx**, che Reglo già usa per la voce: BSP ufficiale
WhatsApp, margine $0,004/msg (il più basso fra i tramiti), nessun canone fisso,
stessa chiave API e stessa fattura della voce.

---

## 1. Da dove si parte davvero

WhatsApp in Reglo **non è abbozzato: è cablato ovunque e non funziona**. Il codice
c'è, la UI lo offre, il default lo accende — e non arriva niente a nessuno,
in silenzio, da mesi.

### Le prove (dati di produzione, sola lettura)

| Cosa | Numero |
|---|---|
| Messaggi WhatsApp `sent` a log | 86 — **l'ultimo il 5 maggio 2026** |
| Messaggi WhatsApp `failed` | 114 — **l'ultimo il 15 settembre 2026** |
| Messaggi WhatsApp `skipped` ("Nessun destinatario") | 122 |
| Email a log | 1, in tutta la storia |

Gli errori registrati dicono tutto:

- `Twilio error: 401 {"code":20003,"message":"Authenticate"}` — **110 volte**, fino
  al 15/09. Il token in `TWILIO_AUTH_TOKEN` non è più valido: ogni invio WhatsApp
  fallisce dal giorno in cui è stato ruotato.
- `Twilio error: 429 {"code":63038, "Account ... exceeded the 5 daily messages limit"}`
  — il tetto di **5 messaggi al giorno**. Non è un numero da produzione.

E il mittente configurato è `TWILIO_WHATSAPP_FROM = whatsapp:+1 727 756 8104`: un
numero **americano**, con cap giornaliero, che richiede a ogni destinatario di
iscriversi mandando un codice. Cioè: Reglo non ha mai avuto un mittente WhatsApp
Business vero. Gli 86 messaggi "riusciti" del febbraio-maggio sono passati di lì.

### I quattro blocchi tecnici (sono indipendenti: risolverne uno non basta)

1. **Nessun mittente WhatsApp Business reale.** Serve un numero registrato su una
   WhatsApp Business Account verificata da Meta.
2. **Credenziali Twilio scadute** (401). Da sole spiegano gli ultimi 4 mesi di
   silenzio.
3. **I numeri di telefono non sono in formato internazionale.** In produzione:
   **795 numeri su 1.043 sono senza prefisso** (`3331234567`), 231 in `+39`, 16
   sporchi. `normalizeWhatsapp` si limita a premettere `whatsapp:` → anche con
   credenziali valide, **il 76% degli invii fallirebbe comunque**.
4. **Si mandano messaggi liberi, non template approvati.** `sendAutoscuolaWhatsApp`
   passa un `Body` di testo. Meta permette testo libero **solo** dentro le 24h da un
   messaggio dell'utente: un promemoria per una guida di domani è per definizione
   fuori da quella finestra e va mandato come **template approvato**. Quindi anche
   con numero e credenziali a posto, l'architettura attuale non può funzionare.

### Il quinto problema, che è il peggiore: il fallimento è muto

Nei promemoria (X minuti prima, mattutino, giorno prima, slot liberi) l'invio è in
un `try/catch` che fa solo `console.error`. **Nessuna riga di log, nessun avviso in
UI.** L'autoscuola spunta "WhatsApp", crede che i suoi allievi ricevano il
promemoria, e non lo riceve nessuno. Le 114 righe `failed` vengono solo dal percorso
delle regole configurate, che è l'unico che scrive su `AutoscuolaMessageLog`.

**Quante autoscuole ne sono toccate:** 8 su 19 hanno WhatsApp esplicitamente acceso
per i promemoria allievo, altre 6 non hanno impostazioni → prendono il default, che
è `["push","whatsapp","email"]`. Quindi **14 su 19 stanno provando a mandare
WhatsApp** a vuoto.

### Perché la UI è confusionaria (Impostazioni → Promemoria e notifiche)

- **9 interruttori indipendenti**: tre card (Promemoria allievo / Promemoria
  istruttore / Cancellazioni) × tre canali (Notifica / WhatsApp / Email). Nessuno
  li tiene allineati, nessuno spiega cosa succede se ne spunti due.
- **Si può spuntare un canale che non esiste.** WhatsApp è selezionabile anche se
  non è configurato: è una promessa che il sistema non può mantenere.
- **La copy spinge nella direzione sbagliata**: "Sconsigliamo l'email per la scarsa
  leggibilità" scoraggia l'unico canale che oggi funzionerebbe davvero.
- **Una seconda scelta di canale altrove**: in Comunicazioni ogni regola ha il suo
  select Email/WhatsApp, e il DB accetta pure `sms`, che il backend converte
  zitto zitto in `whatsapp` (`normalizedChannel = channel === "sms" ? "whatsapp" : channel`).
- **Non si dice a chi arriva cosa.** La push arriva solo a chi ha l'app: **863
  allievi attivi su 1.216 (71%)**. Gli altri 353 oggi non ricevono niente, e la UI
  non lo lascia capire.

---

## 2. Opzioni tecniche per un canale WhatsApp vero

Tutte passano da Meta: non esiste WhatsApp Business senza una WABA e senza
template approvati. Cambia solo chi fa da tramite.

| | **Telnyx** | Meta Cloud API (diretta) | Twilio | 360dialog |
|---|---|---|---|---|
| Costo fisso | **€0** | €0 | €0 | €49/mese per numero |
| Margine sul messaggio | **$0,004** | nessuno | $0,005–0,010 | nessuno |
| Tariffe Meta | a carico, stessa fattura | a carico | a carico | a carico |
| Registrazione mittente | **Embedded Signup dal portale** | manuale (App + System User) | Embedded Signup | Embedded Signup |
| Stesso fornitore della voce Reglo | **sì** (la voce è già Telnyx) | no | no | no |
| Credenziali già in casa | **sì** (`TELNYX_API_KEY` in dev/staging/prod) | no | account **sospeso** | no |
| Costo del solo provider a 30.000 msg/mese | **€110/mese** | €0 | €138/mese | €49/mese |

**Decisione (22/09): Telnyx.** Tre ragioni, in ordine di peso:

1. **L'account Twilio non è utilizzabile.** È sospeso con saldo a **−280 $**, un
   debito vecchio non legato a questo progetto. Sbloccarlo vuol dire pagare un
   arretrato per un fornitore che comunque costa più degli altri: non ha senso.
2. **Telnyx è già dentro Reglo.** È il fornitore della voce: `TELNYX_API_KEY`
   esiste già in tutti e tre gli ambienti, l'account è pulito, la fattura è una
   sola. Non c'è un contratto nuovo, né una credenziale nuova da custodire.
3. **È BSP ufficiale Meta con il margine più basso fra i tramiti** ($0,004 contro
   $0,005–0,010 di Twilio) e nessun canone fisso, e l'onboarding passa
   dall'Embedded Signup — cioè evita il giro manuale con App Meta e System User
   token che serve con la Cloud API diretta.

Meta diretta resta l'unica a margine zero: a 30.000 msg/mese Telnyx costa €110
in più. Si tiene come **innesco scritto** — sopra i ~20.000 messaggi al mese
vale la pena rifare il conto — ma oggi, a ~2.200 msg/mese, il margine Telnyx è
**~€8/mese** e non giustifica un onboarding più pesante. Il cambio resta una
variabile d'ambiente: `WHATSAPP_PROVIDER=cloud`.

### La verifica Meta NON è sul percorso critico (e vale per tutti e tre)

Un numero su un business non ancora verificato può mandare **250 messaggi
business-initiated ogni 24 ore** (Meta, *Messaging Limits*; e la doc Twilio dice
lo stesso per i suoi sender). Il fabbisogno di Reglo col disegno a cascata è
**~73 al giorno**: ci sta dentro con tre volte di margine. Si va in produzione
**prima** che la verifica finisca; la verifica serve dopo, per alzare il tetto
(250 → 2.000 → 10.000 → illimitato) — e al secondo scaglione si arriva anche
senza, consegnando 2.000 messaggi in 30 giorni con template di qualità alta.

Da sfatare: **nessuna verifica fatta presso il fornitore vale per Meta.** Non
valeva la verifica Twilio dei numeri voce e non vale l'account Telnyx già attivo:
sono aziende diverse. Il cliente crea una WABA sua e la verifica la completa lui.
Nessun BSP — Telnyx compreso — può saltarla o riciclarla. Questo è anche il
motivo per cui il cambio Twilio → Telnyx **non fa perdere tempo**: la parte lenta
(la verifica Meta) non era ancora iniziata, e sarebbe stata identica.

| | **Telnyx** | Meta diretta | Twilio | 360dialog |
|---|---|---|---|---|
| Registrazione sender | ~1 ora, Embedded Signup | ~1 ora, manuale (App + System User token) | ~1 ora, Embedded Signup | ~1 ora, Embedded Signup |
| Si manda subito a utenti veri? | sì, 250/giorno | sì, 250/giorno | sì, 250/giorno | sì, 250/giorno |
| Verifica Meta | **identica** | 1-3 settimane | **identica** | **identica** |
| Costo a 2.200 msg/mese | **~€8/mese** | €0 | ~€10/mese | €49/mese |

Quello che ci separa davvero dalla produzione non è il fornitore: sono template,
webhook, numeri e UI — settimane di lavoro, identiche nei tre casi.

### Il volume vero, misurato (non stimato)

Ultimi 30 giorni in produzione: **1.895 guide** non annullate, **1.218 allievi
attivi**, **457 broadcast di inviti a guide di gruppo**, 40 offerte di scambio.
Promemoria attivi: mattutino in 7 autoscuole su 19, giorno-prima in 6,
istruttore in 4, slot vuoti in 8.

Tetto dei soli promemoria, se tutti i tipi fossero accesi ovunque:
1.895 × 3 (allievo) + 1.895 (istruttore) = **~7.600 messaggi al mese, ~250 al
giorno**. È esattamente l'ordine di grandezza che dice Tiziano.

E i **broadcast** stanno sopra: 457 inviti a guide di gruppo in 30 giorni, con
un pubblico che da Robatto arriva a **183 allievi iscritti ai gruppi**. Se quelli
passassero da WhatsApp sarebbero **10-20.000 messaggi al mese da soli** — più di
tutti i promemoria messi insieme.

### I conti, per scenario

Tariffa Meta *utility* per l'Italia: forchetta **€0,020-0,050** a messaggio
(UK $0,022 / Germania $0,055 dai listini di terze parti; l'Italia sta lì in
mezzo). **Non è un preventivo**: il listino vero si scarica solo da dentro un
account Meta Business.

| Scenario | msg/mese | Tariffe Meta (uguali per tutti) | + **Telnyx** | + Twilio | + 360dialog | + Meta diretta |
|---|---|---|---|---|---|---|
| ~100/giorno | 3.000 | €60-150 | **€11** | €14 | €49 | €0 |
| ~250/giorno (tetto promemoria) | 7.600 | €152-379 | **€28** | €35 | €49 | €0 |
| ~500/giorno | 15.000 | €300-750 | **€55** | €69 | €49 | €0 |
| ~1.000/giorno (WhatsApp primario) | 30.000 | €600-1.500 | **€110** | €138 | €49 | €0 |

Solo il sovrapprezzo del provider, su base annua:

| msg/mese | **Telnyx** | Twilio | 360dialog | Meta diretta |
|---|---|---|---|---|
| 3.000 | **€132** | €166 | €588 | €0 |
| 7.600 | **€334** | €418 | €588 | €0 |
| 15.000 | **€660** | €828 | €588 | €0 |
| 30.000 | €1.320 | €1.656 | **€588** | €0 |

**Pareggio Telnyx / 360dialog: 13.316 messaggi al mese** (€49 ÷ $0,004 al cambio
~1,08). Sotto quella soglia Telnyx costa meno del canone fisso di 360dialog;
sopra, il canone vince. **Telnyx contro Meta diretta non pareggia mai**: Meta
diretta costa meno dal primo messaggio, perché non ha né fisso né margine — è il
prezzo dell'autonomia totale, non un'offerta migliore.

### Perché Telnyx e non gli altri

Il timore di Tiziano su Twilio era **strutturalmente giusto**, e nel frattempo è
diventato accademico: l'account è sospeso a −280 $ e resta fuori. Ma il
ragionamento che lo muoveva vale ancora ed è quello che ha scelto Telnyx: fra due
tramiti che fanno esattamente la stessa cosa, si paga il margine più basso.
Telnyx costa il **20% in meno** di Twilio a parità di servizio e non ha canone.

Il lavoro che un BSP sembra risparmiare **va fatto comunque**: i template sono un
concetto di Meta, non del tramite, e il webhook serve con chiunque. Quello che il
BSP toglie davvero è la registrazione del mittente e una console comoda.

- **Telnyx — la scelta.** Margine più basso fra i tramiti, nessun fisso, Embedded
  Signup, e soprattutto **è già in casa**: stessa chiave API della voce, stessa
  fattura, account pulito. Zero superficie contrattuale nuova.
- **Meta Cloud API diretta** — l'unica a margine zero, e resta l'approdo naturale
  se i volumi crescono molto. In cambio Reglo fa da BSP a se stessa: se il numero
  viene segnalato o la *quality rating* scende, non c'è un'assistenza a cui
  scrivere. Oggi non vale €8 al mese.
- **360dialog** — ha senso solo sopra i ~13.300 messaggi/mese, dove il canone
  fisso batte il margine. Da riconsiderare se WhatsApp diventa il canale primario.
- **Twilio** — fuori: account sospeso con debito pregresso, ed era comunque il più
  caro dei tramiti.

### Ma il provider è il termine piccolo

A 15.000 messaggi al mese: Meta chiede €300-750, il margine Telnyx è €55. Cioè
**la scelta del provider vale meno del 10% della bolletta**. Quello che la decide
davvero è *quanti messaggi si mandano*, e lì i moltiplicatori sono tre:

1. **La cascata** (un messaggio, un canale) invece di tre spunte che mandano tre
   messaggi allo stesso allievo: **-66%**.
2. **La push assorbe il 71%** degli allievi (863 su 1.216 hanno l'app): WhatsApp
   come ripiego e non come doppione taglia un altro **-71%** del resto.
3. **I broadcast restano su push.** Inviti ai gruppi, slot liberi, offerte di
   scambio sono *inviti*, non impegni presi: se finiscono su WhatsApp da soli
   valgono più di tutti i promemoria insieme.

Con questo disegno il volume WhatsApp reale è **~2.200 messaggi al mese**
(i promemoria dei soli allievi senza app) → **€44-110 al mese di tariffe Meta**,
più €0 di provider con Meta diretta. Senza questo disegno si arriva a
€600-1.500 al mese. **La progettazione vale dieci volte la scelta del fornitore.**

### Cosa serve comunque, con qualunque provider

- Una **WhatsApp Business Account** sotto un **Meta Business verificato** (verifica
  aziendale: visura/P.IVA, indirizzo, legale rappresentante).
- Un **numero di telefono dedicato**, che **non deve essere già usato su WhatsApp
  personale o Business app** — se lo è, va prima liberato.
- **Template approvati da Meta** per ogni messaggio che parte per iniziativa nostra.
  Approvazione di solito rapida (minuti-ore) per i template di categoria *utility*.
- Un **webhook** per ricevere risposte e stati di consegna. **Oggi non esiste**: in
  `app/api` c'è solo il webhook della voce. Se un allievo risponde "posso spostare?"
  quel messaggio oggi non lo legge nessuno.

### Costi, onestamente

Le tariffe Meta sono per messaggio, per categoria e per Paese. Le fonti di terze
parti che ho consultato **non concordano** sul numero esatto per l'Italia (si va da
~$0,0014 a ~$0,03 per messaggio *utility*), e il listino ufficiale è scaricabile
solo da dentro un account Meta Business. **Non invento un numero**: il listino
esatto Italia va letto dalla console (è una delle azioni da fare, §5).

Quello che è certo e conta:

- I promemoria sono **utility template**, la categoria meno cara. Un comunicato
  promozionale sarebbe **marketing**, sensibilmente più caro e con obbligo di opt-in.
- **Dal 1° ottobre 2026** (fra dieci giorni) Meta comincia a far pagare anche i
  *service message* e gli *utility template* dentro la finestra di 24 ore, che
  finora erano gratis. Non cambia il nostro caso — i promemoria sono fuori finestra
  e quindi già a pagamento — ma toglie ogni scorciatoia "tanto in finestra è gratis".
- Ordine di grandezza per Reglo, prendendo la stima alta ($0,03/msg): **meno di
  €100 al mese** anche con WhatsApp acceso ovunque. Con la stima bassa, pochi euro.
  Non è il costo a decidere: è il tempo di attivazione.

---

## 3. Quanti messaggi, davvero

Guide non annullate negli ultimi mesi in produzione: maggio 229, giugno 1.250,
luglio 2.053, agosto 1.223, settembre 1.499. Diciamo **~1.500-2.000 guide/mese**.

Ogni guida può generare fino a 3 promemoria allievo (X minuti prima, mattutino,
giorno prima) più quello istruttore, più le notifiche slot libero.

Ma **la push assorbe il 71%**: 863 allievi attivi su 1.216 hanno l'app. Se WhatsApp
diventa il *ripiego per chi non ha l'app* invece di un doppione, il volume vero è
circa **il 29% di 3.000-6.000 → 900-1.700 messaggi al mese**. È questo il numero
che tiene il costo del tramite sotto i €10/mese e rende il margine Telnyx un
non-problema.

Ed è anche il motivo per cui la UI deve essere una cascata, non nove caselle.

---

## 4. La UI: una scelta sola, fatta una volta

Oggi si chiede all'autoscuola di comporre una matrice. Deve invece rispondere a
una domanda sola: **"come vuoi che avvisiamo i tuoi allievi?"**

### Proposta: la cascata, scritta a parole

Un blocco unico "Come mandiamo le comunicazioni", con tre righe ordinate che
dicono chi riceve cosa:

```
Come avvisiamo i tuoi allievi
  1. App Reglo          gratis · arriva a 863 dei tuoi 1.216 allievi   [sempre attiva]
  2. WhatsApp           per i 353 che non hanno l'app                  [attivo / Attiva]
  3. Email              se non ha nemmeno un numero                    [on/off]

  L'allievo riceve il messaggio UNA volta sola, sul primo canale disponibile.
```

I punti che fanno la differenza rispetto a oggi:

- **Un messaggio, un canale.** Oggi tre spunte = tre messaggi allo stesso allievo.
  La cascata toglie i doppioni e, come effetto, taglia il costo WhatsApp.
- **I numeri veri nella UI.** "arriva a 863 dei tuoi 1.216 allievi" spiega la
  scelta meglio di qualunque testo di aiuto.
- **WhatsApp non è spuntabile finché non è attivo.** Stato esplicito: *Non attivo →
  Attiva* / *In attesa di approvazione Meta* / *Attivo*. Mai più una casella che
  promette un invio impossibile. (Lo schema ha già il precedente:
  `voiceProvisioningStatus` fa esattamente questo per i numeri voce.)
- **Il resto sotto "Personalizza"**, chiuso. Chi vuole canali diversi per
  istruttori o per le cancellazioni lo trova lì; le tre chiavi attuali
  (`studentReminderChannels`, `instructorReminderChannels`, `slotFillChannels`)
  restano e continuano a funzionare — nessuna migrazione forzata.
- **"Ultimi invii"**: un pannello piccolo che mostra cosa è davvero partito, letto
  da `AutoscuolaMessageLog`. È la cura contro il fallimento muto.
- **Via la copy che sconsiglia l'email** e via il select di canale duplicato nelle
  regole di Comunicazioni, che eredita la scelta globale.

Il disegno definitivo lo si fa con un'anteprima da approvare (regola nota: si
decide iterando anteprime), non in questo documento.

---

## 5. Piano a fasi

### Fase 0 — Smettere di mentire (nessuna decisione richiesta, nessun costo)
**In corso dal 21/09.** Già fatto:
- `lib/phone-e164.ts` — normalizzazione E.164, prudente per costruzione (davanti
  a un numero ambiguo rinuncia invece di indovinare). 17 test.
- `lib/autoscuole/whatsapp-templates.ts` — registro dei template: nome su Meta,
  categoria, variabili ordinate, testo da sottomettere. Include l'elenco dei
  `kind` che **non** passano da WhatsApp (i broadcast).
- `lib/autoscuole/whatsapp-sender.ts` — interfaccia `WhatsAppSender` + adapter
  **Telnyx** (il fornitore scelto), Cloud API (che serve anche 360dialog) e
  Twilio, più `isWhatsAppChannelAvailable()` per la UI. 21 test.
- `lib/autoscuole/whatsapp-webhook.ts` + `app/api/webhooks/whatsapp/route.ts` —
  firma (**Ed25519 Telnyx**, HMAC-SHA256 Meta, HMAC-SHA1 Twilio), challenge di
  sottoscrizione, parsing di stati e messaggi in arrivo, riconoscimento della
  revoca in italiano. 29 test.

Fatto in questa fase (staging, commit `f774313`):
- **Ogni** tentativo di invio scrive su `AutoscuolaMessageLog`, anche i promemoria
  (prima lo faceva solo il percorso a regole) → i fallimenti smettono di essere
  invisibili. `lib/autoscuole/delivery-log.ts` + i 12 blocchi muti di
  `lib/autoscuole/communications.ts` convertiti.
- Normalizzazione in **E.164 alla scrittura** (`toStoredPhone`) sui 4 punti reali di
  scrittura: web (`user.actions.ts` ×2), registrazione allievo mobile, profilo mobile.
  L'import CSV è disattivato, quindi non serve toccarlo ora.
  *Serve comunque, per qualunque provider, e serve anche alla voce.*

Dry-run del backfill sui numeri di produzione (sola lettura, 2026-09-21):

| | |
|---|---|
| Numeri in anagrafica | 1052 |
| Già in E.164, non si toccano | 68 |
| Verrebbero convertiti | 981 |
| Resterebbero come sono (ambigui) | 3 |

Resta da fare in questa fase:
- WhatsApp selezionabile **solo** se configurato e sano; stato visibile in UI.
- **Domanda aperta:** applicare il backfill ai 981 convertibili — è una scrittura su
  dati di produzione, in attesa dell'ok esplicito di Tiziano.

**Decisioni prese (Tiziano, 2026-09-21):**
- I **3 numeri ambigui** (cifre sbagliate in anagrafica: 2 di Autoscuola Robatto,
  1 di Autoscuola Montreal) → **si lasciano come sono**, non si contattano le
  autoscuole. Il normalizzatore li lascia intatti apposta, quindi non fanno danno:
  semplicemente quegli allievi non saranno raggiungibili su WhatsApp.
- I **7 duplicati di anagrafica** (stesso numero su due utenti diversi, scoperti
  durante il dry-run) → **nessuna azione**. Nessun impatto sull'invio: il messaggio
  parte comunque, arriva due volte allo stesso telefono nei rari casi in cui
  entrambe le anagrafiche siano attive.

### Fase 1 — Mittente vero (attende le azioni manuali di Tiziano)
- ~~Scelta provider~~ → **fatta: Telnyx** (22/09).
- Numero Telnyx con messaging profile attivo (l'Embedded Signup **non** accetta
  numeri di altri operatori).
- Embedded Signup dal portale Telnyx → Meta Business + WABA + registrazione del
  mittente con nome visualizzato.
- `TELNYX_WHATSAPP_FROM`, `TELNYX_PUBLIC_KEY` e `WHATSAPP_PROVIDER=telnyx` su
  Vercel; webhook puntato su `/api/webhooks/whatsapp`.
- **Blocco:** la verifica Meta richiede documenti aziendali e può richiedere
  giorni. **Non** ferma la partenza (250 msg/24h pre-verifica bastano), serve per
  alzare il tetto dopo.

### Fase 2 — Template invece di testo libero
- `WhatsAppSender` come interfaccia + adapter **Telnyx** (Cloud API e Twilio
  restano come ripiego: l'interfaccia serve proprio a non restare incastrati).
- Registro dei template in codice: `kind → nome template + variabili`, per
  promemoria guida (3 varianti), esame, slot libero, scadenze foglio rosa/certificato
  medico, comunicato.
- Sottomissione e approvazione dei template su Meta.
- I mittenti attuali (`communications.ts`, `autoscuole-swap.actions.ts`,
  `autoscuole-availability.actions.ts`) passano dal registro.

### Fase 3 — Risposte e consenso
- Webhook per risposte e stati di consegna (oggi **non esiste**).
- Dove finiscono le risposte: notifica all'autoscuola? Un'inbox? **Domanda aperta,
  è una scelta di prodotto.**
- Gestione STOP/opt-out (obbligatoria per policy Meta).
- **Consenso dell'allievo**: oggi nel modello dati **non c'è nessun campo di
  consenso**. Serve un flag + il punto in cui si raccoglie (registrazione o profilo)
  e l'aggiornamento di privacy policy e termini. **Blocco legale, non tecnico.**

### Fase 4 — La UI della cascata
- Anteprima da approvare, poi implementazione, retro-compatibile con le tre chiavi
  esistenti.

### Fase 5 — Rilascio graduale
- Una sola autoscuola pilota (Robatto o Torri di Quartesolo, che hanno già WhatsApp
  acceso), verifica sul campo, poi le altre.

---

## 6. Domande aperte per Tiziano

1. **Un mittente Reglo per tutte le autoscuole, o un numero per autoscuola?**
   Uno solo: veloce ed economico, ma il messaggio arriva da "Reglo" e il nome
   dell'autoscuola sta nel testo. Uno a testa: ogni scuola ha il suo numero e la sua
   verifica Meta — onboarding molto più pesante, e con 360dialog anche €49/mese
   ciascuno. *Raccomandazione: partire con un mittente Reglo unico.*
2. **Il costo lo assorbe Reglo o lo si ribalta sulle autoscuole?** Cambia se il
   canale va acceso di default o venduto come opzione.
3. **WhatsApp anche per i comunicati promozionali?** Sarebbero categoria *marketing*:
   più cari e con obbligo di opt-in esplicito. I promemoria no, sono *utility*.
5. **I broadcast (inviti ai gruppi, slot liberi, scambi) restano su push?**
   È la singola decisione che pesa di più sulla bolletta: da sola vale più di tutti
   i promemoria messi insieme. *Raccomandazione: sì, restano su push.*
6. ~~**Assistenza o costo zero?**~~ → **risolta dalla scelta Telnyx** (22/09):
   assistenza da BSP ufficiale a costo fisso zero, si paga solo $0,004 a messaggio.
   Era l'unica domanda in cui le due cose si escludevano.
4. ~~**Quale numero di telefono**~~ → **risolta (22/09): un geografico italiano
   Telnyx**, `+39 02 …` (Milano), $2 una tantum + $2/mese. In Italia Telnyx non
   vende numeri **mobili** — è un limite regolatorio, non una mancanza del
   portale — quindi il geografico è l'unica opzione sensata. Resta molto meglio
   del vecchio mittente Twilio, che era un `+1` americano.

---

## 7. Cosa serve a Tiziano per attivare Telnyx

Il codice è pronto e non serve altro da parte mia finché questi passi non sono
fatti. Sono tutti dal portale Telnyx e da Meta, in quest'ordine.

**Categoria B — meccanici, li può eseguire Hiro dal Mac:**

1. **Comprare un numero su Telnyx** (portale → Numbers → Buy Numbers). In Italia
   ci sono solo **geografici**, niente mobili: va bene, WhatsApp Business supporta
   ufficialmente i fissi. **Non** un numero già usato su WhatsApp.
2. **Assegnargli un messaging profile** (Messaging → Messaging Profiles). Senza
   questo l'Embedded Signup rifiuta il numero.
3. **Copiare la chiave pubblica dei webhook**: portale → Account Settings → Keys &
   Credentials → Public Key. Serve per `TELNYX_PUBLIC_KEY`.
4. **Impostare su Vercel** (progetto `reglo`, ambienti staging e production):
   - `WHATSAPP_PROVIDER=telnyx`
   - `TELNYX_WHATSAPP_FROM=<numero in E.164, es. +39…>`
   - `TELNYX_PUBLIC_KEY=<chiave pubblica>`
   `TELNYX_API_KEY` c'è già: è la stessa della voce, non va toccata.
5. **Puntare il webhook WhatsApp** su `https://app.reglo.it/api/webhooks/whatsapp`
   (e `https://staging.reglo.it/...` per staging).

**Categoria C — decisioni e documenti, solo Tiziano:**

6. **Embedded Signup** (portale Telnyx → Messaging → WhatsApp → Add WhatsApp
   Business Account). Richiede il login Facebook di un amministratore del Meta
   Business di Reglo, e sceglie il **nome visualizzato** che vedranno gli allievi
   (si cambia poi, ma con approvazione Meta: conviene azzeccarlo).

   > ⚠️ **Verifica per CHIAMATA, e la chiamata deve trovare una persona.**
   > Su un fisso Meta non manda l'SMS: telefona e detta il PIN. La sua regola è
   > esplicita — *la chiamata di registrazione non può attraversare un IVR*.
   > Quindi il numero **non va agganciato a "Reglo Voice AI"**: l'assistente
   > risponderebbe al posto di una persona e la verifica fallirebbe, per di più in
   > modo opaco. Va impostato su **"Forward Only"** verso un cellulare vero, e
   > **provato con una chiamata reale prima** di lanciare la registrazione: i
   > tentativi falliti hanno un tempo di attesa imposto da Meta.
   >
   > Il campo "Connection or Application" del carrello serve solo a questo — è
   > routing voce, non tocca WhatsApp — e si può lasciare vuoto all'acquisto,
   > assegnandolo dopo dalle impostazioni del numero.
7. **Verifica del Meta Business** — documenti aziendali (visura, P.IVA, sito,
   email di dominio). Non blocca la partenza: fino a verifica si mandano 250
   messaggi business-initiated ogni 24 ore, e il fabbisogno di Reglo è ~73/giorno.
8. **Sottomissione dei template** a Meta: i testi sono già scritti in
   `lib/autoscuole/whatsapp-templates.ts`, vanno incollati nel portale e attesa
   l'approvazione (di solito minuti-ore per la categoria *utility*).

Quando 1-5 sono fatti posso verificare il collegamento su staging **senza
mandare niente a nessuno**: `APP_ENV=staging` rende gli invii esterni no-op, e
`isWhatsAppChannelAvailable()` dice se la configurazione regge.
