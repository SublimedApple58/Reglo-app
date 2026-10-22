# Login as admin — impersonazione autoscuola (backoffice)

Pulsante **"Accedi come titolare"** per ogni autoscuola nella lista backoffice: porta l'operatore Reglo dentro la web app **come l'owner reale** di quell'autoscuola, per supporto. **Zero impatto** sull'autoscuola e **nessun account Reglo** nelle loro liste utenti.

## Meccanismo (session-only, nessuno schema DB)
Si entra usando l'account **admin/owner già esistente** dell'autoscuola → invisibile per costruzione (nessuna riga/conteggio/notifica cambia). L'impersonazione è un **grant firmato a scadenza breve** consumato da un secondo provider NextAuth.

1. `lib/impersonation-grant.ts` — `signImpersonationGrant` / `verifyImpersonationGrant`. HMAC-SHA256 su `NEXTAUTH_SECRET` (nessuna env nuova), payload `{ targetUserId, companyId, purpose:"impersonation", iat, exp:+60s }`, confronto timing-safe. Stile `lib/mobile-auth.ts`.
2. `auth.ts` — secondo `CredentialsProvider({ id:"impersonation", credentials:{token} })`. `authorize` verifica il grant e **ri-deriva l'autorità dal DB** (`companyMember.findFirst({ where:{ companyId, userId, role:"admin" } })`); ritorna l'owner reale + i claim `impersonating`/`impersonatingCompanyId`. I callback `jwt`/`session` portano i claim (solo nel cookie dell'operatore).
3. `lib/company-context.ts` — `getActiveCompanyContext` mette `session.impersonation.companyId` in cima alla precedenza dell'`activeCompanyId` (owner multi-company → company giusta) e **NON persiste** `activeCompanyId` durante l'impersonazione (guardie `if (!impersonationCompanyId)` sui due `prisma.user.update`).
4. `lib/actions/backoffice.actions.ts` — `impersonateCompany(companyId)`: `requireGlobalAdmin` → trova l'owner (preferisce `autoscuolaRole:"OWNER"`, fallback qualsiasi `role:"admin"`; se assente → errore, nessun grant) → conia il grant → `signIn("impersonation", { token, redirectTo:"/user/autoscuole" })` (ri-lancia `isRedirectError`).
5. `components/pages/Backoffice/BackofficeCompaniesPage.tsx` — pulsante `LogIn` nella cella azioni (accanto a "Gestisci"), handler con spinner.
6. `types/next-auth.d.ts` — `Session.impersonation?` + JWT `impersonating`/`impersonatingCompanyId`.

## Sicurezza
- Grant coniato **solo** dopo `requireGlobalAdmin`; firmato HMAC; `exp` 60s; `purpose` fisso. `authorize` ri-verifica firma+scadenza **e** ri-deriva dal DB che il target è ancora admin di quella company → hit diretti a `/api/auth/callback/impersonation` sono inutili senza grant valido.
- Invisibilità: si agisce come owner reale → nessuna lista/conteggio/notifica cambia; sessioni JWT stateless (nessuna "sessioni attive" visibile); nessun `lastLogin` su `User`.
- Attore: dal REG-413 il backoffice ha login personali (`getBackofficeIdentity()` in `lib/backoffice-auth.ts`), ma il grant non registra ancora chi impersona.

## Uscita
Nessuna UI dedicata (scelta "minimo"): il **logout normale** dell'app chiude la sessione di impersonazione. Per tornare al backoffice basta andare su `/backoffice` (cookie backoffice ancora valido).

## Verificato (dev)
Backoffice → "Accedi come titolare" su owner diverso (BRUM Milano) e su owner multi-company (Roma centro) → redirect a `/user/autoscuole` come owner; `CompanyMember` count invariato (nessun account nuovo); `activeCompanyId` dell'owner multi-company **non** riscritto pur atterrando sulla company target.

## Note / estensioni future (10 min)
- Banner "stai operando come <autoscuola> — Esci" (gated su `session.impersonation`) + tabella `AdminImpersonation` per tracciabilità: non inclusi per scelta "minimo".
