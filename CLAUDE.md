# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is Reglo

Reglo is an Italian SaaS platform for driving schools ("autoscuole"). It provides document management, workflow automation, AI assistant, billing, and a mobile API for students/instructors. The web app is in Italian.

## Tech Stack

- **Framework:** Next.js 15 (App Router) with React 19
- **Language:** TypeScript (strict)
- **Database:** PostgreSQL on Neon (serverless WebSocket adapter) with Prisma ORM
- **Auth:** NextAuth v5 (beta) with JWT strategy + credentials provider; separate mobile auth via `lib/mobile-auth.ts`
- **i18n:** next-intl — all pages under `app/[locale]/`
- **UI:** Tailwind CSS v4, shadcn/ui (Radix primitives), Lucide icons
- **State:** Jotai atoms (`atoms/`)
- **Background Jobs:** Trigger.dev v4 (`trigger/` directory)
- **Email:** React Email + Resend
- **Payments:** Stripe (Connect for autoscuole)
- **Storage:** Cloudflare R2 via AWS S3 SDK
- **Cache:** Upstash Redis
- **Integrations:** Slack, Fatture in Cloud (Italian invoicing), Notion

## Common Commands

```bash
pnpm dev                    # Next.js + Trigger.dev dev servers (uses .env.dev)
pnpm build                  # Production build (dev env)
pnpm lint                   # ESLint
pnpm test                   # All Jest tests (unit + integration)
pnpm test:unit              # Unit tests only
pnpm test:integration       # Integration tests only (runs sequentially)
pnpm test:e2e               # Playwright end-to-end tests
pnpm test -- --testPathPattern="tests/unit/foo"  # Run specific test file
pnpm migrate:dev            # Prisma migrate dev
pnpm studio:dev             # Prisma Studio
pnpm email                  # React Email dev preview on port 3001
pnpm trigger:dev            # Trigger.dev dev only
pnpm trigger:deploy:dev     # Deploy Trigger.dev tasks to dev
```

## Architecture

### Route Groups (`app/[locale]/`)
- `(auth)/` — sign-in, sign-up (public)
- `(root)/` — e-commerce order flow
- `user/` — main authenticated app (documents, workflows, autoscuole, billing, AI assistant, settings)
- `admin/` — admin panel
- `backoffice/` — backoffice with separate auth (`lib/backoffice-auth.ts`)
- `public/` — public document sharing

### API Routes (`app/api/`)
- `mobile/` — REST API for the React Native mobile app (auth, invites, payments, push, profile)
- `webhooks/` — Stripe, integrations
- `autoscuole/`, `documents/`, `voice/` — domain-specific endpoints

### Key Patterns
- **Server Actions:** `lib/actions/*.actions.ts` — domain-grouped server actions
- **Database:** `db/prisma.ts` exports a singleton PrismaClient with Neon adapter; schema at `prisma/schema.prisma`
- **Auth Guard:** `lib/auth-guard.ts` for protecting server actions; middleware handles route protection
- **Company Context:** Multi-tenant via `lib/company-context.ts`; users have `activeCompanyId`
- **Services:** Feature-flagged per company via `ServiceKey` enum (DOC_MANAGER, WORKFLOWS, AI_ASSISTANT, AUTOSCUOLE)
- **Workflows:** Custom workflow engine in `lib/workflows/engine.ts` with Trigger.dev runner
- **Imports:** Use `@/*` path alias (mapped to project root)

### Environment
- `.env.dev` and `.env.prod` — env files loaded via `DOTENV_CONFIG_PATH`
- All scripts explicitly set the env file path; never use a bare `.env`

## Design System

Refer to `DESIGN_SYSTEM.md` for brand colors, component specs, and visual guidelines. Key rules:
- All buttons are `rounded-full` (pill shape), never rectangular
- Brand pink `#EC4899`, accent yellow `#FACC15`
- 70/20/10 rule: 70% neutrals, 20% pink, 10% yellow
- Font: Inter only

## Agent Guidelines (from AGENTS.md)

- Before planning, ask technical questions to remove ambiguity
- Organize plans into independent, high-level steps
- When backend changes require scripts or migrations, explicitly say so
- Check existing documentation before asking questions
