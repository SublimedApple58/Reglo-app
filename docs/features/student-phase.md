# Student Phase (Fase del percorso allievo)

Differenzia gli allievi in **TEORIA**, **PRATICA** (foglio rosa) e **PATENTATO**. La fase determina cosa l'allievo può fare in app mobile (vedi `reglo-mobile/docs/features/student-phase.md`) e blocca lato server le azioni non coerenti con la fase.

## Modello dati

`prisma/schema.prisma`:

- `enum AutoscuolaStudentPhase { TEORIA, PRATICA, PATENTATO }`
- `CompanyMember.studentPhase: AutoscuolaStudentPhase @default(PRATICA)` — applicato a tutti i membri (per non-studenti il valore è ignorato).
- La data dell'esame teoria **non è duplicata**: si riusa `AutoscuolaCase.theoryExamAt` (campo già esistente). Per leggere/scrivere si prende il caso più recente del singolo studente.

Migration: `prisma/migrations/20260508203421_add_student_phase`.

## File chiave

| Scope | File |
|------|------|
| Schema | `prisma/schema.prisma` (enum + campo) |
| Server action di update | `lib/actions/autoscuole.actions.ts` → `updateStudentPhase` |
| Booking guard server-side | `lib/actions/autoscuole-availability.actions.ts` → `ensureStudentCanBookFromApp` |
| Endpoint mobile fase corrente | `app/api/autoscuole/me/route.ts` (`GET`) |
| Push reminders fase Teoria | `lib/autoscuole/theory-reminders.ts` (countdown T-7/T-3/T-1 + nudge inattività 5gg) |
| Cron orchestrator | `trigger/autoscuole-reminders.ts` |
| Web dialog titolare | `components/pages/Autoscuole/dialogs/ChangeStudentPhaseDialog.tsx` |
| Web drawer integrazione | `components/pages/Autoscuole/AutoscuoleStudentsPage.tsx` (badge fase + bottone "Cambia fase") |

## Server action

```ts
updateStudentPhase({
  studentId: string,
  phase: "TEORIA" | "PRATICA" | "PATENTATO",
  theoryExamDate?: string | null, // ISO; aggiorna l'AutoscuolaCase più recente
})
```

- Solo OWNER/admin (`canManageStudentCredits`).
- Validazione: se transizione `* → TEORIA` e ci sono `AutoscuolaAppointment` futuri non cancellati per lo studente, **rifiuta** con "Cancellale prima di cambiare fase". Garantisce coerenza con il booking guard.
- Quando `theoryExamDate` è fornito, scrive su `AutoscuolaCase.theoryExamAt` del caso più recente. Se non ci sono casi, l'aggiornamento data viene saltato.

## Booking guard

In `ensureStudentCanBookFromApp` (gate condiviso da `createBookingRequest`, `getAllAvailableSlots`, `getDateAvailabilityMap`): se `phase === "TEORIA"` la richiesta è respinta con messaggio user-facing "Le lezioni di guida saranno disponibili dopo l'esame di teoria.".

## Push notifications (fase TEORIA)

`processAutoscuolaTheoryReminders` (chiamato dal cron `autoscuoleReminders`):

- **Countdown esame** (`kind: theory_exam_countdown`): ogni giorno alle 10:00 locali, finestra ±60s. Per `offsetDays ∈ {7, 3, 1}` invia push agli studenti `TEORIA` con `AutoscuolaCase.theoryExamAt` corrispondente alla data `today + offsetDays`.
- **Nudge inattività** (`kind: theory_quiz_inactivity`): ogni giorno alle 18:00 locali, finestra ±60s. Per ogni studente `TEORIA` senza `QuizSession` negli ultimi 5 giorni, invia push.

Idempotenza: nessun log dedicato; la finestra ±60s e la cron `*/1 * * * *` garantiscono un solo fire al giorno.

## Connessioni

- → **Booking Engine**: blocca `createBookingRequest` se phase = TEORIA.
- → **Quiz Teoria**: il quiz è di fatto utile solo in fase TEORIA (la tab mobile è nascosta nelle altre).
- → **Cases & Deadlines**: riusa `AutoscuolaCase.theoryExamAt` per countdown.
- → **Communications**: nuovo step nel cron `autoscuole-reminders.ts`.
- → **Notifications**: aggiunge i kind `theory_exam_countdown` e `theory_quiz_inactivity`.
- → **Mobile**: cambia totalmente l'esperienza dell'allievo. Vedi `reglo-mobile/docs/features/student-phase.md`.

## Migrazione studenti esistenti

Default a `PRATICA` per tutti i `CompanyMember`. Il titolare sposta manualmente in TEORIA gli studenti che non hanno ancora il foglio rosa.
