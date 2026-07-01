# CLAUDE.md — Reglo (Web + Backend)

## Commands

| Command | Purpose |
|---------|---------|
| `pnpm dev` | Dev server + Trigger.dev worker (uses `.env.dev`) |
| `pnpm build` | Production build (dev env) |
| `pnpm build:prod` | Production build (prod env) |
| `pnpm lint` | ESLint |
| `pnpm test` | All Jest tests (unit + integration) |
| `pnpm test:unit` | Unit tests only |
| `pnpm test:integration` | Integration tests (runs in band) |
| `pnpm test:e2e` | Playwright E2E tests |
| `pnpm migrate:dev` | Prisma migrate (dev DB) |
| `pnpm migrate:prod` | Prisma migrate deploy (prod DB) |
| `pnpm studio:dev` | Prisma Studio (dev DB) |
| `pnpm studio:prod` | Prisma Studio (prod DB — read with care) |
| `pnpm db:dev:query "<SQL>"` | Read-only SQL query against dev DB |
| `pnpm db:prod:query "<SQL>"` | Read-only SQL query against prod DB |
| `pnpm trigger:deploy:dev` | Deploy Trigger.dev workflows (dev) |
| `pnpm trigger:deploy:prod` | Deploy Trigger.dev workflows (prod) |

After schema changes: `npx prisma generate`

## Git flow & Staging

Ambienti: **dev** (locale, `.env.dev`) → **staging** (branch `staging` → `staging.reglo.it`, DB Neon dedicato, `APP_ENV=staging` = invii esterni no-op, **CONDIVISO** con gli altri dev) → **prod** (`main` → `app.reglo.it`). Lavori grossi: **feature branch dedicato su entrambi i repo** (`reglo` + `reglo-mobile`), mai diretto su `main` finché non finito/approvato.

Flusso pre-rilascio (regola d'oro: `staging` è condiviso → **non shippare a freddo**):
1. `git fetch origin && git merge origin/staging` **nel tuo branch** → allinea migrazioni/commit altrui, risolvi conflitti.
2. `pnpm ship:staging` (merge feature→staging + push, Vercel rideploya) → `pnpm migrate:staging` se ci sono migrazioni nuove.
3. QA su `staging.reglo.it`.
4. Rilascio prod (solo con OK utente): merge → `main`, `pnpm migrate:prod`, `pnpm trigger:deploy:prod` se cambiano i job; mobile via OTA.

Dettagli: [docs/architecture/git-flow.md](docs/architecture/git-flow.md) · staging operativo (account test, comandi, accesso): [docs/STAGING.md](docs/STAGING.md). Nuova integrazione "che invia" → guardala con `externalSendsDisabled()`.

## Conventions

- TypeScript strict mode, 2-space indentation
- `@/*` path alias for all imports
- Server actions (`"use server"`) for mutations, server components for data fetching
- Zod for input validation, `formatError()` for error responses
- Kebab-case file names, PascalCase component exports
- Short imperative commit messages, single-change scope
- UI: Radix UI + Tailwind CSS 4 + CVA. Colors: 70% neutrals, 20% pink (`#EC4899`), 10% yellow (`#FACC15`)
- Icons: `@tabler/icons-react` and `lucide-react`
- Env: `.env.dev`, `.env.staging`, `.env.prod` via `DOTENV_CONFIG_PATH`. Never commit `.env.*`. Staging = isolated DB + `APP_ENV=staging` (external sends no-op). See `docs/architecture/environments.md`.
- Run `pnpm lint` before PRs

## Documentation

All feature and architecture docs are in `docs/`. Read `docs/INDEX.md` to find the relevant feature.

**Design system:** `docs/design-system.md` — CSS variables, Tailwind tokens, shadows, typography classes, component catalog. Read before any UI work.

### Action Flows

#### CREATE a new feature
1. Read `docs/INDEX.md` — check if a related feature already exists
2. Read `docs/impact-map.md` — identify which existing features your new feature will connect to
3. Read connected feature docs in `docs/features/` — understand interfaces and patterns
4. Implement the feature following existing patterns
5. Create `docs/features/<new-feature>.md` — document files, models, functions, connections
6. Update `docs/INDEX.md` — add the new feature entry
7. Update `docs/impact-map.md` — add connections from/to existing features

#### MODIFY an existing feature
1. Read `docs/INDEX.md` — find the feature file
2. Read `docs/features/<feature>.md` — understand all files involved
3. Read `docs/impact-map.md` — find connected features
4. Read each connected feature doc — understand what might break
5. Make the change
6. Verify connected features still work (check imports, types, function signatures in connected files)
7. Update `docs/features/<feature>.md` if the change alters files, models, or behavior

#### DELETE / REMOVE a feature
1. Read `docs/features/<feature>.md` — list ALL files involved
2. Read `docs/impact-map.md` — find ALL features that depend on this one
3. Read each connected feature doc — plan how to remove dependencies
4. Remove the feature code
5. Update connected features to remove references
6. Delete `docs/features/<feature>.md`
7. Update `docs/INDEX.md` and `docs/impact-map.md`

## Debugging on the production database

For investigating bugs reported by real autoscuole, query prod read-only:

```bash
# Inline query
pnpm db:prod:query "SELECT id, name, email FROM \"User\" WHERE email LIKE '%@reglo.it' LIMIT 5"

# From a file
pnpm db:prod:query --file scripts/queries/find-stale-appointments.sql
```

`scripts/db-query.mjs` enforces a leading-keyword guard: only `SELECT`, `WITH`, `EXPLAIN`, `SHOW` are allowed. `INSERT/UPDATE/DELETE/DROP/...` are refused with a clear error. Output is JSON (BigInt serialised as string) plus a row count on stderr.

For visual browsing of prod (read AND edit — use with care): `pnpm studio:prod`. Avoid edits unless explicitly told to do so by the user.

**When debugging on prod:**
1. Start by identifying the company: `pnpm db:prod:query "SELECT id, name FROM \"Company\" WHERE name ILIKE '%<keyword>%'"`.
2. Scope every follow-up query by `companyId` to avoid cross-tenant leakage in your reasoning.
3. Never propose or run a write against prod without showing the SQL to the user first and getting an explicit go-ahead.

## Agent Instructions

- Before planning, ask relevant technical questions to remove ambiguity.
- Organize plans into independent high-level steps.
- When backend changes require running scripts or migrations, explicitly say so.
- **Always follow the Action Flows above. Always consult docs/impact-map.md before completing a change.**
