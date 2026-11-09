# Allievo con telefono + password (richiesta Ricca)

L'autoscuola può creare un allievo con **solo telefono + password**, senza email: l'allievo entra subito nell'app col numero.

> Stato (09/11/2026, branch `feat/allievo-telefono`, NON in staging né in prod): backend, web e app fatti e provati in locale. Decisione Tiziano: **nessun codice di verifica**, l'allievo si riconosce dal numero al «Primo accesso».

## Modello
- `User.loginPhone` — numero con cui l'utente **accede**, sempre E.164 (`+393331234567`), `@unique`. Distinto da `User.phone` (recapito: non unico, in prod spesso senza prefisso). Valorizzato solo per gli account creati con l'accesso col telefono; gli account esistenti non lo hanno.
- `User.birthDate` (`DATE`) e `User.profileCompletedAt` — per l'onboarding del primo accesso (non ancora usati).
- Migrazione `20261111090000_user_login_phone`: solo colonne nullable + indice unico.
- Email: resta il **segnaposto** `allievo+<uuid>@no-app.reglo.local` di `lib/users/placeholder-email.ts` finché l'allievo non ne mette una sua.

## File
- `lib/users/login-phone.ts` — `isPhoneIdentifier` (niente `@` = telefono), `normalizeLoginPhone` (su `normalizeToE164`: `333…`, `+39 333…`, `0039 333…`, `39333…` → stesso E.164; estero solo col `+`).
- `lib/actions/user.actions.ts` `createCompanyUser` — nuovo `loginWithPhone`: solo `STUDENT`, telefono valido, password facoltativa (≥ 6 se c'è), numero non già usato come `loginPhone` («Questo numero è già usato per accedere da un altro account»). Email facoltativa.
- `app/api/mobile/auth/login/route.ts` — il campo `email` accetta anche un telefono: senza `@` cerca per `loginPhone`. Funziona con le app già installate (2.4.0/2.4.2), nessun force-update.
- `lib/account-deletion.ts` — l'anonimizzazione azzera anche `loginPhone` (il numero torna libero).
- `email/index.ts` `sendDynamicEmail` — scarta i destinatari `*.reglo.local` (segnaposto e account eliminati, `isUndeliverableEmail`); se non resta nessuno l'invio salta. Prima diversi chiamanti (`notify.ts`, `communications.ts`, `payments.ts`…) mandavano a `@no-app.reglo.local`.
- Test: `tests/unit/users/login-phone.test.ts`.

## Primo accesso (lib/auth/first-access.ts)
- `POST /api/mobile/auth/first-access/start` `{ phone }` → se c'è un allievo con quel `loginPhone`, **mai attivato** (`password` e `profileCompletedAt` nulli) e con membership STUDENT: permesso firmato HMAC (`NEXTAUTH_SECRET`, 30 min, nessuna tabella) + nome, cognome, numero, autoscuola. Altrimenti 404 con un messaggio unico (numero inesistente, non valido o già attivato).
- `POST /api/mobile/auth/first-access/complete` `{ activationToken, firstName, lastName, email, password, birthDate }` (`firstAccessCompleteSchema`: email valida, password ≥ 6, nascita 14–100 anni) → `releaseEmailIfOrphaned`, poi `updateMany` condizionato a `password: null` (due attivazioni concorrenti: vince una sola) → `name`, `email`, `password`, `birthDate`, `profileCompletedAt`; risponde `buildMobileAuthPayload` (sessione aperta).
- Login mobile: numero di un account mai attivato → 401 `code: "ACTIVATION_REQUIRED"`, l'app apre il primo accesso.
- Limiti (`lib/auth/rate-limit.ts`, Upstash Redis INCR+EXPIRE, senza Redis lascia passare): start 5/15 min per numero e 20/15 min per IP; complete 20/15 min per IP.
- ⚠️ **Senza codice**: chi conosce il numero di un allievo non ancora attivato può attivarlo al posto suo, e il fatto che il flusso prosegua rivela che il numero esiste. Mitigazioni: solo account mai attivati, limiti, risposta generica, stato visibile al titolare.
- Test: `tests/unit/auth/first-access.test.ts`.

## Web — dialog «Nuovo allievo» e stato del primo accesso
- `AutoscuoleStudentsPage.tsx` (vista non ridotta): sotto nome e cognome «Accesso all'app» = `SegmentedControl` **Telefono** (predefinito) | **Email e password**.
  - Telefono: solo numero (con «Accederà con +39 …», `CreateLoginPhoneHint`) + consenso WhatsApp → `createCompanyUser({ phone, loginWithPhone: true, whatsappConsent })`, account senza email vera né password.
  - Email e password: il modo classico di prima.
- Il titolare vede l'attivazione: `toStudentProfile` aggiunge `loginPhone` e `activatedAt` (da `profileCompletedAt`) per gli allievi creati col telefono, e nasconde le email segnaposto (`displayEmail`). Scheda allievo → riga «Accesso all'app»: «Primo accesso non ancora fatto» (con il numero da usare) o «Attivato il 9 novembre 2026». Lista → il cellulare barrato esistente (`NeverAccessedListMark`) ha il testo «Primo accesso non ancora fatto…».
- La vista ridotta (affiliate) non cambia.

## Limiti noti
- Login web (NextAuth) solo email: gli allievi usano l'app.
- Recupero password dall'app: si può scrivere email o telefono; il codice parte sempre all'email vera dell'account (`findResetAccount` in `lib/auth/password-reset.ts`). Senza email vera (attivazione non fatta) non parte niente, risposta identica (niente enumerazione).
