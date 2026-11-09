# Allievo con telefono + password (richiesta Ricca)

L'autoscuola può creare un allievo con **solo telefono + password**, senza email: l'allievo entra subito nell'app col numero.

> Stato (09/11/2026, branch `feat/allievo-telefono`): fatto il **backend** (schema, creazione, login). Da fare: dialog web, foglio di creazione nell'app, login «Email o telefono» lato app, onboarding al primo accesso, recupero password senza email.

## Modello
- `User.loginPhone` — numero con cui l'utente **accede**, sempre E.164 (`+393331234567`), `@unique`. Distinto da `User.phone` (recapito: non unico, in prod spesso senza prefisso). Valorizzato solo per gli account creati con l'accesso col telefono; gli account esistenti non lo hanno.
- `User.birthDate` (`DATE`) e `User.profileCompletedAt` — per l'onboarding del primo accesso (non ancora usati).
- Migrazione `20261111090000_user_login_phone`: solo colonne nullable + indice unico.
- Email: resta il **segnaposto** `allievo+<uuid>@no-app.reglo.local` di `lib/users/placeholder-email.ts` finché l'allievo non ne mette una sua.

## File
- `lib/users/login-phone.ts` — `isPhoneIdentifier` (niente `@` = telefono), `normalizeLoginPhone` (su `normalizeToE164`: `333…`, `+39 333…`, `0039 333…`, `39333…` → stesso E.164; estero solo col `+`).
- `lib/actions/user.actions.ts` `createCompanyUser` — nuovo `loginWithPhone`: solo `STUDENT`, telefono valido, password ≥ 6, numero non già usato come `loginPhone` («Questo numero è già usato per accedere da un altro account»). Email facoltativa.
- `app/api/mobile/auth/login/route.ts` — il campo `email` accetta anche un telefono: senza `@` cerca per `loginPhone`. Funziona con le app già installate (2.4.0/2.4.2), nessun force-update.
- `lib/account-deletion.ts` — l'anonimizzazione azzera anche `loginPhone` (il numero torna libero).
- `email/index.ts` `sendDynamicEmail` — scarta i destinatari `*.reglo.local` (segnaposto e account eliminati, `isUndeliverableEmail`); se non resta nessuno l'invio salta. Prima diversi chiamanti (`notify.ts`, `communications.ts`, `payments.ts`…) mandavano a `@no-app.reglo.local`.
- Test: `tests/unit/users/login-phone.test.ts`.

## Limiti noti
- Login web (NextAuth) solo email: gli allievi usano l'app.
- Il recupero password è solo via email: un allievo col solo telefono va aiutato dall'autoscuola finché non inserisce un'email (fase successiva).
