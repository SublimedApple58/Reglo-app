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
| `pnpm trigger:deploy:dev` | Deploy Trigger.dev workflows (dev) |
| `pnpm trigger:deploy:prod` | Deploy Trigger.dev workflows (prod) |

After schema changes: `npx prisma generate`

## Conventions

- TypeScript strict mode, 2-space indentation
- `@/*` path alias for all imports
- Server actions (`"use server"`) for mutations, server components for data fetching
- Zod for input validation, `formatError()` for error responses
- Kebab-case file names, PascalCase component exports
- Short imperative commit messages, single-change scope
- UI: Radix UI + Tailwind CSS 4 + CVA. Colors: 70% neutrals, 20% pink (`#EC4899`), 10% yellow (`#FACC15`)
- Icons: `@tabler/icons-react` and `lucide-react`
- Env: `.env.dev` and `.env.prod` via `DOTENV_CONFIG_PATH`. Never commit `.env.*`
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

## Agent Instructions

- Before planning, ask relevant technical questions to remove ambiguity.
- Organize plans into independent high-level steps.
- When backend changes require running scripts or migrations, explicitly say so.
- **Always follow the Action Flows above. Always consult docs/impact-map.md before completing a change.**
