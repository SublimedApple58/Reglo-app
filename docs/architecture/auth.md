# Auth & RBAC

## Web auth
- NextAuth 5 (beta), JWT strategy, 30-day token lifetime
- Credentials provider (email/password)
- Auto-provisioned global admin from env vars
- Route protection: regex in `auth.config.ts`
- Config: `auth.ts`, `auth.config.ts`

## Mobile auth
- Long-lived `MobileAccessToken` (separate from NextAuth)
- `lib/mobile-auth.ts` — token creation, validation
- `lib/mobile-auth-payload.ts` — `buildMobileAuthPayload(user)` shared by login + reset confirm
- JWT via `Authorization` header, company via `x-reglo-company-id` header
- Password reset (mobile): OTP via email — see [password-reset.md](../features/password-reset.md)

## Admin auth
- `lib/backoffice-auth.ts` — separate auth for backoffice

## Service access
- `lib/service-access.ts` — `requireServiceAccess("AUTOSCUOLE")` returns membership with companyId, userId, role, autoscuolaRole
- Used in every action as first auth check

## Roles
- `CompanyMember.role`: admin, member
- `CompanyMember.autoscuolaRole`: OWNER, INSTRUCTOR_OWNER, INSTRUCTOR, STUDENT
- Helpers: `isOwner()`, `isInstructor()` in `lib/autoscuole/roles.ts`
- Per-student flags: `bookingBlocked`, `weeklyBookingLimitExempt`, `assignedInstructorId`

## Web app: solo admin / istruttori admin
- La web app (tutto sotto `/[locale]/user/*`) è **riservata a OWNER e INSTRUCTOR_OWNER**.
- Gate in `app/[locale]/user/layout.tsx` → `requireCompanyAdmin(locale)` (`membership.role === 'admin'`, cioè OWNER/INSTRUCTOR_OWNER). Allievi e istruttori "semplici" (STUDENT/INSTRUCTOR) vengono reindirizzati a `/[locale]/unauthorized`.
- `app/[locale]/unauthorized/page.tsx` — schermata "Accesso riservato" brandizzata (in italiano), personalizzata con nome+ruolo quando disponibili, con logout (`signOutUser`) e rimando all'app mobile. Loro usano l'app mobile Reglo.

## Stato client dopo il login (REG-466)

Il login è una **server action** (`signInWithCredentials` → `signIn(..., { redirectTo })`): il redirect è una navigazione del router, **non** un ricaricamento. Tutto ciò che è montato sopra la rotta sopravvive al cambio di account, quindi lo stato client va costruito per-richiesta, non una volta sola.

- **Store jotai**: `components/providers/jotai-store.provider.tsx` crea uno store dedicato dentro `AuthDataProvider`. Senza Provider jotai usa lo store di modulo: sul server è **uno per processo** (la prima richiesta lo idratava e tutte le altre renderizzavano l'HTML con l'azienda di qualcun altro), sul client sopravvive al logout. **Non aggiungere atom condivisi fuori da `AuthDataProvider`**: leggerebbero lo store di default e tornerebbero al vecchio comportamento.
- **Sessione**: i layout autenticati (`user/(autoscuole)`, `admin`, `user/(sidebar)`) passano `initialSession` (da `auth()`) e `initialCompany`/`initialCompanies` (da `getCompanyContext()`) ad `AuthDataProvider`. `UserDataProvider` idrata `userSessionAtom` col dato del server e **ignora un `null` di `useSession()`** quando il server dice che la sessione c'è: la cache di next-auth può essere ancora quella della pagina di accesso. Una volta sola chiama `update()` per riallinearla, così anche chi usa `useSession()` direttamente vede la sessione giusta.
- **Cambio azienda a provider montato**: `useHydrateAtoms` idrata un atom una volta sola per store, quindi `CompanyDataProvider` riscrive l'atom quando il server manda un'azienda con id diverso.

Copertura: `tests/e2e/login-stato-client.spec.ts` (hamburger presente senza ricaricare; account consorzio subito dopo un account autoscuola).
