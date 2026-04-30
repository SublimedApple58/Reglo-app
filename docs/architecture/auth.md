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
- JWT via `Authorization` header, company via `x-reglo-company-id` header

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
