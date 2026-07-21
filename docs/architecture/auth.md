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
