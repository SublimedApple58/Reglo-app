# Situazione quiz nel dettaglio allievo (REG-445 + REG-446)

Tab **"Quiz"** nel drawer del dettaglio allievo della sezione Allievi (web, lato
titolare/staff). Porta in web app la stessa situazione quiz che l'allievo vede
nella home quiz dell'app mobile, più due blocchi pensati per chi insegna:
progressi argomento per argomento e domande più sbagliate.

Include la **% di simulazioni esami superate** (ex REG-446, accorpata in REG-445).

Sola lettura: nessun nuovo modello, nessuna migrazione. I dati arrivano dalle
sessioni quiz già prodotte dall'app mobile (vedi [quiz-theory.md](quiz-theory.md)).

## Tab per fase allievo

La composizione dei tab del drawer dipende da `CompanyMember.studentPhase`
(vedi [student-phase.md](student-phase.md)):

| Fase | Tab mostrati |
|------|--------------|
| `AWAITING`, `TEORIA` | Riepilogo · **Quiz** |
| `PRATICA` (foglio rosa), `PATENTATO` | Riepilogo · **Quiz** · Guide · Note |

Prima del foglio rosa l'allievo non guida: la reportistica guide/note sarebbe
vuota e viene nascosta. Dal foglio rosa in poi i tab guide/note **si aggiungono**
a Quiz, non lo sostituiscono.

Se la fase cambia mentre il drawer è aperto (dialog "Cambia fase") e il tab
attivo sparisce, il drawer torna su "Riepilogo".

## Stati di placeholder

Il pannello ha tre placeholder, in ordine di precedenza:

1. **`'TEORIA' ∉ limits.phasesEnabled`** → "Fase teoria non attiva". È il
   placeholder richiesto per le autoscuole che non hanno la fase teoria: il tab
   resta visibile ma non c'è reportistica da mostrare. In questo caso il
   frontend **non chiama nemmeno il backend**.
2. **`quizSeatGrantedAt === null`** → "Licenza quiz non assegnata" (l'allievo non
   può esercitarsi dall'app; la licenza si assegna dal Riepilogo).
3. **Nessuna sessione e nessuna domanda vista** → "Nessun quiz svolto".

## File

| Scope | File |
|------|------|
| Server action | `lib/actions/autoscuole-quiz.actions.ts` → `getQuizStudentDetailForStaff(studentId)` |
| Pannello + tipo `StudentQuizDetail` | `components/pages/Autoscuole/StudentQuizPanel.tsx` |
| Drawer allievo (tab + fetch pigra) | `components/pages/Autoscuole/AutoscuoleStudentsPage.tsx` (`DrawerTab`, `drawerTabs`, `loadQuizDetail`) |

## `getQuizStudentDetailForStaff`

Guard:
- `requireServiceAccess("AUTOSCUOLE")`
- uno **studente** può leggere solo il proprio `studentId` (staff e titolare
  leggono qualunque allievo della propria autoscuola)
- lo studente deve essere `STUDENT` della stessa `companyId` (altrimenti
  "Allievo non trovato") — stesso pattern di `getAutoscuolaStudentDrivingRegister`

Cache: segmento `QUIZ`, scope `{ action: "studentDetailStaff", studentId }`, TTL
1h. Invalidata dall'intero segmento a ogni risposta/completamento sessione, come
il resto del quiz.

Dati restituiti:

```ts
{
  hasQuizAccess, quizSeatGrantedAt, studentPhase,
  totalSessions, examsTaken, examsPassed, examsFailed,
  examPassRate,          // REG-446: % simulazioni EXAM superate
  readinessScore,        // stessa formula della home quiz mobile
  coverage: { totalQuestions, attemptedCount, correctCount, attemptedPct, accuracyPct },
  lastActivityAt,
  chaptersProgress[],    // tutti i 25 capitoli + correctRate (null se mai affrontato)
  weakChapters[],        // top 5 sotto il 70%
  mostWrongQuestions[],  // top 8 per numero di errori
  recentSessions[],      // ultime 8
}
```

`readinessScore` ed `examPassRate` riusano **la stessa formula** di
`getQuizStudentStats` (la action che alimenta la home quiz mobile), così i numeri
che vede il titolare e quelli che vede l'allievo coincidono. Se cambia la formula
va cambiata in entrambe.

> **NB**: `autoscuole-quiz.actions.ts` è un file `"use server"` → niente
> `export type`. Il tipo `StudentQuizDetail` vive in `StudentQuizPanel.tsx`.

## Performance

La fetch è **pigra**: parte solo quando il tab "Quiz" viene aperto, una volta per
allievo (`quizRequestedForRef`), e mai se la fase teoria non è attiva. Aprire il
dettaglio di un allievo in PRATICA non paga nessuna query in più.

## Connessioni

- ← **Quiz Teoria**: legge `QuizSession`, `QuizStudentQuestionStat`,
  `QuizQuestion`, `QuizChapter`. Nessuna scrittura.
- ← **Student Phase + Quiz Seats**: `studentPhase` decide i tab, `quizSeatGrantedAt`
  decide il placeholder "licenza non assegnata", `limits.phasesEnabled` il
  placeholder "fase teoria non attiva".
- → **Mobile**: nessuna modifica necessaria. La % simulazioni superate era già
  esposta nella home quiz mobile (`QuizHomeScreen`, card "Tasso successo") dalla
  stessa `getQuizStudentStats`.
- **Cache**: segmento `QUIZ` condiviso con le altre action quiz.
