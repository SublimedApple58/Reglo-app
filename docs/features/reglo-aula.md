# Reglo Aula — Lezioni di teoria in aula

Gestione delle **lezioni di teoria in aula fisica** per le autoscuole: ogni lezione ha un set di **slide** (pre-compilate da Reglo, customizzabili dall'autoscuola) che il docente proietta, e un **quiz live in stile aula** che il docente può aprire sulla lezione. Gli studenti entrano scansionando un **QR sul proiettore**, inseriscono un nome (nessun login), rispondono vero/falso, e al "reveal" del docente compare a schermo chi ha risposto giusto e chi sbagliato.

Feature **strettamente integrata in Reglo** (non è un prodotto a parte): vive dentro l'app Next esistente, riusa auth, Prisma, design system e la banca domande del Quiz Teoria. È un **catalogo a sé**: NON tocca Appointments, Payments, Booking o Swaps.

## Architettura (decisioni chiave)

| Decisione | Scelta | Motivo |
|-----------|--------|--------|
| Collocazione | Modulo dentro l'app Next esistente (no app/repo separati) | Riuso massimo (banca domande, auth, cache, design system); deploy unico |
| Realtime quiz live | **Polling su Redis** (~1.5s) | Nessun vendor/infra nuova; Redis già presente; latenza invisibile in aula |
| Identità studente live | **Anonimo solo-nome** | Zero attrito in aula, nessun login, nessun problema privacy; quiz effimero (0 storico) |
| Storage slide | **Pacchetto JSON (`.rppt`) su R2 + puntatore in `AulaLesson`** | Fuori dal DB (lean), portabile, "ognuno le sue"; il DB tiene solo metadati |
| Storage quiz live | **Solo Redis, effimero (0 storico MVP)** | Nessuna tabella DB per il live; sparisce a fine lezione |
| Proprietà slide | **Template globale Reglo + fork per autoscuola** | "Pre-compilate" = le fornisce Reglo (pacchetto template su R2); "customizzabili" = fork = copia su R2 modificabile |
| Punteggio live | **Semplice giusto/sbagliato** (no punti velocità/classifica) | Fedele al requisito; classifica rimandabile a fase 2 |
| Sorgente domande live | `QuizQuestion` filtrate per capitolo della lezione + selezione manuale docente | Riuso banca esistente, nessuna duplicazione |

## Due superfici UX

| Superficie | Path | Auth | Note |
|------------|------|------|------|
| **Console docente** (proiettore) | `app/[locale]/aula/...` | owner / instructor | Lista lezioni, editor slide, modalità presentazione full-screen, controllo quiz live |
| **Join studente** (da QR) | `app/[locale]/aula-live/[code]/...` | **pubblica, no login** | Pagina leggera: inserisci nome → rispondi. Pubblica via `publicRoutes` (`lib/constants`); sotto `[locale]` perché il root layout con `<html>/<body>` è in `app/[locale]/layout.tsx` |

## Data Model

Impronta deliberatamente minima: **una sola tabella Postgres** (puntatori), il **contenuto slide su R2** (pacchetti `.rppt`), il **quiz live tutto in Redis** (effimero, nessuno storico). Le immagini non stanno mai nel DB.

### Postgres (unica tabella)

- **AulaLesson** — riga leggera, solo metadati + puntatore al pacchetto slide su R2.
  - Campi: `id`, `companyId` (nullable → `null` = template globale Reglo), `chapterId` FK→`QuizChapter` (nullable), `title`, `description`, `order`, `isTemplate` (boolean), `sourceLessonId` (nullable → la template da cui è stato forkato), `packageR2Key` (string → l'oggetto `.rppt` su R2), `createdAt`, `updatedAt`.
  - Template globale: `companyId = null`, `isTemplate = true`. Fork autoscuola: `companyId` valorizzato, `isTemplate = false`, `sourceLessonId` → template.

### R2 (contenuto slide — i pacchetti `.rppt`)

- **Pacchetto slide** = oggetto JSON su R2 (il "`.rppt`"), referenziato da `AulaLesson.packageR2Key`.
  - Template Reglo: `aula/templates/{lessonId}.json`
  - Fork autoscuola: `aula/{companyId}/{lessonId}.json`
  - Forma: `{ version, slides: SlideBlock[][] }` — array ordinato di slide, ogni slide è un array di blocchi (sotto).
  - **Fork** = copia dell'oggetto R2 nel namespace della scuola + nuova riga `AulaLesson`. **Salva** = l'editor riscrive l'oggetto su R2. Export/import come file scaricabile è fase 2 (il formato è già questo → gratis).
- **Immagini slide** = binari su R2 (`aula/{companyId}/assets/{uuid}.{ext}`); nel pacchetto resta solo l'`r2Key`.

### Redis (quiz live — effimero, 0 storico)

Il quiz live **non ha tabelle Postgres**. Sessione, partecipanti, risposte e conteggi vivono solo in Redis con TTL e spariscono a fine lezione:

```
aula:live:{joinCode}              → { status, lessonId, teacherId, questionIds[], currentQuestionId, revealed, updatedAt }
aula:live:{joinCode}:participants → set/hash { participantId → { name, rejoinToken } }   (nome univoco per sessione)
aula:live:{joinCode}:answers:{questionId} → hash { participantId → answer(bool) }
```

- **Nome univoco per sessione**: al join un nome già preso viene rifiutato. Il **rientro** dopo disconnessione avviene via `rejoinToken` salvato sul device, non via nome.
- Chi non risponde prima dello stop non compare nelle answers → mostrato come **"non risposto"** (distinto da sbagliato).
- Correttezza calcolata confrontando `answer` con `QuizQuestion.correctAnswer` (letta dal DB) al momento del reveal.

### Riuso (read-only)

- **QuizQuestion** / **QuizChapter** (Postgres) + **immagini quiz su R2** (`quiz/images/{NNN}.gif`) — banca domande globale del Quiz Teoria (7.165 domande V/F, 25 capitoli). Aula la **legge** per popolare il quiz live e mostrare le immagini; non la modifica. È un **asset aziendale già centralizzato**, non duplicato.

### Due modalità di quiz (`mode` in Redis: `LIVE` | `EXAM`)

Il docente sceglie la modalità all'avvio (pulsanti **"Quiz live"** / **"Quiz completo"** nell'editor):

- **LIVE** (Kahoot): una domanda alla volta, a ritmo del docente, reveal per domanda. Stati: `LOBBY → QUESTION_OPEN → QUESTION_REVEALED → … → ENDED`.
- **EXAM** (verifica): **tutte le domande insieme** sul telefono, lo studente risponde in autonomia (può cambiare risposta finché non si termina). Al **"Termina & correggi"** si correggono in massa: il **proiettore mostra la classifica per studente** (nome + punteggio), e ogni studente vede sul telefono il proprio punteggio + correzione domanda per domanda. Stati: `LOBBY → IN_PROGRESS → ENDED`. Durante `IN_PROGRESS` il proiettore mostra **solo QR + avanzamento** (`X/Y hanno completato`), nessuna domanda a schermo (anti-copiatura).

### Stati del quiz live (macchina a stati in Redis, campo `status`)

`LOBBY` (QR sul proiettore, studenti entrano / standby) · `QUESTION_OPEN` (LIVE: domanda aperta, testo+bottoni sul telefono, solo QR sul proiettore) · `QUESTION_REVEALED` (LIVE: risposta + chi giusto/sbagliato sul proiettore) · `IN_PROGRESS` (EXAM: tutte le domande aperte sul telefono) · `ENDED`. Nessun timer. *(Non è un enum Prisma: è un valore di stato in Redis.)*

### Blocchi slide (contenuto del pacchetto `.rppt`)

Set chiuso e minimo, validato con Zod in `lib/aula/slides.ts`:

```ts
type SlideBlock =
  | { type: "heading"; text: string }
  | { type: "text"; text: string }
  | { type: "image"; r2Key: string; caption?: string }
  | { type: "bullets"; items: string[] }
  | { type: "quizRef"; questionId: string }  // richiama una QuizQuestion
```

## Feature Flag

`ServiceLimits.aulaEnabled` (boolean, default `false`), toggle dal backoffice — stesso pattern di `quizEnabled`. Vedi `lib/services.ts`.

## Realtime — polling su Redis

Tutto lo stato del quiz live sta **solo in Redis** (vedi chiavi sopra), aggiornato dalle azioni del docente e letto in polling dagli studenti. Nessuna scrittura su Postgres, nessuno storico (scelta MVP).

```
docente  → server action (open/reveal/next/end) scrive lo stato in Redis
studente → GET /api/aula/live/{code}/state ogni ~1.5s legge lo stato
studente → POST /api/aula/live/{code}/answer invia la risposta (solo se QUESTION_OPEN)
proiettore (console docente) → stesso polling: in QUESTION_OPEN mostra solo QR + conteggio, al reveal mostra giusto/sbagliato
```

### Comportamento proiettore vs telefono (importante)

Il **quiz va una domanda alla volta**, a ritmo del docente. La divisione degli schermi è asimmetrica per evitare che gli studenti "copino" guardando il proiettore:

- **Proiettore — mentre la domanda è aperta (`QUESTION_OPEN`)**: mostra **solo il QR code** (così i ritardatari entrano comunque) + una **barra comandi minima** per il docente (contatore "X risposte" + Stop/Next). NON mostra il testo della domanda né le risposte. Il docente controlla dallo **stesso schermo proiettato** (modello Kahoot), nessun secondo device.
- **Telefono studente — `QUESTION_OPEN`**: mostra **testo domanda + immagine (se presente) + due bottoni Vero/Falso**.
- **Proiettore — al `reveal` (`QUESTION_REVEALED`)**: compaiono la **domanda, la risposta corretta e chi ha risposto giusto/sbagliato** (per nome).
- **Telefono studente — `QUESTION_REVEALED`**: "giusto / sbagliato".
- Tra una domanda e l'altra il docente torna alle slide (modalità teaching) sul proiettore.

Le **immagini** delle `QuizQuestion` (GIF ministeriali su R2) vengono mostrate quando presenti.

## Files

### Backend

| File | Purpose |
|------|---------|
| `prisma/schema.prisma` | **1 sola tabella** `AulaLesson` (puntatori). Nessuna tabella per il quiz live (Redis) né per le slide (R2) |
| `lib/services.ts` | `aulaEnabled` in `ServiceLimits` |
| `lib/aula/slides.ts` | Tipi `SlideBlock` + schema Zod del pacchetto `.rppt` |
| `lib/aula/package-store.ts` | Read/write del pacchetto slide su R2 (load/save/fork/copy assets) |
| `lib/aula/live-state.ts` | Stato del quiz live su Redis (sessione, partecipanti, risposte, TTL) |
| `lib/actions/aula.actions.ts` | Server actions (lezioni, editor pacchetto, fork, quiz live) |
| `lib/actions/autoscuole-settings.actions.ts` | toggle `aulaEnabled` (o backoffice) |
| `lib/autoscuole/cache.ts` | segmento cache `AULA` |
| `app/api/aula/live/[code]/join/route.ts` | POST — join partecipante (nome) |
| `app/api/aula/live/[code]/state/route.ts` | GET — stato live (polled) |
| `app/api/aula/live/[code]/answer/route.ts` | POST — invio risposta |
| `scripts/aula-seed.ts` | Seed lezioni template: riga `AulaLesson` globale + pacchetto `.rppt` su R2 |

### Web App

| File | Purpose |
|------|---------|
| `app/[locale]/aula/page.tsx` | Lista lezioni (docente) |
| `app/[locale]/aula/[lessonId]/page.tsx` | Editor pacchetto slide / dettaglio lezione |
| `app/[locale]/aula/live/[code]/page.tsx` | Console docente full-screen (slide + controllo quiz + QR) |
| `app/[locale]/aula-live/[code]/page.tsx` | Join studente (pubblica via `publicRoutes`, no auth) |
| `middleware.ts` + `lib/constants.ts` | `/aula-live/[^/]+` in `publicRoutes` (no auth, sì i18n) |
| `components/pages/Aula/*` | Editor slide, console proiettore, player studente, presentazione full-screen (`AulaSlideShow.tsx`) |
| `components/Layout/AppSidebar.tsx` | Link "Aula" in sidebar |
| `components/pages/Backoffice/BackofficeCompaniesPage.tsx` | Toggle `aulaEnabled` per company |

## Server Actions / API

| Operazione | Tipo | Note |
|-----------|------|------|
| `listAulaLessons`, `getAulaLesson` | action | catalogo lezioni (template + fork company) |
| `createAulaLesson` | action | crea una lezione vuota da zero (riga company + pacchetto vuoto su R2) → apre l'editor. Alternativa al fork quando non ci sono template |
| `forkAulaLessonTemplate` | action | copia il pacchetto `.rppt` su R2 + nuova riga `AulaLesson` company |
| `saveAulaPackage` | action | l'editor riscrive il pacchetto slide su R2 (load → edit → save) |
| `uploadAulaImage` | action | upload immagine slide su R2, ritorna `r2Key` |
| `resolveAulaImageUrl` | action | URL firmato di un'immagine slide (anteprima editor + presentazione) |
| `resolveAulaQuizRefs` | action | risolve i blocchi `quizRef` (testo + immagine + risposta) per la presentazione; read-only su `QuizQuestion` |
| `createAulaLiveSession` | action | genera `joinCode` + `questionIds` (da capitolo, selezione docente) + `mode` (`LIVE`/`EXAM`) → scrive sessione in Redis |
| `openAulaQuestion` / `revealAulaQuestion` / `nextAulaQuestion` / `endAulaLiveSession` | action | LIVE: transizioni di stato → scrittura Redis |
| `startAulaExam` | action | EXAM: `LOBBY → IN_PROGRESS` (apre tutte le domande) |
| `POST /api/aula/live/[code]/join` | route | partecipante anonimo, ritorna `participantId` |
| `GET /api/aula/live/[code]/state` | route | stato live in polling |
| `POST /api/aula/live/[code]/answer` | route | risposta partecipante (idempotente per `[participantId, questionId]`) |

## Decisioni minori (chiuse)

- **Creazione lezione**: due vie nella lista (`AulaLessonsPage`) → **"Nuova lezione"** (`createAulaLesson`, pacchetto vuoto, apre subito l'editor) oppure **"Personalizza"** un template (`forkAulaLessonTemplate`). La via "da zero" non dipende dall'esistenza di template.
- **Organizzazione lezioni**: lista **piatta ordinata** (`AulaLesson.order`), es. una per capitolo. Nessun raggruppamento in "corsi/moduli" (rimandabile).
- **Controllo docente**: stesso schermo proiettato + barra comandi minima (modello Kahoot), nessun secondo device.
- **Mappatura lezione→capitolo**: `chapterId` **opzionale**; se impostato il quiz pesca da lì, ma il docente può cambiarlo/scegliere le domande al volo alla creazione del quiz.
- **Schermata reveal**: lista nomi raggruppata **Giusto / Sbagliato / Non risposto** + contatori (non un muro di nomi).
- **Join pubblico**: `joinCode` breve effimero con TTL Redis + rate-limit sul join (anti-spam).
- **Lingua pagina studente**: italiano (default app).
- **Contenuto slide template**: da definire in seguito; non blocca l'architettura.
- **Editor slide**: a blocchi tipizzati (`heading`/`text`/`bullets`/`image`/`quizRef`) con rail slide (aggiungi/riordina/elimina), riordino/eliminazione blocchi e upload immagini su R2 (anteprima via URL firmato).
- **Modalità presentazione full-screen**: overlay proiettore (`AulaSlideShow.tsx`) avviato dal pulsante "Presenta" nell'editor. Renderizza una slide alla volta in tipografia grande; naviga da tastiera (← → Spazio PagSu/Giù Home Fine) o con i comandi a schermo, Esc esce. L'overlay è `fixed inset-0` (copre tutto) con un **toggle schermo intero** esplicito (Fullscreen API); NON si chiude all'uscita dal fullscreen (robusto sul proiettore) — solo "Esci"/Escape chiudono. Immagini slide e domande `quizRef` (testo + immagine + risposta corretta) risolte on-mount via `resolveAulaImageUrl` / `resolveAulaQuizRefs`. **Immagini multiple** sulla stessa slide vengono **affiancate** (riga responsive, non impilate). I blocchi **`quizRef` si mostrano prima senza soluzione**: un pulsante **"Vedi soluzione"** evidenzia Vero/Falso (reset automatico al cambio slide). Funziona anche su lezioni template (sola lettura).
- **QR proiettore**: render reale via `qrcode.react` (SVG scansionabile dell'URL studente `/{locale}/aula-live/{code}`). La base URL viene da `NEXT_PUBLIC_SERVER_URL` (in prod il dominio reale), **non** da `window.location.origin` — così il QR è raggiungibile dai telefoni. In dev punta a `localhost:3000`; per testare da telefono imposta `NEXT_PUBLIC_SERVER_URL` su IP LAN (`http://192.168.x.x:3000`) o su un tunnel (cloudflared/ngrok).
- **Upload immagini slide**: l'editor **ridimensiona/comprime lato client** (canvas → JPEG, lato lungo ≤1600px, qualità ~0.85) prima dell'upload, perché i Server Actions hanno un limite di body (alzato a `4mb` in `next.config.ts` come rete di sicurezza). Gli errori di upload vengono sempre mostrati in UI (try/catch attorno alla action), niente più fallimenti silenziosi.

## Roadmap (fase 2 — non ancora implementato)

- **Esportazione in PowerPoint (`.pptx`)**: scaricare una lezione come presentazione PowerPoint a partire dal pacchetto `.rppt`. Mappatura blocchi → slide PPTX: `heading` → titolo, `text` → corpo, `bullets` → elenco puntato, `image` → immagine (scaricata da R2 e incorporata nel file), `quizRef` → slide con testo domanda + immagine + risposta corretta. Implementazione lato server con una libreria di generazione `.pptx` (es. `pptxgenjs`), esposta come download dalla console docente. Le immagini vanno **incorporate** nel file (non link firmati a scadenza).
- **Importazione da PowerPoint (`.pptx`)**: creare/aggiornare una lezione caricando un `.pptx`. Parsing del file (Open XML) → estrazione di titoli, testo, elenchi e immagini per slide → costruzione di un pacchetto `.rppt` (immagini caricate su R2 come asset). Mappatura best-effort: il testo grande della slide → `heading`, i restanti paragrafi → `text`/`bullets`, le immagini → blocchi `image`. I `quizRef` non sono inferibili da un PPT generico → restano da agganciare a mano nell'editor. Da valutare: upload del `.pptx` via route/presigned (file grandi → oltre il limite dei server action).
- **Teoria scritta ricca** nelle lezioni template (oltre allo scaffold automatico).
- **Storico quiz / classifica persistente** (oggi il live è effimero su Redis, 0 storico — scelta MVP).
- **Upload immagini direct-to-R2 (presigned)** se in futuro servono originali ad alta risoluzione (oggi: downscale lato client).

## Connected Features

- **Quiz Teoria**: riusa **read-only** `QuizQuestion` + `QuizChapter` (Postgres) + immagini quiz su R2 (`quiz/images/`) per le domande del live (filtro per capitolo della lezione). Aula non modifica la banca — è un **asset aziendale già centralizzato** (DB+R2), non duplicato.
- **R2 (storage)**: i pacchetti slide `.rppt` (`aula/templates/`, `aula/{companyId}/`) e le immagini delle slide. Stesso bucket usato dal quiz.
- **Settings / Backoffice**: flag `aulaEnabled` in `CompanyService.limits`, toggle dal drawer company.
- **Cache**: segmento `AULA` (invalidato su modifica lezioni/pacchetto slide).
- **Auth & RBAC**: console docente gated owner/instructor; join studente **pubblico** (no auth).
- **Student Phase (TEORIA)**: contesto concettuale (sono lezioni di teoria), ma il live è anonimo → collegamento volutamente lasco.

### Volutamente NON connesso

Per mantenere Aula isolata e manutenibile (catalogo a sé), **non** ha legami con:
**Appointments**, **Payments & Credits**, **Booking Engine**, **Swaps**, **Holidays**. Nessun credito, refund, swap o slot coinvolto. Un eventuale tracciamento presenze ↔ agenda è una possibile estensione futura, fuori scope MVP.
