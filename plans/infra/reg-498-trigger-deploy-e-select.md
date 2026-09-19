# Script `trigger:deploy:*` bugiardi + `select` mancante (REG-498)

> **Stato:** implementato, su **staging**. Prod in attesa dell'ok.

Due problemi emersi da REG-442. Sono legati: il primo ha mandato in produzione
dei job che leggevano una colonna esistente solo su dev e staging, e il secondo
è la query che si è rotta.

## 1. I tre script deployavano tutti nello stesso posto

`trigger:deploy:dev|staging|prod` differivano solo per il file dotenv, ma
`.env.staging` e `.env.prod` contengono **la stessa identica chiave**
`TRIGGER_SECRET_KEY` (verificato confrontando gli hash, non i valori) e lo
stesso `TRIGGER_PROJECT_REF`. Quindi `pnpm trigger:deploy:staging` deployava in
**produzione**, mentre `CLAUDE.md` lo indicava come passo di staging.

**Correzione alla issue:** `.env.dev` ha una chiave `tr_dev_`, non `tr_prod_`
come diceva la tabella. Poco cambia — `trigger.dev deploy` non sa deployare
nell'ambiente `dev` (lì si usa `trigger.dev dev`, che gira in locale) — ma il
dato era sbagliato.

**Fatto:** rimossi `trigger:deploy:dev` e `trigger:deploy:staging`. Resta solo
`trigger:deploy:prod`, con il nome che dice la verità. Chi digita i vecchi nomi
ora riceve "script not found": un fallimento sicuro. Corretti i riferimenti in
`CLAUDE.md` (repo e root), `docs/architecture/git-flow.md` e
`docs/architecture/background-jobs.md`, che ora dicono esplicitamente che i job
**non hanno uno staging** e che il deploy va fatto **dopo** `migrate:prod`.

**Da sapere per il futuro:** la CLI `trigger.dev deploy` **supporta** `--env
staging` ("currently only prod and staging are supported"). Non è il caso oggi,
perché sul progetto Trigger.dev non esiste un ambiente staging con una sua
chiave. Se un domani lo si vuole davvero, la strada è: creare l'ambiente,
metterne la chiave in `.env.staging`, e rimettere uno script con `--env staging`
esplicito. La porta non è chiusa.

## 2. `resolveRecipients` leggeva CompanyMember senza `select`

`include` fa chiedere a Prisma **tutte** le colonne scalari del modello, quindi
la query moriva con `42703 column does not exist` ogni volta che il client
generato conosceva una colonna che il DB di quell'ambiente non aveva ancora —
cioè nella finestra fra un deploy e la sua migrazione.

`select: { user: { select: { email: true } } }`: la funzione usa solo
`entry.user.email`, ed è la stessa forma delle altre cinque letture di
`CompanyMember` raggiungibili dai cron.

**Perché faceva male più di altre:** gira dal cron dei promemoria, ogni minuto.
Un errore lì non lo vede nessuno finché non saltano i messaggi.

## 3. La guardia, perché non si ripeta

`tests/unit/autoscuole/company-member-select-guard.test.ts`: scorre i moduli
raggiungibili dai task in `trigger/` e fallisce su ogni
`companyMember.findMany/findFirst/findUnique` senza `select` al primo livello,
riportando `file:riga`.

**La lista dei file si ricava dagli import di `trigger/`, non si scrive a mano.**
La prima versione aveva una lista fissa con un commento "se aggiungi un job,
mettilo qui": è invecchiata entro l'ora, perché nel frattempo REG-442 è entrato
in `main` con un job nuovo (`autoscuole-booking-block-expiry.ts`) che la lista
non conteneva. Una guardia che va ricordata non è una guardia.

Il test verifica **anche sé stesso**: scrive una fixture con una lettura
sbagliata e pretende di trovarla, così un regex rotto non lo fa passare a vuoto.
Provato rimettendo l'`include` vero in `communications.ts` → fallisce indicando
`communications.ts:199`.

Scelta l'ESLint custom rule no: una regola vera andrebbe scritta come plugin e
saprebbe meno del contesto (quali file sono raggiungibili da un job). Il test
costa 0,1s e dice esattamente dove guardare.

## Test

- Suite unitaria: **419 verdi** (30 suite), di cui 13 di questa guardia.
- `tsc --noEmit` e lint puliti (dopo `npx prisma generate`: il merge di REG-442
  ha aggiunto `CompanyMember.bookingBlockUntil` e il client locale era vecchio).
- `package.json` riletto come JSON dopo la modifica.
