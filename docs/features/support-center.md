# Support Center + Product Feedback

Chat di assistenza REALE tra le autoscuole (web app) e il team Reglo (backoffice), più il salvataggio dei feedback prodotto. Sostituisce i mock precedenti (risposta finta di "Giulia" e feedback non salvato).

## Modello dati (Prisma)

| Model | Scopo | Note |
|-------|-------|------|
| `SupportThread` | 1 thread per company (`companyId @unique`) | `unreadForAdmin` / `unreadForCompany` contatori non-letti per lato; `lastMessageAt` + `lastMessagePreview` per l'inbox; `status` ("open") riservato per usi futuri |
| `SupportMessage` | Messaggio del thread | `sender` = `"company"` \| `"reglo"`; `senderName` snapshot (sopravvive alla cancellazione utente); `senderUserId` SetNull |
| `ProductFeedback` | Feedback dalla dialog "Lascia un feedback" | `rating` 1–5, `tags[]`, `message?`; company/user SetNull (sopravvive alle cancellazioni) |

Migration: `20260708160036_support_center`.

## Backend — `lib/actions/support.actions.ts`

**Lato company** (guard: `requireServiceAccess("AUTOSCUOLE")` + `autoscuolaRole !== "STUDENT"` — la chat è dello staff, gli allievi non la vedono):
- `getSupportConversation()` — ultimi 300 messaggi asc + azzera `unreadForCompany` (aprire = leggere). Il thread NON viene creato qui (lazy al primo messaggio).
- `sendSupportMessage({ body })` — upsert thread + crea messaggio + `unreadForAdmin++` in transazione; poi `after()` → email di avviso a `GLOBAL_ADMIN_EMAIL` via `sendDynamicEmail` (no-op su staging).
- `getSupportUnreadCount()` — alimenta il badge nel menu della shell.
- `submitProductFeedback({ rating, tags, message })` — crea `ProductFeedback` + email di avviso al team.

**Lato backoffice** (guard: `requireGlobalAdmin()`):
- `getBackofficeSupportThreads()` — inbox ordinata per `lastMessageAt` desc.
- `getBackofficeSupportThread(threadId)` — messaggi + azzera `unreadForAdmin`.
- `sendBackofficeSupportReply({ threadId, body })` — messaggio `sender:"reglo"`, `senderName:"Team Reglo"`, `unreadForCompany++`.
- `getBackofficeSupportUnreadTotal()` — badge nell'header del backoffice.
- `getBackofficeFeedback()` — ultimi 500 feedback con nome company.

Nessuna email all'autoscuola quando il team risponde: la risposta appare in chat + badge non-letti (scelta deliberata).

## Web app

- `components/pages/Autoscuole/AutoscuoleAssistenzaPage.tsx` — chat reale: welcome statico (non persistito) con card WhatsApp/telefono, messaggi raggruppati per giorno (Oggi/Ieri/data), polling 10s + refresh su visibilitychange, invio con spinner (niente optimistic: append solo dopo risposta server). `sendingRef` evita che il polling "mangi" il messaggio appena inviato.
- **Composer dal proto** (`aiBoxStyle`): textarea box (bordo 2px `#dddddd` → `#222` al focus, radius 16px, min-h 92px, auto-grow fino a 120px), freccia tonda 36px in basso a dx (`#ebebeb`/grigia se vuoto, near-black se c'è testo), Invio invia / Shift+Invio a capo.
- **FAQ con risposta immediata** (`FAQS`): 3 chips sempre visibili sopra il composer ("Come apro le prenotazioni?", "Aggiungere un allievo", "Creare una guida di gruppo"). Il click NON scrive al team: appende in locale (effimero, come il welcome) la bolla domanda + risposta "Assistente Reglo · Risposta automatica" con card **Percorso** (`FaqPathCard`: step con icone lucide + chevron). I percorsi riflettono l'app reale (pane unificato "Prenotazioni e allievi", auto-save). La chip cliccata scompare.
- `components/Layout/AutoscuoleShell.tsx` — `getSupportUnreadCount` on mount + ogni 60s + al cambio pathname: pallino rosso sull'hamburger e conteggio sulla voce "Centro assistenza".
- `components/Layout/FeedbackDialog.tsx` — submit → `submitProductFeedback` (spinner, toast su errore), poi gli esiti proto (5★ video testimonial / 4★ / 1-3★) invariati.

## Backoffice

- `components/pages/Backoffice/BackofficeHeader.tsx` — nav Autoscuole / Assistenza / Feedback con badge non-letti totale (poll 30s).
- `app/[locale]/backoffice/support/page.tsx` → `BackofficeSupportPage.tsx` — inbox 2 colonne: lista thread (badge per-thread, bold se non letti) + conversazione con risposta come "Team Reglo". Poll: lista 30s, thread aperto 10s.
- `app/[locale]/backoffice/feedback/page.tsx` → `BackofficeFeedbackPage.tsx` — riepilogo (media, distribuzione 1–5) + elenco card con stelle/tag/messaggio.

## Gotcha

- **Dopo la migration serve riavviare `pnpm dev`**: il Prisma client rigenerato non viene ricaricato dal processo in corsa (`prisma.supportThread` undefined → "Cannot read properties of undefined (reading 'upsert')").
- Il thread è per COMPANY: tutti gli staff scrivono nello stesso thread; `senderName` distingue chi scrive.
- I contatori non-letti si azzerano aprendo la chat/il thread (mark-read implicito nel GET).

## Connessioni

- **Users Directory**: `SupportMessage.senderUserId` / `ProductFeedback.userId` SetNull alla cancellazione utente; il nome resta come snapshot.
- **Backoffice**: stesse pagine/auth del tool companies (`requireGlobalAdmin`, cookie).
- **Email**: `sendDynamicEmail` (rispetta `externalSendsDisabled()` su staging).
