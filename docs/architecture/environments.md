# Environments (dev / staging / prod)

Reglo web has three environments, selected by `DOTENV_CONFIG_PATH=.env.<env>` +
`NODE_OPTIONS=--require=dotenv/config` (see the `*:dev` / `*:staging` / `*:prod`
scripts in `package.json`).

| Env | Where | DB (Neon) | URL | External sends |
|-----|-------|-----------|-----|----------------|
| **dev** | local (`pnpm dev`) | dev | `localhost:3000` | real (to dev devices/test contacts) |
| **staging** | Vercel `reglo-staging` (branch `staging`) | **separate** | `reglo-staging.vercel.app` | **disabled** (no-op) |
| **prod** | Vercel `reglo` (branch `main`) | prod | `app.reglo.it` | real |

## The `APP_ENV` flag + external-send kill switch

`lib/app-env.ts` exposes `APP_ENV` (`"dev" | "staging" | "prod"`) and
`externalSendsDisabled()`. Set `APP_ENV=staging` in `.env.staging`. When unset
the app behaves as production (sends ON) — so dev/prod are never silently muted.

On **staging** (or with `DISABLE_EXTERNAL_SENDS=1`) every real outbound
integration is a **no-op**, so QA on a copied DB never reaches real users:
- **Email** — guarded centrally in `email/index.tsx` (`getResend()` returns a stub).
- **Push** — `lib/autoscuole/push.ts` (`sendAutoscuolaPushToUsers` returns a zero result).
- **WhatsApp/SMS** — `lib/autoscuole/whatsapp.ts` (`sendAutoscuolaWhatsApp` returns early).
- **Fatture in Cloud** — `lib/integrations/fatture-in-cloud.ts` (`getFicConnection` throws the "not connected" error → the existing graceful `issued_stripe` fallback runs; no real invoice).
- **Voice (Telnyx)** and **cron jobs (Trigger.dev)** are naturally inert on staging: no phone number points to the staging URL, and the Trigger worker is **not deployed** for staging.

> When adding a NEW real-send integration, guard its entrypoint with
> `externalSendsDisabled()` from `lib/app-env.ts`.

## Pre-release flow

`feature/*` → merge into **`staging`** → QA on `reglo-staging.vercel.app` →
merge into **`main`** (prod). DB migrations: `pnpm migrate:staging` before/at the
staging deploy; `pnpm migrate:prod` at the prod release.

## `.env.staging` — required keys (local file, never committed; `.env*` is gitignored)

Mirror `.env.prod`, then OVERRIDE these for isolation/safety:

```
APP_ENV=staging

# Separate Neon staging DB (pooled + direct)
DATABASE_URL=postgres://...staging-pooler...
DIRECT_URL=postgres://...staging-direct...

# Staging URLs (Vercel auto domain — no DNS)
NEXT_PUBLIC_SERVER_URL=https://reglo-staging.vercel.app
NEXTAUTH_URL=https://reglo-staging.vercel.app
NEXTAUTH_URL_INTERNAL=https://reglo-staging.vercel.app

# Stripe TEST mode (test keys + a staging webhook endpoint secret)
STRIPE_SECRET_KEY=sk_test_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...   # from a Stripe test webhook → /api/webhooks/stripe

# Redis: separate Upstash instance (recommended) or share dev
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...

# Everything else (R2, OpenAI, Google Maps, Notion, encryption keys, etc.):
# copy from .env.prod. External sends are disabled by APP_ENV=staging anyway, so
# Telnyx/Twilio/Resend/Fatture keys can stay as prod's — they are never called.
```

Shared-safe in staging (no per-env instance needed): R2 (same bucket, `staging/`
prefix if desired), OpenAI, Google Maps, Notion. Disabled by the flag (keys
irrelevant): Telnyx, Twilio, Resend, Fatture in Cloud.

## NOT covered (full isolation — future, requires dashboard/DNS/OAuth by the owner)

Real voice (separate Telnyx app + AI assistant + Railway voice-runtime), real
SMS/WhatsApp (separate Twilio), inbound email (Resend + MX on a staging
subdomain), real invoices (Fatture in Cloud sandbox + OAuth), a custom
`staging.reglo.it` domain (DNS).
