# Reglo Aula — Piano di implementazione

Branch: `feature/reglo-aula`. Doc feature: `docs/features/reglo-aula.md`.

Lezioni di teoria in aula: slide pre-compilate e customizzabili + quiz live in stile aula (QR sul proiettore, studenti anonimi, reveal giusto/sbagliato). Modulo integrato nell'app Next esistente, realtime via polling su Redis, banca domande riusata dal Quiz Teoria.

## Principi

- **Catalogo a sé**: nessun legame con Appointments/Payments/Booking/Swaps/Holidays.
- **Riuso read-only** di `QuizQuestion` + `QuizChapter`.
- **Nessuna infra nuova**: realtime = polling su Redis (già presente).
- Feature dietro flag `aulaEnabled` (default `false`), come `quizEnabled`.

Gli step sono il più possibile indipendenti; l'ordine consigliato è 1 → 7.

---

## Step 1 — Schema dati + migration

Impronta DB minima: **una sola tabella**. Le slide vivono su R2 (pacchetto `.rppt`), il quiz live tutto in Redis (effimero, 0 storico). Aggiungere a `prisma/schema.prisma`:
- `AulaLesson` — `id`, `companyId` Uuid? (null = template globale), `chapterId` Uuid? FK→`QuizChapter`, `title`, `description`, `order`, `isTemplate` Boolean, `sourceLessonId` Uuid? (template di origine del fork), `packageR2Key` String (oggetto `.rppt` su R2), `createdAt`, `updatedAt`.

NESSUNA tabella per slide (→ R2) né per il quiz live (→ Redis), nessun enum Prisma (lo stato live è un valore in Redis).

Convenzioni: UUID `gen_random_uuid()`, `@db.Timestamp(6)`, indici su `companyId`, `chapterId`, `isTemplate`.

**Comandi (backend):** `pnpm migrate:dev` poi `npx prisma generate`.

## Step 2 — Feature flag + cache segment

- `lib/services.ts`: aggiungere `aulaEnabled?: boolean` a `ServiceLimits` (default `false` in `DEFAULT_SERVICE_LIMITS`).
- `lib/autoscuole/cache.ts`: aggiungere segmento `AULA` (`AULA_SEGMENT = "aula"` + voce in `AUTOSCUOLE_CACHE_SEGMENTS`).
- `components/pages/Backoffice/BackofficeCompaniesPage.tsx`: toggle `aulaEnabled` nel drawer company (clonare il pattern di `quizEnabled`).

## Step 3 — Pacchetto slide su R2 + stato live su Redis

- `lib/aula/slides.ts`: tipi `SlideBlock` (`heading`, `text`, `image`, `bullets`, `quizRef`) + schema Zod del pacchetto `{ version, slides: SlideBlock[][] }`.
- `lib/aula/package-store.ts`: read/write del pacchetto su R2 (`loadPackage(r2Key)`, `savePackage(r2Key, pkg)`, `forkPackage(srcKey, destKey)` = copia oggetto, `putAsset(file)` = upload immagine). Riusa il client R2 esistente del quiz.
- `lib/aula/live-state.ts`: stato del quiz live in Redis (TTL). Chiavi `aula:live:{joinCode}` (`status`, `lessonId`, `teacherId`, `questionIds[]`, `currentQuestionId`, `revealed`), `:participants` (hash `participantId→{name,rejoinToken}`, nome univoco), `:answers:{questionId}` (hash `participantId→bool`). Helper: create/get/setStatus/setCurrentQuestion/reveal/end + join/recordAnswer.

## Step 4 — Server actions (lezioni, editor, quiz live)

`lib/actions/aula.actions.ts` (gate `aulaEnabled` + RBAC owner/instructor, validazione Zod, `formatError`):
- Catalogo: `listAulaLessons`, `getAulaLesson` (carica anche il pacchetto da R2), `forkAulaLessonTemplate` (copia `.rppt` su R2 + riga `AulaLesson` company).
- Editor: `saveAulaPackage` (riscrive il pacchetto su R2), `uploadAulaImage` (asset su R2 → `r2Key`).
- Quiz live (scrivono **solo Redis**): `createAulaLiveSession` (genera `joinCode` + `questionIds` da capitolo + selezione docente), `openAulaQuestion`, `revealAulaQuestion`, `nextAulaQuestion`, `endAulaLiveSession`.
- Invalidazione cache `AULA` su mutazioni di lezioni/pacchetto.

## Step 5 — API pubbliche studente (no auth)

Route fuori dall'area autenticata, operano **solo su Redis**:
- `POST app/api/aula/live/[code]/join/route.ts` — registra partecipante (nome univoco, rifiuta duplicati), ritorna `participantId` + `rejoinToken`. Rientro via `rejoinToken`.
- `GET  app/api/aula/live/[code]/state/route.ts` — stato live da Redis (polled ~1.5s); in `QUESTION_REVEALED` include la risposta corretta (da `QuizQuestion`).
- `POST app/api/aula/live/[code]/answer/route.ts` — registra la risposta in Redis solo se `QUESTION_OPEN`; idempotente per `[participantId, questionId]`.

## Step 6 — UI

Leggere `docs/design-system.md` prima. Componenti in `components/pages/Aula/*`.
- `app/[locale]/aula/page.tsx` — lista lezioni (template + fork), bottone "Personalizza" (fork).
- `app/[locale]/aula/[lessonId]/page.tsx` — editor pacchetto slide (blocchi base + upload immagini), riordino, anteprima.
- `app/[locale]/aula/live/[code]/page.tsx` — console docente full-screen: slide (vista proiettore lato-client), bottone "Avvia quiz", controllo domanda (apri/stop/next/end), QR di join, conteggio partecipanti, schermata reveal giusto/sbagliato. Proiettore: in `QUESTION_OPEN` mostra **solo QR**.
- `app/[locale]/aula-live/[code]/page.tsx` — join studente pubblico: nome → risposta V/F (con immagine se presente) → attesa reveal → giusto/sbagliato. Pubblica via `publicRoutes` in `lib/constants` (sotto `[locale]` perché html/body sono nel layout locale).
- `components/Layout/AppSidebar.tsx` — link "Aula" (visibile se `aulaEnabled`).

## Step 7 — Seed contenuti template + flag

- `scripts/aula-seed.ts` — per ogni lezione template: crea la riga `AulaLesson` globale (`isTemplate=true`, `companyId=null`) e carica il pacchetto `.rppt` su R2 (`aula/templates/{id}.json`), mappando i `quizRef` a `QuizQuestion` reali.
  **Comando (backend):** `npx tsx scripts/aula-seed.ts` (dev e prod).
- Abilitare `aulaEnabled` per le company pilota dal backoffice.

---

## Verifica

- `pnpm lint`, `pnpm test:unit`.
- E2E del flusso live (Playwright): docente crea sessione → studente join via code → docente apre domanda → studente risponde → docente reveal → giusto/sbagliato corretto.
- Aggiornare `docs/features/reglo-aula.md` se l'implementazione diverge da modelli/file qui previsti.

## Aperti / fase 2 (fuori scope MVP)

- Migrazione realtime da polling a provider gestito (Pusher/Ably) se servisse maggiore reattività.
- Classifica/punteggio a velocità in stile Kahoot.
- Tracciamento presenze ↔ agenda (collegamento a group-lessons/appointments).
- Collegamento risultati live allo storico quiz del singolo allievo (oggi: anonimo).
