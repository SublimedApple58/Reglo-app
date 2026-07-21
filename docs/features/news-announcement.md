# Novità — annuncio "Richieste agenda in pausa"

Annuncio in-app mostrato agli utenti **web** dell'autoscuola (titolari/segretarie) al primo accesso, per comunicare la pausa temporanea delle richieste sull'agenda e presentare i 3 moduli in arrivo (Reglo Road, Reglo Rinnovi, Guide certificate). Include due form ("Fai una richiesta" / "Consiglia qualcosa") che raccolgono l'input e notificano il team.

Design 1:1 dal prototipo `News.html` (fatto dall'utente). Nessun asset video: le tre "clip" sono **animazioni React (SVG+DIV)** guidate da una prop `progress`, portate dal prototipo `reglo-video.jsx`.

## Componenti (web)

| File | Ruolo |
|------|-------|
| `components/Layout/news/AgendaPauseNewsDialog.tsx` | Dialog a due livelli: **splash** (card 920×788, testo + CTA "Scopri di più" + `RegloEmbed`) e **dettaglio** (modale "Novità" 640px con clip + form). Portal su `document.body`. Props: `open`, `startWith` (`"splash"` \| `"detail"`), `onClose`. |
| `components/Layout/news/RegloClips.tsx` | Animazioni portate: `RegloEmbed` (splash), `RegloClipRoad` / `RegloClipRinnovi` / `RegloClipGuide` (clip 16:9 in loop). Puro React, nessun canvas, nessuna dipendenza dall'editor del prototipo. |
| `components/Layout/AutoscuoleShell.tsx` | Monta il dialog + **auto-show al login** una volta per dispositivo (localStorage `reglo-news-seen:agenda-pausa-2026-07`). |
| `components/Layout/NovitaDialog.tsx` | `NOVITA_ENTRIES` ha la voce `agenda-pausa` (latest); lo shell la intercetta e apre il dialog in `startWith="splash"` (NON usa `NovitaDialog`). |

**Auto-show + gating**: al mount, se c'è `session` e la chiave localStorage non è settata → apre lo splash. Alla chiusura setta la chiave (mai più su quel dispositivo). Bumpando `AGENDA_PAUSE_NEWS_KEY` nello shell si ri-mostra a tutti. Riapribile sempre dal menu hamburger → Novità → "Richieste agenda in pausa".

## Backend — `lib/actions/support.actions.ts`

- `submitNewsFeedback({ type, modules, message })` — `type` = `"request"` \| `"suggestion"`, `modules` (solo consigli) sottoinsieme di `road|rinnovi|guide`. Guard `requireSupportAccess()` (staff, no studenti). Salva su `NewsFeedback` + `after()` → email a `GLOBAL_ADMIN_EMAIL` (no-op su staging).

## Modello dati (Prisma)

`NewsFeedback` — standalone (nessuna relation, `companyId`/`userId` solo snapshot per non appesantire User/Company): `type`, `modules String[]`, `message`, `userName?`, `createdAt`. Migration `20260721084553_add_news_feedback`. Indici su `type` e `createdAt`.

## Asset

`public/images/news/richiesta-inviata.png` — illustrazione della schermata di conferma invio (estratta dal prototipo).

## Note

- Web-only: gli istruttori usano il mobile, non sono il target.
- Lista Novità (`NOVITA_ENTRIES`): **agenda-pausa** (latest) + **veicoli** + **istruttori**. Rimossa "Guide di gruppo". Le card veicoli/istruttori ora usano registrazioni schermo (`public/videos/novita/{veicoli,istruttori}.mp4`, 1920×1080 H.264) al posto delle immagini statiche.
