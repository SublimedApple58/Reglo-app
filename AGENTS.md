# Repository Guidelines

## Project Structure & Module Organization
- `app/` contains the Next.js App Router pages, layouts, and route handlers.
- `components/`, `hooks/`, and `lib/` hold shared UI, React hooks, and utilities.
- `db/` and `prisma/` contain database access and schema/migrations.
- `tests/` holds Jest tests; `jest.setup.ts` configures the test environment.
- `public/` and `assets/` store static assets; `email/` contains React Email templates.

## Build, Test, and Development Commands
- `pnpm dev` starts the Next.js dev server.
- `pnpm build` builds the production bundle; `pnpm start` serves it.
- `pnpm lint` runs Next.js ESLint checks.
- `pnpm test` runs Jest once; `pnpm test:watch` runs Jest in watch mode.
- `pnpm email` launches the React Email dev server on port 3001.

## Coding Style & Naming Conventions
- TypeScript with `strict` enabled; keep types explicit for public APIs.
- Use 2-space indentation to match existing TS/JS files.
- Follow Next.js conventions: route folders in `app/`, React components in `components/`.
- Prefer `@/*` imports for workspace paths (see `tsconfig.json`).
- Run `pnpm lint` before opening a PR.

## Testing Guidelines
- Jest + `ts-jest` are configured in `jest.config.ts`.
- Place tests in `tests/` or use `*.test.ts(x)`/`*.spec.ts(x)` naming.
- Keep tests focused and mock external services (e.g., email, Stripe, Notion).

## Commit & Pull Request Guidelines
- Recent commits are short, imperative descriptions (e.g., "added slack and notion integrations").
- Keep commits scoped to a single change and avoid mixed refactors.
- PRs should include: clear description, linked issue (if any), and screenshots for UI changes.

## Configuration & Secrets
- Use a local `.env` for secrets; never commit credentials.
- `prisma generate` runs on install; rerun after schema changes.

## Agent Instructions
- Before any planning, ask as many relevant technical questions as possible to remove ambiguity.
- Organize plans into independent, high-level steps so work can be staged and code quality stays high.
- For larger projects, produce brief technical documentation covering development patterns, the tech stack, and how we use any external libraries or integrations.
- When backend changes require running scripts or migrations, explicitly tell me.
- Before asking me something, verify if what you need is already expressed in the documentation. 
