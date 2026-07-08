# Centro assistenza + feedback → backoffice

> Approvato il 2026-07-08 ("FALLA PIÙ COMPLETA E VASTA POSSIBILE") sul branch `feat/airbnb-redesign`.
> Stato: implementato. Doc tecnica completa: `docs/features/support-center.md`.

## Cosa è stato fatto

- **DB**: `SupportThread` (1 per company, contatori non-letti per lato, preview) + `SupportMessage` (sender company|reglo, snapshot nome) + `ProductFeedback` (rating 1–5, tag, messaggio). Migration `20260708160036_support_center`.
- **Backend** `lib/actions/support.actions.ts`: lato company (conversazione con mark-read, invio, unread count, feedback) e lato backoffice (inbox, thread, reply come "Team Reglo", unread totale, elenco feedback). Email di avviso al team (`GLOBAL_ADMIN_EMAIL`) su nuovo messaggio/feedback via `after()` + `sendDynamicEmail` (no-op staging).
- **Web**: `AutoscuoleAssistenzaPage` collegata al thread reale (polling 10s, separatori giorno, welcome + card WhatsApp/telefono conservate, niente più risposta finta); badge non-letti su hamburger + voce "Centro assistenza" in `AutoscuoleShell` (poll 60s + pathname); `FeedbackDialog` salva davvero (esiti proto invariati).
- **Backoffice**: header con nav Autoscuole/Assistenza/Feedback + badge; `/backoffice/support` = inbox 2 colonne con chat e risposta; `/backoffice/feedback` = riepilogo (media + distribuzione) + elenco.

## Decisioni (dalle open questions del piano)

1. Thread unico per company; scrive tutto lo staff (autoscuolaRole ≠ STUDENT), `senderName` distingue chi.
2. Polling (10s chat aperta / 30-60s badge) — niente websocket sull'infra attuale.
3. Email al team a ogni messaggio/feedback → `GLOBAL_ADMIN_EMAIL` (default tiziano.difelice@reglo.it, overridabile via env).
4. Risposta del team → nessuna email all'autoscuola: chat + badge non-letti.

## Note di rilascio

- Migration da applicare su staging/prod al rilascio (`pnpm migrate:staging` / `pnpm migrate:prod`).
- **Riavviare il server dopo la migration in dev** (Prisma client rigenerato non viene ricaricato a caldo).
- I mock precedenti (canned reply "Giulia", feedback non salvato) sono rimossi; e2e aggiornato ("Ciao! Qui parli direttamente").
