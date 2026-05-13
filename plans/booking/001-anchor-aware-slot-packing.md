# 001 — Anchor-aware slot packing

> **Stato**: implementato (Fasi 1–4). Deploy in Fase 5.
>
> **What was done**:
> 1. Estratto `lib/autoscuole/slot-packing.ts` con due funzioni pure (`computeFreeIntervalsInRange`, `computeAnchorAwareEntryPoints`).
> 2. Coperto con 18 unit test in `tests/unit/autoscuole/slot-packing.test.ts`.
> 3. Integrato in `getAllAvailableSlots()` (rimpiazza il loop legacy `:00/:30` + cascade `roundedHoursOnly`).
> 4. Integrato in `getDateAvailabilityMap()` per coerenza calendario ↔ slot list.
> 5. Documentato in `docs/features/availability.md`.
>
> API contract verso il mobile invariato. Nessuna modifica di schema, nessuna env var nuova.

## Contesto

Quando un'autoscuola permette agli allievi di auto-prenotarsi guide dall'app, il motore di proposta slot (`getAllAvailableSlots` in `lib/actions/autoscuole-availability.actions.ts`) generava entry-point su una griglia statica :00/:30 (`SLOT_MINUTES = 30`).

Se le durate ammesse non sono allineate alla griglia (es. mix 30/45/60), si formano sistematicamente buchi non prenotabili:
- Allievo A prenota 45 min alle 10:00 → fine 10:45.
- Allievo B cerca 60 min: il sistema gli mostra 11:00 (primo punto griglia disponibile).
- Tra 10:45 e 11:00 rimangono 15 min orfani che nessuno potrà più prenotare.

Gli istruttori si lamentavano: l'agenda finiva piena di buchi da 15 min.

Soluzione: anchor-aware packing. Per ogni "intervallo libero" della giornata calcolato per istruttore, il sistema propone come entry-point l'inizio del buco, la fine del buco meno la durata, e i punti intermedi della griglia che NON creano orfani.

## Decisioni ratificate

1. **Strategia**: algoritmo deterministico anchor-aware. Niente AI nel flusso real-time. AI eventualmente in futuro come *coach* lato istruttore.
2. **Rollout**: default attivo per tutte le company.
3. **Buffer tra guide**: NON incluso. Feature futura — l'algoritmo è progettato per accoglierlo.
4. **Orfani a fine giornata**: tollerati. L'istruttore può sempre usarli manualmente.
5. **Punti intermedi griglia**: mantenuti, ma filtrati se generano orfani sotto la durata minima company.
6. **Durata minima orfano**: `min(clusterSettings.bookingSlotDurations)`.
7. **Scope backend**: `getAllAvailableSlots` + `getDateAvailabilityMap`. `suggestInstructorBooking` non toccato.
8. **`roundedHoursOnly`**: l'anchor vince sempre. Il flag continua a vincolare solo i punti intermedi della griglia (step 60, fase = `range.startMinutes % 60`).
9. **API contract invariato**: nessuna modifica mobile.

## File toccati

### Backend (`reglo/`)

- **`lib/autoscuole/slot-packing.ts`** (nuovo): `FreeInterval` type, `computeFreeIntervalsInRange()`, `computeAnchorAwareEntryPoints()`.
- **`tests/unit/autoscuole/slot-packing.test.ts`** (nuovo): 18 test letterali su tutti gli scenari + edge cases.
- **`lib/actions/autoscuole-availability.actions.ts`**:
  - Aggiunto import dell'helper.
  - `getAllAvailableSlots()`: rimpiazzato il loop legacy con costruzione anchor-aware `allowedEntryMinutes`.
  - `getDateAvailabilityMap()`: stesso pattern, allineando il calendario alla logica slot.
- **`docs/features/availability.md`**: aggiornato con sezione "Anchor-aware slot packing".

### Mobile (`reglo-mobile/`)

Nessuna modifica. L'API ritorna `AvailableSlot[]` con la stessa shape — cambia solo il contenuto.

## Architettura dell'helper

```ts
type FreeInterval = { startMinutes: number; endMinutes: number };

function computeFreeIntervalsInRange(
  windowStart: number,
  windowEnd: number,
  busyIntervals: Array<{ startMinutes: number; endMinutes: number }>,
): FreeInterval[];

function computeAnchorAwareEntryPoints(
  interval: FreeInterval,
  durationMinutes: number,
  minDurationMinutes: number,
  options: { slotGridMinutes: number; gridPhaseMinutes?: number },
): number[];
```

Entrambe pure (no DB, no side effects). Lavorano in minuti dal mezzanotte locale.

### Regola dei punti intermedi

Per un intervallo libero `[s, e]` e durata `D`:
1. **Leading anchor**: `s` se `s + D ≤ e`.
2. **Trailing anchor**: `e - D` se `e - D > s`.
3. **Intermediate ticks**: per ogni `tick` sulla griglia `gridStep` strettamente tra `s` e `e - D`, ammesso solo se:
   - `tick - s == 0 || tick - s ≥ minDuration` (residuo leading utile)
   - `e - (tick + D) == 0 || e - (tick + D) ≥ minDuration` (residuo trailing utile)

`roundedHoursOnly = true` ↔ `gridStep = 60` con fase = `range.startMinutes % 60` (cascade dal range start).

## Comportamento risultante

| Scenario | Slot prima | Slot dopo |
|---|---|---|
| Giornata vuota, disp 9-18, durata 60 | 9:00, 9:30, …, 17:00 | uguale |
| Appuntamento 10:00–10:45, durata 60 | 11:00, 11:30, … | 10:45, 12:00, 13:00, … (no 11:00) |
| Pausa pranzo 13-14, durata 60 | due range trattati indipendentemente | idem, con anchor su edge pranzo |
| 75 min residui fra due appuntamenti, durata 60 | 0 slot | 1 slot (anchor leading); residuo 15 min orfano accettato |
| Slot 60' fra due appuntamenti distanti 60' | 0 slot | 1 slot esatto |

## Performance

- O(N log N) sull'ordinamento appuntamenti per giorno.
- O(K) sui tick della griglia per intervallo libero.
- Trascurabile in pratica (N tipicamente < 20, K < 30).

## Rollback

Revert del commit + redeploy. Nessuno stato persistito.
