# REG-443 — Pagellino di valutazione configurabile per autoscuola

> Stato: **design approvato il 2026-09-10** (secondo giro, versione a stelline). Pronto per l'implementazione.
> Branch: `tizianodifelice1/reg-443-pagellino-di-valutazione-configurabile-per-autoscuola` (reglo + reglo-mobile).
> Rilascio previsto: **solo staging**.

## Contesto

Oggi esiste **una sola** valutazione per guida: `AutoscuolaAppointment.rating` (Int 1-5, stelle), compilata
dall'istruttore nel foglio "Dettagli guida" (`app/(tabs)/home/manage-lesson-details.tsx`) e mostrata nello
storico allievo. REG-443 la estende: ogni autoscuola definisce **le proprie voci** e l'istruttore dà un
punteggio per voce, sulla stessa guida.

## Modello dati (additivo, nessuna modifica a colonne esistenti)

```prisma
model AutoscuolaEvaluationItem {          // le voci del pagellino, per autoscuola
  id         String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  companyId  String    @db.Uuid
  label      String
  scaleMax   Int       @default(5)        // 3 | 5 (la 10 è stata scartata: illeggibile su mobile)
  position   Int                          // ordine del drag&drop
  archivedAt DateTime?                    // niente hard delete: i punteggi storici restano leggibili
  @@index([companyId, position])
}

model AutoscuolaAppointmentEvaluation {   // il punteggio di UNA voce su UNA guida
  id            String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  appointmentId String @db.Uuid
  itemId        String @db.Uuid
  score         Int
  @@unique([appointmentId, itemId])
  @@index([appointmentId])
}
```

`Company.limits.evaluationSheetEnabled` (bool) accende/spegne il pagellino senza cancellare le voci.

Perché tabelle e non JSON nei `limits`: i punteggi devono referenziare una voce con **id stabile** anche
dopo rinomine e riordini, e vanno interrogati per guida. Il riordino tocca solo `position`.

## Backend / API

- `lib/actions/autoscuole-evaluation.actions.ts`: `listEvaluationItems`, `saveEvaluationItems`
  (crea/rinomina/riordina/archivia in una transazione), guardia admin come le altre impostazioni.
- `GET /api/autoscuole/evaluation-items` — l'app istruttore legge le voci attive (entra nel bootstrap agenda
  per non aggiungere una chiamata al caricamento).
- `PATCH /api/autoscuole/appointments/[id]` — esteso con `evaluations?: { itemId, score }[]`, salvate in
  upsert nella stessa richiesta del salvataggio dettagli (nessuna chiamata extra dal foglio).
- Cache: le voci stanno dietro il segmento SETTINGS (Redis, TTL 5 min) → invalidazione al salvataggio.

## Fasi

1. **Schema + migrazione additiva** + rigenerazione client.
2. **Backend**: actions, route, estensione PATCH, invalidazione cache.
3. **Web**: nuovo pane Impostazioni → "Pagellino" (`EvaluationSheetPane.tsx`), drag&drop con `Reorder` di
   `motion` (già in dipendenza, nessuna libreria nuova).
4. **Mobile**: sezione Pagellino dentro il foglio "Dettagli guida" esistente, stelline (quante la scala) precompilate
   al valore medio, `Salva` sticky già presente. Fallback alle stelle quando l'autoscuola non ha voci.
5. **Docs**: `docs/features/evaluation-sheet.md` su entrambi i repo + INDEX + impact-map.
6. **Test + ship su staging** (fetch+merge di staging nei due branch prima di shippare).

## Decisioni prese in autonomia (tecniche)

- Archiviazione invece di cancellazione delle voci: altrimenti i punteggi storici perdono l'etichetta.
- Scale ammesse: **3 o 5 stelline**. La 10 è stata provata in anteprima e scartata da Tiziano: a 20px per stare in riga sul telefono diventa scomoda da centrare col pollice.
- Il default "valore medio" è `ceil(scaleMax / 2)` e **non** viene salvato finché l'istruttore non tocca
  nulla? → no: salviamo comunque tutte le voci al Salva, così una guida valutata ha sempre il pagellino
  completo (altrimenti le medie per allievo sarebbero costruite su campioni diversi).

## Decisioni di prodotto (Tiziano, 2026-09-10)

- **Stelline, non slider/segmented**: ogni voce si vota a stelline, tante quante la sua scala
  (3 o 5). Le stelline sono anche il modo in cui la scala si sceglie e si legge nelle
  impostazioni web ("5 stelline"), così configurazione e app parlano la stessa lingua.
- La **valutazione complessiva a stelle esistente resta** e convive col pagellino.
- Il pagellino è **interno all'autoscuola**: in v1 l'allievo non lo vede nella sua app.
- Alla prima apertura l'autoscuola trova un **modello base di 5 voci a 5 stelline**, rinominabile,
  ri-scalabile e svuotabile ("Parti da zero").

Nota di resa: stelline a 27px sulla scala 5 e 30px sulla scala 3, entrambe comode col pollice.

## Cosa è stato fatto

(da compilare a fine implementazione)
