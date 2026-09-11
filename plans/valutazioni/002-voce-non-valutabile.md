# Voce "non valutabile" nel pagellino (seguito di REG-443)

> **Stato**: in implementazione (2026-09-11).
> Design approvato da Tiziano sulla preview del 2026-09-11 (`/tmp/hiro-design/na-*.png`):
> **mobile = variante C (trattino dedicato accanto alle stelle)**, **web = hover + pillola**,
> **storico = voce mostrata come "— non valutabile"**, **salvataggio = flag esplicito
> `notApplicable`** (con micro-migrazione), **pagellino interamente escludibile** → lo storico
> mostra "Pagellino non applicabile".

## Problema

Oggi il pagellino è tutto-o-niente: ogni voce configurata dall'autoscuola viene salvata con un
punteggio (precompilato a metà scala). Ma non tutte le guide toccano tutti i punti — una guida di
sole manovre non valuta l'autostrada. Serve poter dichiarare una voce **non valutabile su QUESTA
guida**, senza configurazione a priori (niente aggancio a tag o tipo guida: strada esclusa da
Tiziano).

## Decisioni di design

| Superficie | Interazione |
|---|---|
| Mobile, compilazione | Trattino `[—]` a sinistra delle stelle: un tap esclude la voce, un altro la rimette. Attivo = bordo+testo navy. Voce esclusa: stelle vuote grigie e valore "non valutabile" |
| Web, compilazione (dialog "Modifica guida" in agenda) | Hover sulla riga → pillola ghost "Non valutabile" a sinistra delle stelle (le stelle restano ancorate a destra: nessun salto di layout). Riga esclusa: etichetta grigia + chip + link "Ripristina" |
| Storico (web scheda allievo + mobile storico guide) | La voce esclusa **si vede**, come "— non valutabile". Non entra nella media |
| Chip riepilogo | `Pagellino 4,2/5` · `Pagellino 3 voci` (scale miste) · `Pagellino non applicabile` (tutte escluse) |

Scartate: swipe sulla riga (invisibile senza hint, richiede un secondo pattern per l'accessibilità)
e long-press + action sheet (a riposo non comunica nulla).

## Fasi

### Fase 1 — Schema + migrazione (`reglo`)
`AutoscuolaAppointmentEvaluation`: `score Int` → `Int?` (null quando la voce è esclusa) e nuovo
`notApplicable Boolean @default(false)`. Migrazione additiva con la tecnica anti-drift del DB dev
condiviso (`migrate diff` → `db execute` → `migrate resolve --applied` → `generate`), mai
`migrate dev`.

Perché un flag esplicito e non l'assenza della riga: una riga assente è indistinguibile da una
**voce aggiunta al pagellino dopo** quella guida. Col flag lo storico resta leggibile per sempre.

### Fase 2 — Helper puri gemelli
`lib/autoscuole/evaluation-sheet.ts` (web) e `src/utils/evaluationSheet.ts` (mobile):
`evaluationSummary` ignora le voci escluse e ritorna anche `skipped`; nuovo
`evaluationSummaryLabel` che centralizza le tre etichette della chip (media / conteggio /
"non applicabile"). Test unitari aggiornati lato web.

### Fase 3 — Actions + API (`reglo`)
- `updateAppointmentDetailsSchema.evaluations`: `score` nullable + `notApplicable` opzionale;
  validazione = flag vince sul punteggio (escluso ⇒ `score: null`), righe senza né punteggio né
  flag ignorate.
- Scrittura: la sostituzione integrale già esistente scrive anche il flag.
- `getAppointmentEvaluation`: `scores` porta `score: number | null` + `notApplicable`.
- I **tre** select/mapping che espongono `evaluations` (registro guide, ramo non-`light` di
  `getAutoscuolaAppointmentsFiltered`, bootstrap agenda) devono portarsi dietro il flag.

### Fase 4 — Web UI
- `EditAppointmentDialog.tsx`: stato `evalNa` separato da `evalScores` (così "Ripristina" torna al
  voto di prima, non al default), pillola in hover, `evalChanged` considera anche le esclusioni.
- `AutoscuoleStudentsPage.tsx` (`EvaluationRecap`, tab **Note**): riga esclusa come "— non
  valutabile", chip dall'helper.

### Fase 5 — Mobile UI
- `manage-lesson-details.tsx`: trattino + stato `na`, payload con `notApplicable`, riga in sola
  lettura senza trattino.
- `regloApi.ts` (tipi), `IstruttoreHomeScreen.tsx` / `StudentNotesDetailScreen.tsx` (payload +
  chip storico), `manage-lesson.tsx` (riepilogo della card).

### Fase 6 — Docs + verifica
`docs/features/evaluation-sheet.md` su entrambi i repo, INDEX/impact-map se cambia qualcosa di
strutturale. Verifica: unit test web, typecheck+lint su entrambi, **screenshot Playwright dal dev
reale** per il web, e per il mobile un mockup fedele ricavato dal codice finale — il simulatore è
fuori gioco per richiesta di Tiziano (lo verifica lui).

### Fase 7 — Rilascio
`fetch && merge origin/staging` nel branch (entrambi i repo), commit, `ship:staging` + `migrate:staging`
per la migrazione nuova. **Solo staging.**

## Note di compatibilità

- Guide già valutate: nessuna riga ha il flag, `score` resta valorizzato → storico e medie
  identiche a prima.
- App vecchie in giro (nessuno shippa OTA da qui): continuano a mandare `{itemId, score}` senza
  flag → accettato, comportamento invariato.
- Il pagellino tutto-escluso è consentito: le righe esistono, la media non c'è, la chip dice
  "Pagellino non applicabile".
