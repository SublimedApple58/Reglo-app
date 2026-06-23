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
| **Join studente** (da QR) | `app/aula-live/[code]/...` | **pubblica, no login** | Pagina leggera: inserisci nome → rispondi |

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

### Stati del quiz live (macchina a stati in Redis, campo `status`)

`LOBBY` (QR sul proiettore, studenti entrano / standby tra una domanda e l'altra) · `QUESTION_OPEN` (domanda aperta: testo+bottoni sul telefono, solo QR sul proiettore) · `QUESTION_REVEALED` (risposta + chi giusto/sbagliato sul proiettore) · `ENDED`. Nessun timer: la domanda resta aperta finché il docente non stoppa. *(Non è un enum Prisma: è un valore di stato in Redis.)*

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
| `app/aula-live/[code]/page.tsx` | Join studente (pubblica, no auth) |
| `components/pages/Aula/*` | Editor slide, console proiettore, player studente |
| `components/Layout/AppSidebar.tsx` | Link "Aula" in sidebar |
| `components/pages/Backoffice/BackofficeCompaniesPage.tsx` | Toggle `aulaEnabled` per company |

## Server Actions / API

| Operazione | Tipo | Note |
|-----------|------|------|
| `listAulaLessons`, `getAulaLesson` | action | catalogo lezioni (template + fork company) |
| `forkAulaLessonTemplate` | action | copia il pacchetto `.rppt` su R2 + nuova riga `AulaLesson` company |
| `saveAulaPackage` | action | l'editor riscrive il pacchetto slide su R2 (load → edit → save) |
| `uploadAulaImage` | action | upload immagine slide su R2, ritorna `r2Key` |
| `createAulaLiveSession` | action | genera `joinCode` + `questionIds` (da capitolo, selezione docente) → scrive sessione in Redis |
| `openAulaQuestion` / `revealAulaQuestion` / `nextAulaQuestion` / `endAulaLiveSession` | action | transizioni di stato → scrittura Redis |
| `POST /api/aula/live/[code]/join` | route | partecipante anonimo, ritorna `participantId` |
| `GET /api/aula/live/[code]/state` | route | stato live in polling |
| `POST /api/aula/live/[code]/answer` | route | risposta partecipante (idempotente per `[participantId, questionId]`) |

## Decisioni minori (chiuse)

- **Organizzazione lezioni**: lista **piatta ordinata** (`AulaLesson.order`), es. una per capitolo. Nessun raggruppamento in "corsi/moduli" (rimandabile).
- **Controllo docente**: stesso schermo proiettato + barra comandi minima (modello Kahoot), nessun secondo device.
- **Mappatura lezione→capitolo**: `chapterId` **opzionale**; se impostato il quiz pesca da lì, ma il docente può cambiarlo/scegliere le domande al volo alla creazione del quiz.
- **Schermata reveal**: lista nomi raggruppata **Giusto / Sbagliato / Non risposto** + contatori (non un muro di nomi).
- **Join pubblico**: `joinCode` breve effimero con TTL Redis + rate-limit sul join (anti-spam).
- **Lingua pagina studente**: italiano (default app).
- **Contenuto slide template**: da definire in seguito; non blocca l'architettura.

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
