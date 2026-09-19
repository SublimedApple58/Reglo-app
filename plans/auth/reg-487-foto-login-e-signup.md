# La foto grande anche nella registrazione (REG-487)

> **Stato:** implementato, su **staging** in attesa della conferma di design.

## Cosa c'era

Due pagine di accesso che sembravano due prodotti diversi:

- **`/sign-in`** (route group `(signin)`): colonna form a sinistra, a destra la
  foto del team con il carosello recensioni — il design del sito marketing, da
  cui arriva chi clicca "Accedi".
- **`/sign-up`** (route group `(auth)`): layout diverso (logo in una barra in
  alto, contenuto centrato a 400px), pannello **nero** a destra con un carosello
  3D di icone, input più bassi e con un radius diverso.

Chi si registrava passando dal sito trovava una schermata che non somigliava né
al sito né al login.

## Cosa è stato fatto

**1. `/sign-up` è entrata in `(signin)`** e usa lo stesso `auth-shell.tsx` —
stessa foto, stesse recensioni, stessa griglia. Il route group `(auth)`, il suo
`layout.tsx`, il `BrandCarousel` e i keyframes `brand-ring-spin` in
`globals.css` sono stati **cancellati**: erano vivi solo per quella pagina. I
route group non compaiono nell'URL, quindi **`/it/sign-up` non è cambiato**.

**2. Il form di registrazione usa i mattoni del login** (`auth-form-ui.tsx`):
input alti con radius 12, bottone nero, occhio mostra/nascondi su entrambe le
password, stesso riquadro d'errore. Prima usava i token `PROTO_*`, che sono
quelli del resto dell'app e non del design marketing.

**3. La foto è un componente solo** (`review-panel.tsx`, dentro `auth-shell`).
Era già così per login e recupero password; ora vale per tutte e tre. È questo
l'"allineamento": non tre copie da tenere in riga a mano, ma una definizione
sola — chi la tocca le cambia tutte.

## Interpretazione della richiesta

Il titolo dice "allineare la foto grande nella sezione di login e metterla
anche nella sezione di sign up". La seconda metà è netta; la prima l'ho letta
come "rendila una cosa sola, non due" — ed è quello che è stato fatto.

**Verificato invece che la foto del login NON era fuori posto**: misurata col
browser a 1440/1280/1024 è inset di 14px esatti su alto, destra e basso, cioè
identica al markup del sito marketing
(`reglo-landing/src/site/generated/views/Login.tsx`, `padding: 14px 14px 14px 0`,
`flex: 1.05`, radius 30). Se Tiziano intendeva un ritaglio o un'inquadratura
diversa, è una riga sola da cambiare in `review-panel.tsx`.

## Note

- La registrazione mostra ancora i messaggi di validazione **in inglese**
  ("Passwords don't match"): vengono da `signUpFormSchema` in `lib/validators.ts`,
  condiviso con la registrazione mobile. Fuori dallo scope di questo ticket, ma
  si vede su una pagina in italiano.

## Test

- `tests/e2e/auth-pages-look.spec.ts` (3, verdi): login e registrazione mostrano
  la stessa foto **nella stessa posizione esatta** (bounding box confrontate),
  il recupero password usa lo stesso guscio, la registrazione ha i due campi
  password con l'occhio e rimanda al login.
- `tests/e2e/login-stato-client.spec.ts` e `tests/e2e/reset-password.spec.ts`
  rigirati dopo il refactor: verdi.
- Registrazione provata a mano con password non coincidenti: errore mostrato nel
  riquadro condiviso, nessun account creato.

Anteprime: `/tmp/hiro-anteprime/reg-487/` (`prima-*` e `dopo-*`).
