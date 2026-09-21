# REG-500 — WhatsApp come canale vero + scelta del canale una volta per tutte

**Stato:** valutazione e piano, 2026-09-21. **Nessun codice scritto**, in attesa di
approvazione e delle decisioni di Tiziano (provider, costi, verifica Meta).

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

| | Meta Cloud API (diretta) | **Twilio** | 360dialog | Sinch / MessageBird |
|---|---|---|---|---|
| Costo fisso | €0 | €0 | **€49/mese per numero** | contratti, spesso minimi mensili |
| Margine sul messaggio | nessuno | **~$0,005 a messaggio** (in e out) | nessuno | variabile |
| Tariffe Meta | a carico | a carico, senza ricarico | a carico | a carico |
| Integrazione | webhook + Graph API da zero | **il codice c'è già** (`whatsapp.ts` parla Twilio) | API propria, da scrivere | da scrivere |
| Stesso fornitore della voce Reglo | no | **sì** (i numeri voce +39 0445 0600xx sono Twilio) | no | no |
| Tempi | più lunghi (gestisci tu WABA, sender, template) | brevi | medi | lunghi |

**Raccomandazione: Twilio**, e rivedere la scelta sopra i ~10.000 messaggi al mese.

Il conto è semplice: il ricarico Twilio pareggia i €49/mese di 360dialog a circa
**10.600 messaggi al mese**. Il volume realistico di Reglo è un ordine di grandezza
sotto (vedi §3): il ricarico vale 5-15 $ al mese, mentre 360dialog ne costerebbe 53.
In più il codice Twilio esiste già, l'account esiste già, la fattura è una sola e
il numero di telefono lo si compra dalla stessa console dove stanno i numeri della
voce.

**Con una precauzione nel codice**: l'invio va dietro un'interfaccia `WhatsAppSender`
con un adapter Twilio. Se un domani il volume giustifica Cloud API diretta o
360dialog, si cambia un file, non venti.

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
circa **il 29% di 3.000-6.000 → 900-1.700 messaggi al mese**. È questo il numero che
rende Twilio la scelta giusta e che tiene il costo sotto i €50/mese.

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
Si può fare subito, indipendentemente dal provider scelto.
- WhatsApp selezionabile **solo** se configurato e sano; stato visibile in UI.
- **Ogni** tentativo di invio scrive su `AutoscuolaMessageLog`, anche i promemoria
  (oggi lo fa solo il percorso a regole) → i fallimenti smettono di essere invisibili.
- Normalizzazione dei numeri in **E.164** alla scrittura (web + mobile + import) e
  **backfill** dei 795 numeri senza prefisso, con report dei casi ambigui.
  *Serve comunque, per qualunque provider, e serve anche alla voce.*
- **Blocco/domanda aperta:** il backfill scrive su dati di produzione. Va fatto con
  una dry-run da rivedere prima di applicare.

### Fase 1 — Mittente vero (bloccata sulle decisioni di Tiziano)
- Scelta provider (raccomandato: Twilio).
- Meta Business verificato + WABA + numero dedicato + registrazione sender.
- Rotazione `TWILIO_AUTH_TOKEN` e aggiornamento su Vercel (e ovunque lo usi il
  voice-runtime).
- **Blocco:** la verifica Meta richiede documenti aziendali e può richiedere giorni.
  È il vero collo di bottiglia del "più velocemente possibile".

### Fase 2 — Template invece di testo libero
- `WhatsAppSender` come interfaccia + adapter Twilio (porta d'uscita verso Cloud API).
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
4. **Quale numero di telefono** dedicare al mittente (non deve essere già su
   WhatsApp).
