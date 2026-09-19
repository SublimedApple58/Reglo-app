# Password Reset (web + mobile, OTP via email)

Recupero password self-service, valido per **ogni ruolo** (allievo, istruttore,
titolare — sono tutti record `User`). Flusso: email → codice di 6 cifre via
email → nuova password → **login automatico**. Niente SMS, niente deep-link.

Nato sul mobile; dal **2026-09-19** (REG-485) esiste anche sul **web**
(`/[locale]/reset-password`). I due canali condividono lo stesso cuore, quindi
la policy di sicurezza è scritta una volta sola.

## Files

| File | Ruolo |
|------|------|
| `prisma/schema.prisma` → `PasswordResetCode` | Una riga per codice emesso: `userId`, `codeHash`, `attempts`, `expiresAt`, `consumedAt`. Relazione su `User.passwordResetCodes`. |
| `lib/auth/password-reset.ts` | **Cuore condiviso.** Policy + `requestPasswordResetCode`, `checkPasswordResetCode`, `applyNewPassword` (e i mattoni `generateOtpCode`, `createResetCode`, `findValidResetCode`, `canRequestResetCode`). |
| `lib/validators.ts` | `passwordResetRequestSchema`, `passwordResetVerifySchema`, `passwordResetConfirmSchema` (usati dalle route mobile). |
| `email/index.tsx` → `sendDynamicEmail` | Consegna l'email col codice (Resend). |

### Mobile (API)

| File | Ruolo |
|------|------|
| `app/api/mobile/auth/password-reset/request/route.ts` | Manda il codice. |
| `app/api/mobile/auth/password-reset/verify/route.ts` | Controllo morbido del codice (NON lo consuma). |
| `app/api/mobile/auth/password-reset/confirm/route.ts` | Imposta la password, consuma il codice, revoca le sessioni, auto-login. |
| `lib/mobile-auth-payload.ts` | `buildMobileAuthPayload(user)` — `AuthPayload` completo, **condiviso** con il login. |

### Web (pagina + server action)

| File | Ruolo |
|------|------|
| `app/[locale]/(signin)/reset-password/page.tsx` | Server component: rimanda alla home chi è già loggato, poi il guscio a due colonne. |
| `app/[locale]/(signin)/reset-password/reset-password-form.tsx` | Client: i tre passi (email → codice → password), cooldown del "Invia di nuovo", "Cambia email". |
| `lib/actions/password-reset.actions.ts` | `sendPasswordResetCode`, `verifyPasswordResetCode`, `completePasswordReset` — involucro da server action + messaggi in italiano. |
| `lib/constants/index.ts` → `publicRoutes` | `/reset-password` è pubblica: ci arriva chi NON è loggato. |

## Policy (costanti in `lib/auth/password-reset.ts`)

- Codice: 6 cifre numeriche, salvato **solo** come `hash(code)` (HMAC-SHA256 via `lib/encrypt.ts`).
- TTL: **15 min**. Massimo **5** verifiche sbagliate → codice bruciato.
- Rate limit: 60s di cooldown fra due invii + massimo 5 richieste / 15 min per utente.

## Scelte di sicurezza

- **Nessuna enumerazione degli account**: la richiesta risponde sempre lo stesso
  messaggio generico; l'email parte in `after()` così la latenza è uniforme
  (niente oracolo sui tempi). Vale identico su web e mobile.
- **Revoca delle sessioni**: `applyNewPassword` cancella **tutti** i
  `MobileAccessToken` dell'utente. Chi era entrato con la vecchia password deve
  rifare l'accesso, ovunque.
- `checkPasswordResetCode` non consuma mai il codice (così il passo password si
  può ritentare); il consumo avviene solo in `applyNewPassword`, nella stessa
  transazione che scrive la password.
- Sul web il codice viene **ricontrollato** al passo 3: fra il passo 2 e il
  salvataggio possono passare minuti, e solo quel controllo è quello che conta.

## Contratto (mobile)

- `request` / `verify` → `{ success: true, message? }` (niente `data`).
- `confirm` → `{ success: true, data: AuthPayload }` (auto-login) OPPURE
  `{ success: true, message }` quando l'utente non ha nessuna autoscuola.
- Codice sbagliato/scaduto → `400 "Codice non valido o scaduto."`

## Comportamento del web

- Il link "Recupera la password" del login porta qui e **si porta dietro
  l'email** già digitata (`?email=`).
- Dopo il salvataggio l'utente **entra da solo** (`signIn('credentials')` con la
  password appena scelta); con più autoscuole va a `/select-company`, come il
  login normale. Se il login automatico fallisce, la password è comunque
  cambiata e la pagina lo dice rimandando all'accesso.
- Il campo del codice accetta solo cifre e le taglia a sei **dopo** aver tolto
  il resto: un codice incollato con uno spazio dentro non viene mutilato.

## Test

- **Unitari** — `tests/unit/auth/password-reset.test.ts` (13): invio solo a
  utenti esistenti, normalizzazione email, cooldown e tetto per finestra, codice
  nuovo che brucia il precedente, conteggio tentativi, scadenza, codice di un
  altro account, transazione del cambio password con revoca sessioni.
- **E2E** — `tests/e2e/reset-password.spec.ts`: percorso dal login, risposta
  identica per un'email sconosciuta, codice sbagliato rifiutato, "Cambia email".
  Non arriva al cambio password (il codice in chiaro vive solo nell'email):
  quella parte è coperta dai test unitari e da una verifica manuale su dev.

## Connections

- **Mobile**: consumato da `reglo-mobile` `PasswordResetScreen` (vedi il suo
  `docs/features/password-reset.md`). La forma di `AuthPayload` deve restare
  allineata.
- **Login web** (`login-web.md`): il link di recupero, il guscio `auth-shell` e
  i pezzi di form condivisi (`auth-form-ui`).
- **Auth & RBAC** (`architecture/auth.md`): riusa `MobileAccessToken`,
  `issueMobileToken`, `hash`/`compare`, `getOrCreateInstructorForUser`; sul web
  riusa `signIn('credentials')`.
