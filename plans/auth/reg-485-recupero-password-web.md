# Recupero password anche da web (REG-485)

> **Stato:** implementato e verificato su dev; su **staging** in attesa dell'ok
> per la produzione.

## Cosa mancava

Il recupero password esisteva **solo sul mobile**. Sul web il link "Recupera la
password" della schermata di login puntava a `reglo.it/assistenza`: chi entrava
dal browser — e il bottone "Accedi" del sito marketing porta proprio lì — non
aveva modo di rientrare da solo.

## Cosa è stato fatto

**1. Un cuore solo per i due canali.** La logica era scritta dentro le tre route
mobile. È stata estratta in `lib/auth/password-reset.ts`
(`requestPasswordResetCode`, `checkPasswordResetCode`, `applyNewPassword`), e le
route mobile sono diventate involucri sottili. Le regole che contano — niente
enumerazione degli account, codice bruciato dopo 5 tentativi, sessioni mobile
revocate al cambio password — ora esistono in un posto solo. Due copie
divergono, e qui a divergere sarebbe la sicurezza.

**2. La pagina web.** `/[locale]/reset-password`, tre passi: email → codice a 6
cifre → nuova password. Aggiunta a `publicRoutes`, altrimenti il middleware
rimanda al login esattamente chi non riesce a entrare.

**3. Server action, non fetch alle route mobile.** `sendPasswordResetCode`,
`verifyPasswordResetCode`, `completePasswordReset` in
`lib/actions/password-reset.actions.ts`: è la convenzione del web, e chiamare
`/api/mobile/*` dal browser sarebbe stato un giro storto.

**4. Login automatico alla fine**, come sul mobile: la password l'ha appena
scelta lui, richiederla sarebbe un passaggio in più. Con più autoscuole si va a
`/select-company`, come il login normale. Se l'auto-login fallisce la pagina lo
dice — la password **è** cambiata, e mandarlo a rifare il reset con un codice
ormai consumato sarebbe il peggiore dei finali.

**5. Guscio condiviso col login.** `auth-shell.tsx` (due colonne + foto) e
`auth-form-ui.tsx` (classi del design marketing, `PasswordField`,
`SubmitButton`, `FormError`, `FormNotice`) sono stati estratti dalla pagina di
login: chi arriva dal login non deve accorgersi di aver cambiato schermata.

## Scelte da ricordare

- **La risposta al passo 1 è sempre la stessa** — email valida, sconosciuta o
  sopra il rate limit. Questa è una pagina pubblica: se rispondesse in modo
  diverso diventerebbe un modo per sapere chi ha un account Reglo.
- **Il codice si ricontrolla al passo 3.** Fra "codice giusto" e "salva" possono
  passare minuti; `verify` non consuma niente, è solo per sbloccare il passo
  dopo.
- **Etichette dei due campi password**: "Nuova password" e "Ripeti la password".
  Non "Conferma la nuova password", che contiene la prima come sottostringa e
  farebbe risolvere `getByLabel` a due elementi (stessa trappola già nota per
  l'occhio mostra/nascondi).
- **Niente `maxLength` sul campo del codice**: taglierebbe la stringa prima che
  le non-cifre vengano tolte, e un codice incollato con uno spazio dentro
  arriverebbe mutilato. Si taglia a sei **dopo** la pulizia.

## Test

- **Unitari** — `tests/unit/auth/password-reset.test.ts`, 13 nuovi (392 totali
  nella suite, verdi): invio solo a utenti esistenti, email normalizzata,
  cooldown di 60s, tetto di 5 per finestra, codice nuovo che brucia il
  precedente, conteggio tentativi fino al burn, scadenza, codice di un altro
  account, transazione del cambio password con revoca delle sessioni mobile.
- **E2E** — `tests/e2e/reset-password.spec.ts` (2, verdi): percorso dal login
  con l'email portata avanti, risposta identica per un'email sconosciuta, codice
  sbagliato rifiutato, "Cambia email". Non arriva al cambio password perché il
  codice in chiaro vive solo nell'email.
- **Giro completo su dev**, con un codice fabbricato a mano al posto dell'email:
  link dal login, codice sbagliato, codice giusto, password non coincidenti,
  salvataggio con login automatico, codice non riusabile, password nuova nel DB.
  Tutto verde; la password dell'utente di prova è stata rimessa com'era.
- **Contratto mobile**: `request` / `verify` / `confirm` riprovati a mano dopo il
  refactor — stesse risposte, stesso `AuthPayload`, stesso 400 col messaggio
  generico.

Anteprime: `/tmp/hiro-anteprime/reg-485/`.
