# Quiz Teoria Patente

Quiz ministeriali per la teoria della patente. Pool globale di domande condiviso tra tutte le autoscuole, feature-gated per company.

## Data Model

### Global tables (no companyId)

- **QuizChapter** — 25 capitoli ministeriali (`chapterNumber` 1-25, `description`)
- **QuizHint** — 459 spiegazioni HTML (`externalId`, `title`, `descriptionHtml`)
- **QuizQuestion** — 7.165 domande vero/falso (`externalId`, `argumentId`, `chapterId` FK, `hintId` FK nullable, `imageKey` nullable, `questionText`, `correctAnswer`)

### Student tables (companyId + studentId)

- **QuizSession** — una per tentativo (`mode` EXAM/CHAPTER/REVIEW, `questionIds[]`, `status`, `correctCount`, `wrongCount`, `passed`, `timeLimitSec`)
- **QuizAnswer** — una per risposta (`sessionId` FK, `questionId` FK, `studentAnswer`, `isCorrect`)
- **QuizStudentQuestionStat** — stats aggregate per domanda per studente (unique `[companyId, studentId, questionId]`)

### Enum

- **QuizSessionMode**: `EXAM`, `CHAPTER`, `REVIEW`

## Feature Flag

`ServiceLimits.quizEnabled` (boolean, default `false`). Toggled from backoffice.

## Files

### Backend

| File | Purpose |
|------|---------|
| `prisma/schema.prisma` | 6 modelli + enum |
| `lib/services.ts` | `quizEnabled` in ServiceLimits |
| `lib/autoscuole/quiz-engine.ts` | Algoritmi generazione domande (exam, chapter, review) |
| `lib/actions/autoscuole-quiz.actions.ts` | Server actions (getChapters, startSession, submitAnswer, complete, abandon, getResult, getStats, getStudentsOverview) |
| `lib/actions/autoscuole-settings.actions.ts` | `quizEnabled` toggle |
| `lib/autoscuole/cache.ts` | `QUIZ` cache segment |
| `app/api/autoscuole/quiz/**` | 8 API routes |
| `scripts/quiz-seed.ts` | Seed 25 capitoli + 459 hints + 7165 domande |
| `scripts/quiz-upload-images.ts` | Upload 413 immagini GIF su R2 |

### Web App

| File | Purpose |
|------|---------|
| `components/pages/Backoffice/BackofficeCompaniesPage.tsx` | Toggle quiz per company |
| `app/[locale]/autoscuole/quiz-stats/page.tsx` | Owner stats page |
| `components/pages/QuizStats/QuizStudentStatsPage.tsx` | Tabella statistiche studenti |
| `components/Layout/AppSidebar.tsx` | Link "Quiz Patente" nella sidebar |

## Quiz Engine

### Exam (30 domande, 20 min, max 3 errori)
- Cap 1-10: 2 domande random ciascuno = 20
- Cap 11-25: 10 capitoli random su 15, 1 domanda ciascuno = 10
- Escludi domande delle ultime 3 sessioni esame
- Auto-fail se wrongCount > 3

### Chapter (max 20 domande)
- Priorità: mai viste > sbagliate > corrette

### Review (max 20 domande)
- Domande con timesCorrect < timesAnswered
- Ordine: ratio peggiore prima, poi più vecchie
- Se < 10 errori, completa con domande dai capitoli deboli

## readinessScore (0-100)

Media pesata:
- % domande tentate su totale (peso 30%)
- % risposte corrette su tentate (peso 40%)
- % ultimi 3 esami superati (peso 30%)

## API Routes

| Route | Method | Action |
|-------|--------|--------|
| `/api/autoscuole/quiz/chapters` | GET | getQuizChapters |
| `/api/autoscuole/quiz/sessions` | POST | startQuizSession |
| `/api/autoscuole/quiz/sessions/[id]` | GET | getQuizSessionResult |
| `/api/autoscuole/quiz/sessions/[id]/answer` | POST | submitQuizAnswer |
| `/api/autoscuole/quiz/sessions/[id]/complete` | POST | completeQuizSession |
| `/api/autoscuole/quiz/sessions/[id]/abandon` | POST | abandonQuizSession |
| `/api/autoscuole/quiz/stats` | GET | getQuizStudentStats |
| `/api/autoscuole/quiz/stats/owner` | GET | getQuizStudentsOverview |

## Images

413 GIF ministeriali su Cloudflare R2 con key `quiz/images/{NNN}.gif`. URL pubblica via `R2_PUBLIC_BASE_URL`.

## Connected Features

- **Settings**: `quizEnabled` flag in CompanyService.limits
- **Cache**: `QUIZ` segment, invalidated on answer/complete
- **Mobile**: QuizHomeScreen, QuizSessionScreen, QuizResultsScreen
- **Backoffice**: toggle in company drawer
