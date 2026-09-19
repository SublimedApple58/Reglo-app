# Login web (`/[locale]/sign-in`)

Pagina di accesso della web app, ridisegnata il **2026-09-17** per essere
visivamente identica alla vista Login del **sito marketing** (`reglo-landing`):
il bottone "Accedi" del sito pubblico punta direttamente qui, quindi le due
pagine devono sembrare la stessa pagina.

Il redesign tocca **solo la presentazione**. Autenticazione, redirect
post-login e selezione azienda sono rimasti invariati.

## Files

| File | Ruolo |
|------|------|
| `app/[locale]/(signin)/sign-in/page.tsx` | Server component: sessione, redirect, stato "nessuna membership". |
| `app/[locale]/(signin)/sign-in/credentials-signin-form.tsx` | Client: form credenziali, link recupero e registrazione. |
| `app/[locale]/(signin)/auth-shell.tsx` | Guscio a due colonne, **condiviso** con `/reset-password`. |
| `app/[locale]/(signin)/auth-form-ui.tsx` | Client: classi del design marketing + `PasswordField`, `SubmitButton`, `FormError`, `FormNotice`, **condivisi** con `/reset-password`. |
| `app/[locale]/(signin)/review-panel.tsx` | Client: pannello destro — foto + carosello recensioni (rotazione 6s, pausa hover, dots). |
| `app/[locale]/(signin)/marketing-links.ts` | URL di ritorno al sito marketing (`NEXT_PUBLIC_MARKETING_URL`, default `https://reglo.it`). |
| `public/images/auth/login-hero.jpg` | Foto del team, presa da `reglo-landing/public/uploads/` e ricompressa (2,3 MB → 361 KB). |
| `public/images/auth/review-{paolo,francesca,martina}.png` | Avatar delle 3 recensioni. |

## Perché il route group `(signin)` e non `(auth)`

Il design ha un layout **a tutta pagina** (logo dentro la colonna sinistra,
pannello immagine a destra), incompatibile con `app/[locale]/(auth)/layout.tsx`
— che impagina logo + contenuto centrato a 400px ed è **condiviso con
`/sign-up`**.

La pagina è quindi stata spostata in un route group suo. I route group non
compaiono nell'URL: **`/it/sign-in` non è cambiato**. `/sign-up` continua a
usare `(auth)/layout.tsx` con `BrandCarousel`, invariato.

> Se un domani anche `/sign-up` va allineato al marketing, il posto giusto è
> spostarlo in `(signin)` e cancellare `(auth)`, non duplicare il layout.

## Vincolo non ovvio: aria-label dell'occhio password

Il toggle mostra/nascondi (ora dentro `PasswordField`, in `auth-form-ui.tsx`)
ha `aria-label="Mostra i caratteri"` / `"Nascondi i caratteri"` — **di
proposito senza la parola "password"**.

`getByLabel()` di Playwright fa match per sottostringa case-insensitive, e
`tests/e2e/login-stato-client.spec.ts:27` usa `getByLabel("Password").fill(...)`.
Con un label tipo "Mostra la password" il locator risolve **2 elementi** →
strict mode violation → il test di login si rompe.

Chi tocca gli attributi accessibili di questo form verifichi che
`getByLabel("Email")` e `getByLabel("Password")` restino a 1 match.

Stessa trappola fra due etichette: in `/reset-password` i due campi si chiamano
"Nuova password" e **"Ripeti la password"** — non "Conferma la nuova password",
che conterrebbe la prima come sottostringa.

## Sorgente del design

Il riferimento **non è** solo lo screenshot: il markup esatto (dimensioni,
colori, radius, testi) è in `reglo-landing/src/site/generated/views/Login.tsx`,
e i testi delle recensioni in `reglo-landing/src/site/RegloSite.tsx` (array
`REVIEWS`). Per un riallineamento futuro partire da lì.

Le recensioni sono **duplicate**, non importate: i due repo sono separati e non
condividono package. Se cambiano sul sito, vanno aggiornate anche qui a mano.

## "Recupera la password" — risolto (REG-485)

Il link esisteva nel design ma la web app non aveva un flusso di recupero, e
puntava a `reglo.it/assistenza`. Dal **2026-09-19** porta a
`/[locale]/reset-password`, una pagina vera che riusa
`lib/auth/password-reset.ts` — vedi [password-reset.md](password-reset.md).
Si porta dietro l'email già digitata nel form.

## Connections

- → **Auth & RBAC**: usa `signInWithCredentials` (`lib/actions/user.actions.ts`)
  e `auth()`; logica di sessione, `activeCompanyId` e redirect a
  `/select-company` per membership multiple **invariata** dal redesign.
- → **Users Directory**: lo stato "account senza autoscuola" mostra `signOutUser`
  + link a `/sign-up`.
- → **Password Reset** (`password-reset.md`): "Recupera la password" porta a
  `/[locale]/reset-password`, che usa lo stesso guscio e gli stessi pezzi di
  form. Toccando `auth-shell.tsx` o `auth-form-ui.tsx` si cambiano entrambe le
  pagine.
- → **Sito marketing (`reglo-landing`)**: dipendenza **bidirezionale** — il sito
  linka qui (`LOGIN_URL = https://app.reglo.it/sign-in` in `src/site/routes.ts`,
  con `/accedi` che ci redirige), e questa pagina rimanda al sito
  ("Scopri Reglo"). Un cambio di dominio va propagato a `marketing-links.ts`.
- → **E2E**: `tests/e2e/login-stato-client.spec.ts` guida questo form
  (`getByLabel`, bottone "Accedi"). Vedi il vincolo sugli aria-label sopra.
- → **Design System**: la pagina usa valori **presi dal design marketing**, non i
  token `PROTO_*` di `components/ui/proto-styles.ts` (radius 12 vs 10, input più
  alti). È un'eccezione voluta e circoscritta a questa pagina.
- → **Font**: l'app usa Figtree (`app/[locale]/layout.tsx`), il marketing un
  altro font. Differenza **nota e accettata** (decisione 2026-09-17): allinearli
  è un cambio globale, non del solo login.
