# Pronto per l'esame (exam-ready flag)

Segnale **interno** per marcare gli allievi in fase **PRATICA** come "pronti per l'esame". Impostabile da **titolare** (web) e **istruttore** (mobile). **Non vincolante**: non blocca la prenotazione dell'esame né delle guide; serve solo a differenziare visivamente pronti/non-pronti nei picker di creazione esame. Mai esposto all'app allievo.

## Modello dati

`CompanyMember` (`prisma/schema.prisma`):
- `examReady Boolean @default(false)` — il flag
- `examReadyAt DateTime?` — quando è stato messo a true (drive "pronto da N giorni")
- `examReadyBy String? @db.Uuid` — chi (titolare/istruttore) l'ha segnato
- indice `@@index([companyId, examReady])`
- Migrazione: `20260722100000_add_exam_ready`

Auto-clear: `updateStudentPhase` azzera `examReady/At/By` quando l'allievo esce da PRATICA (tipicamente → PATENTATO).

## Files

| File | Ruolo |
|------|-------|
| `lib/actions/autoscuole.actions.ts` | `setStudentExamReady({ studentId, ready })` — permessi **istruttore + titolare + admin** (come la POST esame, NON solo OWNER). Salva `examReadyAt/By`. Espone `examReady` in 4 mapping: `listDirectoryStudents` (picker esame agenda), `getAutoscuolaStudents` (mobile `/students`), `getAutoscuolaStudentsWithProgress` (lista web), `getAutoscuolaStudentDrivingRegister` (dettaglio). Auto-clear in `updateStudentPhase`. |
| `app/api/autoscuole/students/[id]/exam-ready/route.ts` | `PATCH { ready }` → `setStudentExamReady` (usato da mobile). |
| `app/api/autoscuole/instructor-settings/route.ts` | Aggiunge `studentPhase`+`examReady`+`examReadyAt` all'array `students` (fonte primaria del picker esame mobile). |
| `components/pages/Autoscuole/AutoscuoleStudentsPage.tsx` | Toggle "Pronto per l'esame" nel dettaglio (sezione "Esame pratico", solo PRATICA) + pill verde "Pronto" nelle righe + contatore/filtro "Solo pronti" nella lista pratica. |
| `components/pages/Autoscuole/AutoscuoleAgendaPage.tsx` | Picker "Nuovo esame": badge "Pronto" + anello verde sull'avatar + ordinamento pronti-in-cima + tooltip "pronto da N giorni". |

## Comportamento / chicche

- **Cuore**: nei picker esame (web + mobile) i pronti hanno badge "Pronto" + anello verde e **salgono in cima**. Selezionare un non-pronto è comunque permesso (nessun blocco).
- **A (audit)**: tooltip badge web = "Segnato pronto per l'esame da N giorni" (da `examReadyAt`).
- **B (contatore/filtro)**: lista pratica web mostra "N allievi pronti" + toggle "Solo pronti".
- **C (anello)**: avatar dei pronti con ring verde nel picker.
- **D (da N giorni)**: nel dettaglio web "pronto da oggi/N giorni".

## Permessi

`setStudentExamReady` consente istruttore + titolare + admin (mirror di `app/api/autoscuole/exam/route.ts`), a differenza dei toggle vicini (`toggleWeeklyBookingLimitExempt`, `setExamPriorityOverride`) che sono OWNER-only — perché anche l'istruttore da mobile deve poterlo impostare.

## Connessioni

- **Student Phase** ([student-phase.md](student-phase.md)) — `examReady` esiste solo in PRATICA; `updateStudentPhase` lo azzera all'uscita.
- **Exam creation** (`AutoscuoleAgendaPage` web, `exam/route.ts`) — la creazione esame NON è vincolata dal flag.
- **Mobile** — vedi `reglo-mobile/docs/features/exam-ready.md`. Contratto: `examReady`/`examReadyAt`/`studentPhase` su `AutoscuolaStudent` e nell'array `students` di `getInstructorSettings`.
