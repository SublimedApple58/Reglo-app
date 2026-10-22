# Backoffice — accesso personale (REG-413, fase 0)

Fino al REG-413 il backoffice aveva **una sola credenziale condivisa** con una
password di riserva scritta nel codice. Ora ogni persona entra con la propria
email Reglo e la propria password; nel codice non c'è più nessuna password.

## Chi ha accesso

Tabella `BackofficeAdmin`, popolata dalla migrazione
`20261025120000_backoffice_admins` (Tiziano Di Felice, Gabriele Ruzzu). Per
aggiungere/togliere persone: `scripts/backoffice-admin.ts` (`add`, `disable`,
`enable`, `list`). Non c'è (ancora) una schermata per gestirle.

## Flussi

| Flusso | Dove | Note |
|---|---|---|
| Primo accesso / password dimenticata | `/[locale]/backoffice-sign-in` → «Primo accesso o password dimenticata?» | Link monouso, 30 min, alla mail della persona. Risposta identica per email abilitate e non. Max 3 link/15 min, 60 s tra un invio e l'altro. |
| Scelta password | `/[locale]/backoffice-sign-in/attiva?t=…` | Min 12 caratteri, niente nome/«reglo». Il link si consuma solo al salvataggio (consumo condizionato: due invii simultanei non passano). Chiude tutte le sessioni aperte della persona, poi entra. |
| Login | stessa pagina | 5 errori di fila → blocco 15 min. Tempo di risposta uguale per email inesistenti (scrypt fittizio). |
| Logout | «Esci» nell'header | Cancella la riga di sessione, non solo il cookie. |
| Recupero d'emergenza | `scripts/backoffice-admin.ts link --email=… --out=file` | Se la mail non arriva. Su prod serve `--prod`. |

## Sicurezza

- Password: **scrypt** (N=16384, r=8, p=1) con sale proprio, formato
  `scrypt$<salt>$<hash>` — NON `lib/encrypt.ts` (HMAC veloce, va bene per codici
  a scadenza, non per password che vivono anni).
- Token di sessione e link: 32 byte casuali; sul DB solo lo SHA-256.
- Cookie `reglo_backoffice_session` (httpOnly, sameSite lax, secure in prod), 7 giorni.
- La mail di accesso parte **anche su staging** (`sendDynamicEmail({ internalStaffOnly: true })`):
  il kill switch di staging esiste per non scrivere ai clienti, e l'eccezione
  vale solo se TUTTI i destinatari sono `@reglo.it` (controllo dentro `email/index.ts`).

## Vecchia credenziale condivisa (transizione)

Resta valida **solo se `GLOBAL_ADMIN_PASSWORD` è impostata nell'ambiente**
(cookie `reglo_backoffice_auth`, come prima). Impostata su Vercel `staging` il
2026-10-22 per non chiudersi fuori durante la verifica. Per spegnerla:
togliere la variabile da Vercel e ridistribuire — nessuna modifica di codice.
Quando si entra così l'header mostra «Accesso condiviso».

Tolte nello stesso giro due scorciatoie che, con quella credenziale, creavano
al volo un utente `admin` se non esisteva (`auth.ts` web e
`app/api/mobile/auth/login/route.ts`): su prod l'utente esisteva già, erano
codice morto ma una porta aperta.

## File

| File | Ruolo |
|---|---|
| `prisma/schema.prisma` → `BackofficeAdmin`, `BackofficeAdminToken`, `BackofficeSession` | Persone, link monouso, sessioni |
| `lib/backoffice/admin-credentials.ts` | Puro: scrypt, token, policy, regole password (testato in `tests/unit/backoffice-admin-credentials.test.ts`) |
| `lib/backoffice/admin-access.ts` | Login con blocco, richiesta link + email, verifica/consumo link |
| `lib/backoffice-auth.ts` | Cookie e sessioni; `getBackofficeIdentity()` (personale o condivisa), `validateBackofficeCookie()` |
| `lib/auth-guard.ts` → `requireGlobalAdmin` | Invariato: usa `validateBackofficeCookie()` |
| `lib/actions/backoffice-access.actions.ts` | `backofficeSignIn`, `backofficeSignOut`, `requestBackofficeLink`, `completeBackofficeLink`, `getBackofficeWhoAmI` |
| `app/[locale]/backoffice-sign-in/page.tsx` | Login + richiesta link |
| `app/[locale]/backoffice-sign-in/attiva/` | Scelta password |
| `components/pages/Backoffice/BackofficeAuthShell.tsx` | Guscio comune delle due pagine |
| `components/pages/Backoffice/BackofficeHeader.tsx` | Iniziali + nome di chi è dentro |
| `scripts/backoffice-admin.ts` | Gestione da terminale |
