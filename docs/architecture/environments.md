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

## `DATABASE_URL` vs `DIRECT_URL` — il pooler non tocca le migrazioni

Regola, in ogni ambiente: **`DATABASE_URL` = endpoint POOLED** (`ep-xxx-pooler.…`,
l'app apre tante connessioni corte), **`DIRECT_URL` = endpoint DIRETTO**
(`ep-xxx.…`, senza `-pooler`). È il motivo per cui il datasource Prisma ha
`directUrl` accanto a `url`.

**Cosa succede se `DIRECT_URL` passa dal pooler** (capitato su `.env.prod`, il
19/09/2026): `prisma migrate` prende un **advisory lock di sessione**
(`pg_advisory_lock(72707369)`) per impedire due migrazioni insieme. Il pooler
Neon è pgbouncer in *transaction pooling*, dove lo stato di sessione appartiene
alla connessione **server**, non al client: finita la transazione quella
connessione torna nel pool **col lock ancora in mano**, e l'`unlock` di Prisma
finisce su un'altra connessione senza liberare niente. Il lock resta appeso a un
backend che intanto serve traffico dell'app, e la migrazione successiva — di
chiunque, anche da un altro branch o da un altro dev — si pianta con **P1002**.

Sintomo da cercare quando una migrazione non parte:

```bash
pnpm db:prod:query "SELECT l.pid, l.objid, a.state, a.application_name
  FROM pg_locks l JOIN pg_stat_activity a ON a.pid = l.pid
  WHERE l.locktype = 'advisory'"
```

Una riga con `objid = 72707369` e `application_name = pgbouncer` è il lock
orfano. **Non terminare il backend alla cieca**: è una connessione viva del
pool, spesso a metà del lavoro. Termina solo quella che tiene il lock **ed è
`idle`**, così nessun client la sta usando in quel momento:

```bash
pnpm db:prod:query "SELECT a.pid, pg_terminate_backend(a.pid)
  FROM pg_stat_activity a
  JOIN pg_locks l ON l.pid = a.pid AND l.locktype='advisory' AND l.objid=72707369
  WHERE a.state = 'idle' AND a.application_name = 'pgbouncer'"
```

**Prevenzione**: `scripts/check-direct-url.mjs` gira davanti a ogni
`pnpm migrate:dev|staging|prod` e blocca la migrazione se `DIRECT_URL` manca,
contiene `-pooler` o è identica a `DATABASE_URL`. Serve perché la dashboard Neon
propone l'URL **pooled** come connection string di default: chi rigenera le
credenziali se lo ritrova in entrambe le variabili senza accorgersene.

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
