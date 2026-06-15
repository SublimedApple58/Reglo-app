# Password Reset (mobile, OTP via email)

Self-service password reset for the mobile app, valid for **every role** (student,
instructor, owner) — they are all `User` records. Flow: email → 6-digit OTP via
email → new password → **auto-login**. No SMS, no deep-link.

## Files

| File | Role |
|------|------|
| `prisma/schema.prisma` → `PasswordResetCode` | One row per issued code: `userId`, `codeHash`, `attempts`, `expiresAt`, `consumedAt`. Relation on `User.passwordResetCodes`. |
| `lib/auth/password-reset.ts` | `generateOtpCode`, `createResetCode`, `findValidResetCode`, `canRequestResetCode` + policy constants. |
| `lib/mobile-auth-payload.ts` | `buildMobileAuthPayload(user)` — assembles the full `AuthPayload` (memberships, signed logos, fresh token, instructor id). **Shared** by login + reset confirm. |
| `app/api/mobile/auth/password-reset/request/route.ts` | Sends the code (in `after()`). |
| `app/api/mobile/auth/password-reset/verify/route.ts` | Soft-checks the code (does NOT consume). |
| `app/api/mobile/auth/password-reset/confirm/route.ts` | Sets password, consumes code, revokes other sessions, auto-login. |
| `lib/validators.ts` | `passwordResetRequestSchema`, `passwordResetVerifySchema`, `passwordResetConfirmSchema`. |
| `email/index.tsx` → `sendDynamicEmail` | Delivers the code email (Resend). |

## Policy (constants in `lib/auth/password-reset.ts`)

- Code: 6 numeric digits, stored only as `hash(code)` (HMAC-SHA256 via `lib/encrypt.ts`).
- TTL: **15 min**. Max **5** wrong verifications → code burned.
- Rate limit: 60s resend cooldown + max 5 requests / 15 min per user.

## Security decisions

- **No account enumeration**: `request` always returns the same generic 200
  message; the email is sent in `after()` so latency is uniform (no timing oracle).
- **Session revocation**: `confirm` `deleteMany` all `MobileAccessToken` for the
  user, then issues a fresh one → other devices must re-auth.
- `verify` never consumes the code (so the user can retype the password step);
  `confirm` re-checks and consumes atomically in a `$transaction`.

## Contract (mobile)

- `request` / `verify` → `{ success: true, message? }` (no `data`).
- `confirm` → `{ success: true, data: AuthPayload }` (auto-login) OR
  `{ success: true, message }` when the user has no company membership.
- Wrong/expired code → `400 "Codice non valido o scaduto."`

## Connections

- **Mobile**: consumed by `reglo-mobile` `PasswordResetScreen` (see its
  `docs/features/password-reset.md`). `AuthPayload` shape must stay in sync.
- **Auth & RBAC** (`architecture/auth.md`): reuses `MobileAccessToken`,
  `issueMobileToken`, `hash`/`compare`, `getOrCreateInstructorForUser`.
