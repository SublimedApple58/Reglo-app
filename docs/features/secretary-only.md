# Solo Segretaria (secretary-only mode)

## What it does
Alcune autoscuole attivano **solo il modulo Segretaria** (segreteria vocale AI),
non l'intera suite Reglo. Per queste company la web app mostra **unicamente
l'area Segretaria e le sue impostazioni**: niente Agenda/Allievi/Rinnovi né gli
altri pane di configurazione. Il modulo si attiva dal backoffice.

## Modello
Nessun nuovo `ServiceKey`: è un flag nei `limits` dell'unico servizio
`AUTOSCUOLE`.
- `ServiceLimits.secretaryOnly: boolean` (default false) — `lib/services.ts`.
- Richiede `voiceFeatureEnabled: true`, altrimenti l'utente vede la schermata
  "Segretaria non attiva".
- Helper `isSecretaryOnly(services)` — `lib/services.ts`.

## Backoffice (attivazione)
- `components/pages/Backoffice/BackofficeCompaniesPage.tsx` — drawer "Gestisci",
  sezione **Modalità app** → checkbox **"Solo Segretaria"** (mutando
  `limits.secretaryOnly`). Persistito dal "Salva modifiche" esistente via
  `updateCompanyService` (`lib/actions/backoffice.actions.ts`). Warning se la
  Segretaria non è ancora attiva.

## Web app (gating, client-side)
Il flag arriva al client tramite `companyAtom.services[].limits` (come gli altri
flag). Letto con `isSecretaryOnly(company?.services)`:
- `components/pages/Autoscuole/AutoscuoleNav.tsx` — la top-nav mostra solo la tab
  **Segretaria**.
- `components/pages/Autoscuole/AutoscuoleTabsPage.tsx` — la landing e le tab
  guida reindirizzano a `/user/autoscuole/voice`; resta accessibile solo
  `?tab=settings`.
- `components/pages/Autoscuole/AutoscuoleResourcesPage.tsx` — l'overlay
  Impostazioni mostra solo il pane **Segretaria** (`CONFIG_PANE_GROUPS` filtrato,
  default `voice`; effetto che forza `configTab="voice"` quando l'atom company
  si carica dopo il primo render).
- `components/Layout/AutoscuoleShell.tsx` — il menu hamburger nasconde le voci
  operative "guida" (Ore guida, Invia comunicato).

## Seed di test (dev)
`scripts/seed-secretary-only-company.mjs` — crea (idempotente) "Autoscuola
Segreteria Demo" + titolare `segreteria@reglo.it` con AUTOSCUOLE ACTIVE e
`{ secretaryOnly: true, voiceFeatureEnabled: true }`. Uso:
`DOTENV_CONFIG_PATH=.env.dev NODE_OPTIONS=--require=dotenv/config node scripts/seed-secretary-only-company.mjs`

## Niente flash al primo accesso (hydration)
Il gating è client-side e legge `companyAtom`, che prima partiva `null` (riempito
da una fetch dopo il mount) → al primo login si vedeva l'app "completa" per un
attimo, poi al refresh solo la Segretaria. Fix generale: il context aziendale è
risolto **lato server** in `app/[locale]/user/(autoscuole)/layout.tsx` e idrata
gli atom al primo render (`useHydrateAtoms` in `company.provider.tsx`, props
passate da `auth-data.provider.tsx`). Così nav/hamburger/gating partono già
corretti — vale per tutte le company (risolve anche l'hamburger mancante al
primo login).

## Connected features
- **Voice AI** — l'unica area visibile; il gating interno su `voiceFeatureEnabled`
  resta invariato.
- **Backoffice** — punto di attivazione (`updateCompanyService`).
- La web app resta **admin-only** (OWNER/INSTRUCTOR_OWNER) — vedi
  `docs/architecture/auth.md`.
